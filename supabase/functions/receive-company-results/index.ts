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
    console.log("[receive-company-results] Request received");

    // Extract fields - support multiple formats from n8n
    const {
      user_id,
      company_domain,
      campaign_id,
      salesforce_account_id,
      status,
      error_message
    } = body;
    const rawText = body.company || body[" company"] || body.text;

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
        console.error("[receive-company-results] Failed to parse text as JSON:", e);
        return null;
      }
    };

    const company_data = parseTextToJson(rawText);

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

    if (!company_domain || typeof company_domain !== 'string') {
      return new Response(
        JSON.stringify({ error: "company_domain is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate company_domain format and length
    if (company_domain.length > 255 || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(company_domain)) {
      return new Response(
        JSON.stringify({ error: "Invalid company_domain format" }),
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
        campaign_id: campaign_id || null,
        salesforce_account_id: salesforce_account_id || null,
        company_name: companyName,
        status: status === "rejected" ? "failed" : "completed",
        company_status: companyStatus,
        acquired_by: acquiredBy,
        cloud_provider: cloudProvider,
        cloud_confidence: cloudConfidence,
        evidence_urls: evidenceUrls,
        raw_data: company_data,
        error_message: error_message || null,
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

    console.log("[receive-company-results] Company research saved");

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
    }

    // Auto-trigger prospect research for companies that are valid targets:
    // - "Operating" companies
    // - "Acquired" companies that still operate independently
    // - "Renamed" companies (same business, different name)
    const stillOperates = company_data?.stillOperatesIndependently === true;
    const shouldTriggerProspects =
      companyStatus === "Operating" ||
      (companyStatus === "Acquired" && stillOperates) ||
      companyStatus === "Renamed";

    if (shouldTriggerProspects) {
      try {
        // Get webhook URL from user_integrations (fall back to default)
        const DEFAULT_PROSPECT_WEBHOOK = "https://engagetech12.app.n8n.cloud/webhook/845a71b9-f7fd-4466-9599-3cb79e34d3a4";

        const { data: integrations } = await supabase
          .from("user_integrations")
          .select("people_research_webhook_url")
          .eq("user_id", user_id)
          .maybeSingle();

        const prospectWebhookUrl = integrations?.people_research_webhook_url || DEFAULT_PROSPECT_WEBHOOK;

        // Look up campaign data to build the prospect payload
        let campaignContext: Record<string, unknown> = {};
        if (campaign_id) {
          const { data: campaign } = await supabase
            .from("campaigns")
            .select("name, product, product_category, primary_angle, secondary_angle, target_region, pain_points, personas, job_titles, target_verticals, technical_focus")
            .eq("id", campaign_id)
            .maybeSingle();

          if (campaign) {
            campaignContext = {
              campaignName: campaign.name || "",
              product: campaign.product || "",
              productCategory: campaign.product_category || "",
              primaryAngle: campaign.primary_angle || "",
              secondaryAngle: campaign.secondary_angle || "",
              targetRegion: campaign.target_region || "",
              painPoints: campaign.pain_points || "",
              targetPersonas: campaign.personas || "",
              targetTitles: campaign.job_titles || "",
              targetVerticals: campaign.target_verticals || "",
              techFocus: campaign.technical_focus || "",
            };
          }
        }

        // Look up company info from companies table
        let companyInfo: Record<string, string> = {
          name: companyName || company_domain,
          website: company_domain,
          linkedin: "",
        };

        if (campaign_id) {
          const { data: companyRecords } = await supabase
            .from("companies")
            .select("name, website, linkedin_url, salesforce_account_id")
            .eq("campaign_id", campaign_id);

          const matchingCompany = companyRecords?.find((c: { name: string; website?: string | null }) => {
            const domain = c.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
            return domain === company_domain || c.name.toLowerCase().replace(/\s+/g, "") === company_domain;
          });

          if (matchingCompany) {
            companyInfo = {
              name: matchingCompany.name || company_domain,
              website: matchingCompany.website || company_domain,
              linkedin: matchingCompany.linkedin_url || "",
            };
          }
        }

        // Build prospect payload matching n8n webhook expectations
        const prospectPayload = {
          user_id,
          campaign_id: campaign_id || null,
          company_research_id: insertedRecord.id,
          company_domain,
          salesforce_account_id: salesforce_account_id || null,
          salesforce_campaign_id: body.salesforce_campaign_id || null,
          campaign: campaignContext,
          company: companyInfo,
          companyResearch: company_data,
          qualify: true,
        };

        // Trigger prospect webhook. n8n may take minutes for AI processing,
        // so we can't fully await the response (edge function would timeout).
        // Instead, fire the request and wait briefly to ensure it transmits.
        // The HTTP request body is sent immediately on fetch(), so n8n
        // receives and processes it independently of our response.
        const prospectFetch = fetch(prospectWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prospectPayload),
        }).then(res => {
          console.log("[receive-company-results] Prospect webhook response:", res.status);
          return res;
        }).catch(error => {
          console.error("[receive-company-results] Failed to trigger prospect research:", error);
        });

        // Wait up to 10s for n8n to accept the request, then move on
        await Promise.race([
          prospectFetch,
          new Promise(resolve => setTimeout(resolve, 10000)),
        ]);

        console.log("[receive-company-results] Prospect research auto-triggered");
      } catch (triggerError) {
        console.error("[receive-company-results] Error auto-triggering prospect research:", triggerError);
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
