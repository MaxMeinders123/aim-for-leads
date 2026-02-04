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
    console.log("[receive-prospect-results] Payload:", JSON.stringify(body, null, 2));

    const { 
      user_id, 
      company_domain, 
      company_research_id, 
      company_id, // New: direct company_id from companies table
      salesforce_account_id,
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
    console.log("[receive-prospect-results] Parsed prospect_data:", prospect_data);

    // Validate required fields
    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "user_id is required and must be a string" }),
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

    // Look up company from companies table if we have company_id
    if (resolvedCompanyId && !resolvedSalesforceAccountId) {
      const { data: company } = await supabase
        .from("companies")
        .select("id, salesforce_account_id")
        .eq("id", resolvedCompanyId)
        .single();

      if (company) {
        resolvedSalesforceAccountId = company.salesforce_account_id;
      }
    }

    // Extract contacts array from prospect_data
    const contacts = prospect_data?.contacts || (Array.isArray(prospect_data) ? prospect_data : []);
    
    // Insert each prospect as a separate row
    const insertedProspects: string[] = [];
    
    for (const contact of contacts) {
      // Generate a unique personal_id for Clay tracking
      const personalId = crypto.randomUUID();

      const prospectInsert: Record<string, any> = {
        user_id,
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        job_title: contact.job_title || contact.title || null,
        linkedin_url: contact.linkedin || contact.linkedin_url || null,
        priority: contact.priority || null,
        priority_reason: contact.priority_reason || null,
        pitch_type: contact.pitch_type || contact.title || null,
        raw_data: contact,
        sent_to_clay: false,
        status: 'pending',
        personal_id: personalId,
      };

      // Add company_research_id if we have it
      if (companyResearchId) {
        prospectInsert.company_research_id = companyResearchId;
      }

      // Add company_id if we have it
      if (resolvedCompanyId) {
        prospectInsert.company_id = resolvedCompanyId;
      }

      // Add salesforce_account_id if available
      if (resolvedSalesforceAccountId) {
        prospectInsert.salesforce_account_id = resolvedSalesforceAccountId;
      }

      const { data: insertedProspect, error: insertError } = await supabase
        .from("prospect_research")
        .insert(prospectInsert)
        .select("id")
        .single();

      if (insertError) {
        console.error("[receive-prospect-results] Insert error for contact:", insertError);
      } else {
        insertedProspects.push(insertedProspect.id);
      }
    }

    console.log("[receive-prospect-results] Inserted prospects:", insertedProspects.length);

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

      console.log("[receive-prospect-results] Updated legacy record:", legacyId);
    }

    return new Response(
      JSON.stringify({ 
        received: true,
        company_research_id: companyResearchId,
        company_id: resolvedCompanyId,
        prospects_inserted: insertedProspects.length,
        prospect_ids: insertedProspects,
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
