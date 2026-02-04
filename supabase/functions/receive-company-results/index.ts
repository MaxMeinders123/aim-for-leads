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
    console.log("[receive-company-results] Payload:", JSON.stringify(body, null, 2));

    // Extract fields - support multiple formats from n8n
    const {
      user_id,
      company_domain,
      status,
      error_message,
      salesforce_campaign_id,
      salesforce_account_id,
      campaign_company_id
    } = body;
    const rawText = body.company || body[" company"] || body.text;

    // Parse raw LLM text (may have ```json fences) into structured JSON
    const parseTextToJson = (rawText?: string): any => {
      if (!rawText) return null;
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/g, '')
        .trim();
      if (!cleaned) return null;
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        console.error("[receive-company-results] Failed to parse text as JSON:", e);
        return null;
      }
    };

    const company_data = parseTextToJson(rawText);
    console.log("[receive-company-results] Parsed company_data:", company_data);

    // Validate required fields
    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "user_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company_domain || typeof company_domain !== 'string') {
      return new Response(
        JSON.stringify({ error: "company_domain is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate that company data was provided (even if parsing failed, we should have raw text)
    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "company data is required (expected 'company' field)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract normalized fields from company_data
    const companyName = company_data?.company || null;
    const companyStatus = company_data?.company_status || null;
    const acquiredBy = company_data?.acquiredBy || null;
    const cloudProvider = company_data?.cloud_preference?.provider || null;
    const cloudConfidence = company_data?.cloud_preference?.confidence || null;
    const evidenceUrls = company_data?.cloud_preference?.evidence_urls || null;

    // Insert into company_research table
    const { data: insertedRecord, error: insertError } = await supabase
      .from("company_research")
      .insert({
        user_id,
        company_domain,
        company_name: companyName,
        status: status === "rejected" ? "failed" : "completed",
        company_status: companyStatus,
        acquired_by: acquiredBy,
        cloud_provider: cloudProvider,
        cloud_confidence: cloudConfidence,
        evidence_urls: evidenceUrls,
        raw_data: company_data,
        error_message: error_message || null,
        salesforce_campaign_id: salesforce_campaign_id || null,
        salesforce_account_id: salesforce_account_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[receive-company-results] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[receive-company-results] Inserted company research:", insertedRecord.id);

    // Update campaign_companies table if this came from campaign import
    if (campaign_company_id) {
      await supabase
        .from("campaign_companies")
        .update({
          status: 'completed',
          company_research_id: insertedRecord.id
        })
        .eq("id", campaign_company_id);

      console.log("[receive-company-results] Updated campaign_companies:", campaign_company_id);
    }

    // Also update the legacy research_results table for backwards compatibility
    const { data: existingLegacy } = await supabase
      .from("research_results")
      .select("id")
      .eq("user_id", user_id)
      .eq("company_domain", company_domain)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLegacy) {
      await supabase
        .from("research_results")
        .update({
          company_data: company_data,
          status: status === "rejected" ? "rejected" : "company_complete",
          error_message: error_message || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLegacy.id);

      console.log("[receive-company-results] Updated legacy record:", existingLegacy.id);
    }

    // Auto-trigger prospect research if company is operating and we have the payload
    if (companyStatus === "Operating" && body.original_payload) {
      console.log("[receive-company-results] Auto-triggering prospect research...");

      // Get webhook URL from user_integrations
      const { data: integrations } = await supabase
        .from("user_integrations")
        .select("people_research_webhook_url")
        .eq("user_id", user_id)
        .single();

      if (integrations?.people_research_webhook_url) {
        // Build prospect payload with company_research_id
        const prospectPayload = {
          ...body.original_payload,
          company_research_id: insertedRecord.id,
          company_data: company_data,
        };

        // Trigger prospect webhook asynchronously (don't wait for response)
        fetch(integrations.people_research_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prospectPayload),
        }).catch((err) => {
          console.error("[receive-company-results] Failed to trigger prospect webhook:", err);
        });

        console.log("[receive-company-results] Prospect research webhook triggered");
      }
    }

    return new Response(
      JSON.stringify({
        received: true,
        id: insertedRecord.id,
        company_research_id: insertedRecord.id,
        status: status === "rejected" ? "failed" : "completed",
        message: "Company research saved. Ready for prospect research.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[receive-company-results] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
