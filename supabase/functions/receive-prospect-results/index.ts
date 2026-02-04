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

    const { user_id, company_domain, prospect_data, research_result_id, status, error_message } = body;

    if (!user_id || !company_domain) {
      return new Response(
        JSON.stringify({ error: "user_id and company_domain are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the research record
    let recordId = research_result_id;
    
    if (!recordId) {
      // Try to find by user_id and company_domain
      const { data: existingRecord } = await supabase
        .from("research_results")
        .select("id")
        .eq("user_id", user_id)
        .eq("company_domain", company_domain)
        .in("status", ["company_complete", "prospects_pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingRecord) {
        return new Response(
          JSON.stringify({ error: "No matching research record found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      recordId = existingRecord.id;
    }

    // Update record with prospect data
    const updateData: any = {
      prospect_data: prospect_data || null,
      status: status === "rejected" ? "rejected" : "completed",
      error_message: error_message || null,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRecord, error } = await supabase
      .from("research_results")
      .update(updateData)
      .eq("id", recordId)
      .select()
      .single();

    if (error) {
      console.error("[receive-prospect-results] Update error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[receive-prospect-results] Updated result:", recordId);

    // If completed successfully, trigger Clay
    if (status !== "rejected" && updatedRecord) {
      const { data: integrationData } = await supabase
        .from("user_integrations")
        .select("clay_webhook_url")
        .limit(1)
        .maybeSingle();

      if (integrationData?.clay_webhook_url) {
        console.log("[receive-prospect-results] Triggering Clay webhook...");
        
        try {
          const clayPayload = {
            user_id,
            company_domain,
            company_data: updatedRecord.company_data,
            prospect_data: prospect_data,
            research_result_id: recordId,
            triggered_at: new Date().toISOString(),
          };

          const clayResponse = await fetch(integrationData.clay_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clayPayload),
          });

          const clayResult = await clayResponse.text();
          console.log("[receive-prospect-results] Clay response:", clayResult);

          await supabase
            .from("research_results")
            .update({
              clay_triggered: true,
              clay_response: { status: clayResponse.status, body: clayResult },
            })
            .eq("id", recordId);

        } catch (clayError) {
          console.error("[receive-prospect-results] Clay error:", clayError);
          await supabase
            .from("research_results")
            .update({
              clay_triggered: true,
              clay_response: { error: String(clayError) },
            })
            .eq("id", recordId);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        received: true,
        id: recordId,
        status: status === "rejected" ? "rejected" : "completed",
        clay_triggered: !!updatedRecord,
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
