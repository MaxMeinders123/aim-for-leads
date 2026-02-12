import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("[send-prospect-to-clay] Payload:", JSON.stringify(body, null, 2));

    const { prospect_id, prospect_ids, user_id } = body;

    // Validate user_id is provided
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Support single or multiple prospect IDs
    const idsToSend: string[] = prospect_ids || (prospect_id ? [prospect_id] : []);

    if (idsToSend.length === 0) {
      return new Response(
        JSON.stringify({ error: "prospect_id or prospect_ids is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve Clay webhook URL: user_integrations → env secret fallback
    const { data: integrationData } = await supabase
      .from("user_integrations")
      .select("clay_webhook_url")
      .eq("user_id", user_id)
      .maybeSingle();

    const clayWebhookUrl = integrationData?.clay_webhook_url || Deno.env.get("DEFAULT_CLAY_WEBHOOK");
    
    if (!clayWebhookUrl) {
      return new Response(
        JSON.stringify({ error: "Clay webhook URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { prospect_id: string; success: boolean; error?: string }[] = [];

    for (const prospectId of idsToSend) {
      try {
        // Get prospect data with company info from companies table
        // SECURITY: Filter by user_id to prevent accessing other users' prospects
        const { data: prospect, error: prospectError } = await supabase
          .from("prospect_research")
          .select(`
            *,
            companies:company_id (
              id,
              name,
              website,
              salesforce_account_id,
              salesforce_campaign_id,
              campaign_id
            )
          `)
          .eq("id", prospectId)
          .eq("user_id", user_id)
          .single();

        if (prospectError || !prospect) {
          results.push({ prospect_id: prospectId, success: false, error: "Prospect not found" });
          continue;
        }

        // Check if already successfully enriched by Clay
        // Allow retry for: pending, fail, duplicate, sent_to_clay (stuck)
        // Block only for: new, update, inputted (successful enrichments)
        const successStatuses = ['new', 'update', 'inputted'];
        if (successStatuses.includes(prospect.status)) {
          console.log(`[send-prospect-to-clay] Prospect ${prospectId} already successfully enriched with status: ${prospect.status}`);
          results.push({ prospect_id: prospectId, success: false, error: `Already successfully enriched (status: ${prospect.status})` });
          continue;
        }

        // Generate personal_id if not exists
        const personalId = prospect.personal_id || crypto.randomUUID();

        // Generate a session_id for this request so Clay can match it back
        const sessionId = crypto.randomUUID();

        // Build the callback URL so Clay knows where to send results
        const callbackWebhook = `${supabaseUrl}/functions/v1/clay-webhook`;

        // Resolve salesforce IDs from prospect → companies table → company_research → domain match
        let sfAccountId = prospect.salesforce_account_id || prospect.companies?.salesforce_account_id || null;
        let sfCampaignId = prospect.salesforce_campaign_id || prospect.companies?.salesforce_campaign_id || null;

        // Fallback: resolve from company_research if still missing
        if ((!sfAccountId || !sfCampaignId) && prospect.company_research_id) {
          const { data: cr } = await supabase
            .from("company_research")
            .select("salesforce_account_id, campaign_id, company_domain")
            .eq("id", prospect.company_research_id)
            .maybeSingle();

          if (cr) {
            if (!sfAccountId && cr.salesforce_account_id) sfAccountId = cr.salesforce_account_id;

            // Try companies table by campaign + salesforce_account or domain
            if (!sfCampaignId && cr.campaign_id) {
              const query = supabase
                .from("companies")
                .select("salesforce_account_id, salesforce_campaign_id")
                .eq("campaign_id", cr.campaign_id);

              if (cr.salesforce_account_id) {
                query.eq("salesforce_account_id", cr.salesforce_account_id);
              }

              const { data: comp } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
              if (comp) {
                if (!sfAccountId) sfAccountId = comp.salesforce_account_id;
                if (!sfCampaignId) sfCampaignId = comp.salesforce_campaign_id;
              }
            }
          }
        }

        // Require Salesforce IDs — Clay needs them to sync to CRM
        if (!sfAccountId || !sfCampaignId) {
          console.error(`[send-prospect-to-clay] Missing Salesforce IDs for prospect ${prospectId}: account=${sfAccountId}, campaign=${sfCampaignId}`);
          results.push({ 
            prospect_id: prospectId, 
            success: false, 
            error: `Missing Salesforce IDs (account: ${sfAccountId ? 'ok' : 'missing'}, campaign: ${sfCampaignId ? 'ok' : 'missing'}). This prospect may need to be linked to a Salesforce campaign first.`
          });
          continue;
        }

        // Build Clay payload
        const clayPayload = {
          personal_id: personalId,
          session_id: sessionId,
          user_id,
          linkedin_url: prospect.linkedin_url,
          salesforce_account_id: sfAccountId,
          salesforce_campaign_id: sfCampaignId,
          callback_webhook: callbackWebhook,
        };

        console.log("[send-prospect-to-clay] Sending to Clay:", clayPayload);

        // Send to Clay
        const clayResponse = await fetch(clayWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clayPayload),
        });

        const clayResult = await clayResponse.text();
        console.log("[send-prospect-to-clay] Clay response:", clayResult);

        if (!clayResponse.ok) {
          await supabase
            .from("prospect_research")
            .update({
              clay_response: { status: clayResponse.status, body: clayResult },
            })
            .eq("id", prospectId);
          results.push({
            prospect_id: prospectId,
            success: false,
            error: `Clay request failed with status ${clayResponse.status}`,
          });
          continue;
        }

        // Update prospect with sent status, personal_id, and session_id
        await supabase
          .from("prospect_research")
          .update({
            sent_to_clay: true,
            sent_to_clay_at: new Date().toISOString(),
            status: 'sent_to_clay',
            personal_id: personalId,
            clay_session_id: sessionId,
            clay_response: { status: clayResponse.status, body: clayResult },
          })
          .eq("id", prospectId);

        results.push({ prospect_id: prospectId, success: true });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("[send-prospect-to-clay] Error for prospect:", prospectId, errorMessage);
        results.push({ prospect_id: prospectId, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ 
        success: failCount === 0,
        sent: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-prospect-to-clay] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
