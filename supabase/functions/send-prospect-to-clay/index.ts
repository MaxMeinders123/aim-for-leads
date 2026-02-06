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

    // Default Clay webhook (can be overridden in user_integrations)
    const DEFAULT_CLAY_WEBHOOK = "https://engagetech12.app.n8n.cloud/webhook/clay-enrichment";
    
    // Get Clay webhook URL from user_integrations for THIS user only (security fix)
    const { data: integrationData } = await supabase
      .from("user_integrations")
      .select("clay_webhook_url")
      .eq("user_id", user_id)
      .maybeSingle();

    const clayWebhookUrl = integrationData?.clay_webhook_url || DEFAULT_CLAY_WEBHOOK;
    
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

        // Check if already sent and has been enriched (status != pending)
        if (prospect.sent_to_clay && prospect.status !== 'pending') {
          results.push({ prospect_id: prospectId, success: false, error: "Already processed by Clay" });
          continue;
        }

        // Generate personal_id if not exists
        const personalId = prospect.personal_id || crypto.randomUUID();

        // Build Clay payload - gets salesforce IDs from prospect or companies table
        const clayPayload = {
          personal_id: personalId,
          linkedin_url: prospect.linkedin_url,
          salesforce_account_id: prospect.salesforce_account_id || prospect.companies?.salesforce_account_id,
          salesforce_campaign_id: prospect.salesforce_campaign_id || prospect.companies?.salesforce_campaign_id,
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

        // Update prospect with sent status and personal_id
        await supabase
          .from("prospect_research")
          .update({
            sent_to_clay: true,
            sent_to_clay_at: new Date().toISOString(),
            status: 'sent_to_clay',
            personal_id: personalId,
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
