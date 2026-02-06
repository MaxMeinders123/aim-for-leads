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
    console.log("[receive-prospect-results] Request received:", JSON.stringify(body, null, 2));

    const {
      user_id,
      company_domain,
      company_research_id,
      company_id,
      salesforce_account_id,
      salesforce_campaign_id,
      // Single prospect fields - sent directly, not in an array
      first_name,
      last_name,
      job_title,
      title,
      linkedin_url,
      linkedin,
      priority,
      priority_reason,
      pitch_type,
    } = body;

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

    // Find the company_research record
    let companyResearchId = company_research_id;
    let resolvedCompanyId = company_id;
    let resolvedSalesforceAccountId = salesforce_account_id;
    
    if (!companyResearchId && company_domain) {
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

    // Generate a unique personal_id for Clay tracking
    const personalId = crypto.randomUUID();
    
    // Sanitize string fields to max length
    const sanitize = (val: unknown, maxLen = 500): string | null => {
      if (typeof val !== 'string') return null;
      return val.substring(0, maxLen).trim() || null;
    };

    // Build single prospect insert - one prospect per request
    const prospectInsert: Record<string, any> = {
      user_id,
      first_name: sanitize(first_name, 100),
      last_name: sanitize(last_name, 100),
      job_title: sanitize(job_title || title, 200),
      linkedin_url: sanitize(linkedin_url || linkedin, 500),
      priority: sanitize(priority, 20),
      priority_reason: sanitize(priority_reason, 500),
      pitch_type: sanitize(pitch_type, 100),
      raw_data: body,
      sent_to_clay: false,
      status: 'pending',
      personal_id: personalId,
      // ALWAYS set these from the original research request
      salesforce_account_id: resolvedSalesforceAccountId || null,
      salesforce_campaign_id: salesforce_campaign_id || null,
    };

    // Add company_research_id if we have it
    if (companyResearchId && uuidRegex.test(companyResearchId)) {
      prospectInsert.company_research_id = companyResearchId;
    }

    // Add company_id if we have it
    if (resolvedCompanyId) {
      prospectInsert.company_id = resolvedCompanyId;
    }

    console.log("[receive-prospect-results] Inserting prospect:", prospectInsert);

    const { data: insertedProspect, error: insertError } = await supabase
      .from("prospect_research")
      .insert(prospectInsert)
      .select("id, personal_id")
      .single();

    if (insertError) {
      console.error("[receive-prospect-results] Insert error:", insertError.message);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[receive-prospect-results] Prospect saved:", insertedProspect.id);

    return new Response(
      JSON.stringify({ 
        received: true,
        company_research_id: companyResearchId,
        company_id: resolvedCompanyId,
        prospect_id: insertedProspect.id,
        personal_id: insertedProspect.personal_id,
        salesforce_account_id: resolvedSalesforceAccountId,
        salesforce_campaign_id: salesforce_campaign_id,
        status: "completed",
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
