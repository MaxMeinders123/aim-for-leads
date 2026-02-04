import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("[receive-research-results] Received payload:", JSON.stringify(body, null, 2));

    const { user_id, company_domain, company_data, prospect_data, status, error_message } = body;

    // Validate required fields
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company_domain) {
      return new Response(
        JSON.stringify({ error: "company_domain is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if there's an existing processing record for this user_id + company_domain
    const { data: existingRecord } = await supabase
      .from("research_results")
      .select("id")
      .eq("user_id", user_id)
      .eq("company_domain", company_domain)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let result;

    if (existingRecord) {
      // Update existing record
      const { data, error } = await supabase
        .from("research_results")
        .update({
          status: status || "completed",
          company_data: company_data || null,
          prospect_data: prospect_data || null,
          error_message: error_message || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRecord.id)
        .select()
        .single();

      if (error) {
        console.error("[receive-research-results] Update error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from("research_results")
        .insert({
          user_id,
          company_domain,
          status: status || "processing",
          company_data: company_data || null,
          prospect_data: prospect_data || null,
          error_message: error_message || null,
        })
        .select()
        .single();

      if (error) {
        console.error("[receive-research-results] Insert error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      result = data;
    }

    console.log("[receive-research-results] Saved result:", result?.id);

    // If status is completed and Clay webhook is configured, trigger Clay
    if (status === "completed" && result) {
      // Get user's Clay webhook URL from user_integrations
      // Note: This assumes user_id maps to a Supabase auth user. If not, skip Clay trigger.
      const { data: integrationData } = await supabase
        .from("user_integrations")
        .select("clay_webhook_url")
        .limit(1)
        .single();

      if (integrationData?.clay_webhook_url) {
        console.log("[receive-research-results] Triggering Clay webhook...");
        
        try {
          const clayPayload = {
            user_id,
            company_domain,
            company_data,
            prospect_data,
            research_result_id: result.id,
            triggered_at: new Date().toISOString(),
          };

          const clayResponse = await fetch(integrationData.clay_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clayPayload),
          });

          const clayResult = await clayResponse.text();
          console.log("[receive-research-results] Clay response:", clayResult);

          // Update record with Clay trigger info
          await supabase
            .from("research_results")
            .update({
              clay_triggered: true,
              clay_response: { status: clayResponse.status, body: clayResult },
            })
            .eq("id", result.id);

        } catch (clayError) {
          console.error("[receive-research-results] Clay trigger error:", clayError);
          await supabase
            .from("research_results")
            .update({
              clay_triggered: true,
              clay_response: { error: String(clayError) },
            })
            .eq("id", result.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        received: true,
        id: result?.id,
        status: result?.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[receive-research-results] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
