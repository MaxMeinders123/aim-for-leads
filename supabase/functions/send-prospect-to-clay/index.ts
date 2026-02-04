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
    console.log("[send-prospect-to-clay] Payload:", JSON.stringify(body, null, 2));

    const { prospect_id, prospect_ids, user_id } = body;

    // Support single or multiple prospect IDs
    const idsToSend: string[] = prospect_ids || (prospect_id ? [prospect_id] : []);

    if (idsToSend.length === 0) {
      return new Response(
        JSON.stringify({ error: "prospect_id or prospect_ids is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Clay webhook URL from user_integrations
    const { data: integrationData } = await supabase
      .from("user_integrations")
      .select("clay_webhook_url")
      .limit(1)
      .maybeSingle();

    if (!integrationData?.clay_webhook_url) {
      return new Response(
        JSON.stringify({ error: "Clay webhook URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { prospect_id: string; success: boolean; error?: string }[] = [];

    for (const prospectId of idsToSend) {
      try {
        // Get prospect data with company info (using new columns)
        const { data: prospect, error: prospectError } = await supabase
          .from("prospect_research")
          .select(`
            *,
            company_research:company_research_id (
              id,
              company_domain,
              company_name,
              company_status,
              cloud_provider,
              cloud_confidence,
              raw_data
            )
          `)
          .eq("id", prospectId)
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

        // Build Clay payload with all required fields
        const clayPayload = {
          personal_id: personalId,
          prospect_id: prospectId,
          first_name: prospect.first_name,
          last_name: prospect.last_name,
          full_name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
          title: prospect.job_title,
          job_title: prospect.job_title,
          linkedin_url: prospect.linkedin_url,
          priority: prospect.priority,
          priority_reason: prospect.priority_reason,
          pitch_type: prospect.pitch_type,
          // Company info from company_research join or direct columns
          salesforce_account_id: prospect.salesforce_account_id || prospect.company_research?.id,
          company_id: prospect.company_id || prospect.company_research?.id,
          company: {
            id: prospect.company_research?.id,
            domain: prospect.company_research?.company_domain,
            name: prospect.company_research?.company_name,
            status: prospect.company_research?.company_status,
            cloud_provider: prospect.company_research?.cloud_provider,
            cloud_confidence: prospect.company_research?.cloud_confidence,
          },
          user_id: prospect.user_id,
          sent_at: new Date().toISOString(),
        };

        console.log("[send-prospect-to-clay] Sending to Clay:", clayPayload);

        // Send to Clay
        const clayResponse = await fetch(integrationData.clay_webhook_url, {
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
