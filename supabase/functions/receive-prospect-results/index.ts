import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("[receive-prospect-results] Request received");

    const {
      user_id,
      campaign_id,
      company_domain,
      company_research_id,
      company_id, // direct company_id from companies table
      salesforce_account_id,
      salesforce_campaign_id,
      research_result_id,
      status,
      error_message
    } = body;
    const rawText = body.prospect || body.text || body.prospects;

    // Parse raw LLM text (may have ```json fences) into structured JSON
    const parseTextToJson = (rawText?: string | object): any => {
      if (!rawText) return null;
      if (typeof rawText === 'object') return rawText;
      
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/g, '')
        .trim();
      if (!cleaned) return null;
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        console.error("[receive-prospect-results] Failed to parse text as JSON:", e);
        return null;
      }
    };

    const prospect_data = parseTextToJson(rawText);

    // Validate required fields
    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "user_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate user_id format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user_id)) {
      return new Response(
        JSON.stringify({ error: "user_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user exists in profiles table
    const { data: userExists, error: userError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (userError || !userExists) {
      return new Response(
        JSON.stringify({ error: "Invalid user_id - user not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate that prospect data was provided
    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "prospect data is required (expected 'prospect', 'text', or 'prospects' field)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the company_research record
    let companyResearchId = company_research_id;
    let resolvedCompanyId = company_id;
    let resolvedSalesforceAccountId = salesforce_account_id;
    
    if (!companyResearchId && company_domain) {
      // Try to find by user_id and company_domain
      const { data: companyRecord } = await supabase
        .from("company_research")
        .select("id")
        .eq("user_id", user_id)
        .eq("company_domain", company_domain)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (companyRecord) {
        companyResearchId = companyRecord.id;
      }
    }

    // Look up company from companies table to get all Salesforce and campaign IDs
    let resolvedCampaignId = campaign_id;
    let resolvedSalesforceCampaignId = salesforce_campaign_id;

    if (resolvedCompanyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("id, salesforce_account_id, campaign_id, salesforce_campaign_id")
        .eq("id", resolvedCompanyId)
        .single();

      if (company) {
        if (!resolvedSalesforceAccountId) resolvedSalesforceAccountId = company.salesforce_account_id;
        if (!resolvedCampaignId) resolvedCampaignId = company.campaign_id;
        if (!resolvedSalesforceCampaignId) resolvedSalesforceCampaignId = company.salesforce_campaign_id;
      }
    }

    // Extract contacts array from prospect_data
    const contacts = prospect_data?.contacts || (Array.isArray(prospect_data) ? prospect_data : []);

    // Limit array size to prevent DoS
    const MAX_CONTACTS = 100;
    if (contacts.length > MAX_CONTACTS) {
      return new Response(
        JSON.stringify({ error: `Too many contacts (max ${MAX_CONTACTS})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // LinkedIn URL validation and normalization
    const linkedinPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?$/;
    const validateLinkedInUrl = (url: string | null | undefined): { url: string | null; validated: boolean } => {
      if (!url || typeof url !== 'string') return { url: null, validated: false };

      let cleaned = url.trim();
      if (!cleaned) return { url: null, validated: false };

      // Add https:// if missing protocol
      if (cleaned.startsWith('linkedin.com') || cleaned.startsWith('www.linkedin.com')) {
        cleaned = 'https://' + cleaned;
      }

      // Remove trailing slash
      cleaned = cleaned.replace(/\/$/, '');

      // Validate format
      if (!linkedinPattern.test(cleaned)) {
        console.log(`[receive-prospect-results] Invalid LinkedIn URL format: ${url}`);
        return { url: cleaned, validated: false };
      }

      return { url: cleaned, validated: true };
    };

    // Check for duplicate prospects (same name + company_research)
    const existingProspects = companyResearchId ? await supabase
      .from("prospect_research")
      .select("first_name, last_name, linkedin_url")
      .eq("company_research_id", companyResearchId)
      .eq("user_id", user_id) : { data: [] };

    const existingNames = new Set(
      (existingProspects.data || []).map(
        (p: { first_name: string; last_name: string }) =>
          `${(p.first_name || '').toLowerCase()}_${(p.last_name || '').toLowerCase()}`
      )
    );

    // Extract linkedin stats if provided by n8n validation step
    const linkedinStats = prospect_data?.linkedin_stats || null;
    if (linkedinStats) {
      console.log(`[receive-prospect-results] LinkedIn stats from n8n: ${JSON.stringify(linkedinStats)}`);
    }

    // Insert each prospect as a separate row
    const insertedProspects: string[] = [];
    const skippedDuplicates: string[] = [];

    for (const contact of contacts) {
      // Generate a unique personal_id for Clay tracking
      const personalId = crypto.randomUUID();

      // Sanitize string fields to max length
      const sanitize = (val: unknown, maxLen = 500): string | null => {
        if (typeof val !== 'string') return null;
        return val.substring(0, maxLen).trim() || null;
      };

      // Check for duplicates
      const nameKey = `${(contact.first_name || '').toLowerCase()}_${(contact.last_name || '').toLowerCase()}`;
      if (existingNames.has(nameKey)) {
        console.log(`[receive-prospect-results] Skipping duplicate: ${contact.first_name} ${contact.last_name}`);
        skippedDuplicates.push(nameKey);
        continue;
      }
      existingNames.add(nameKey);

      // Validate LinkedIn URL
      const linkedinResult = validateLinkedInUrl(contact.linkedin || contact.linkedin_url);

      // ALWAYS include salesforce_campaign_id and salesforce_account_id from the original request
      const prospectInsert: Record<string, any> = {
        user_id,
        first_name: sanitize(contact.first_name, 100),
        last_name: sanitize(contact.last_name, 100),
        job_title: sanitize(contact.job_title || contact.title, 200),
        linkedin_url: linkedinResult.url,
        priority: sanitize(contact.priority, 20),
        priority_reason: sanitize(contact.priority_reason, 500),
        pitch_type: sanitize(contact.pitch_type || contact.title, 100),
        raw_data: {
          ...contact,
          linkedin_validated: linkedinResult.validated,
          linkedin_source: contact.linkedin_source || 'unknown',
        },
        sent_to_clay: false,
        status: 'pending',
        personal_id: personalId,
        // ALWAYS set these from resolved values (request or companies table lookup)
        salesforce_account_id: resolvedSalesforceAccountId || null,
        salesforce_campaign_id: resolvedSalesforceCampaignId || null,
      };

      // Add company_research_id if we have it
      if (companyResearchId && uuidRegex.test(companyResearchId)) {
        prospectInsert.company_research_id = companyResearchId;
      }

      // Add company_id if we have it
      if (resolvedCompanyId) {
        prospectInsert.company_id = resolvedCompanyId;
      }

      // Add campaign_id if we have it
      if (resolvedCampaignId) {
        prospectInsert.campaign_id = resolvedCampaignId;
      }

      const { data: insertedProspect, error: insertError } = await supabase
        .from("prospect_research")
        .insert(prospectInsert)
        .select("id")
        .single();

      if (insertError) {
        console.error("[receive-prospect-results] Insert error:", insertError.message);
      } else {
        insertedProspects.push(insertedProspect.id);
      }
    }

    console.log("[receive-prospect-results] Prospects saved:", insertedProspects.length);

    // Update legacy research_results table for backwards compatibility
    let legacyId = research_result_id;
    
    if (!legacyId && company_domain) {
      const { data: existingRecord } = await supabase
        .from("research_results")
        .select("id")
        .eq("user_id", user_id)
        .eq("company_domain", company_domain)
        .in("status", ["company_complete", "prospects_pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRecord) {
        legacyId = existingRecord.id;
      }
    }

    if (legacyId) {
      await supabase
        .from("research_results")
        .update({
          prospect_data: prospect_data || null,
          status: status === "rejected" ? "rejected" : "completed",
          error_message: error_message || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", legacyId);
    }

    return new Response(
      JSON.stringify({
        received: true,
        company_research_id: companyResearchId,
        company_id: resolvedCompanyId,
        prospects_inserted: insertedProspects.length,
        prospects_skipped_duplicate: skippedDuplicates.length,
        prospect_ids: insertedProspects,
        linkedin_stats: linkedinStats,
        status: status === "rejected" ? "rejected" : "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[receive-prospect-results] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
