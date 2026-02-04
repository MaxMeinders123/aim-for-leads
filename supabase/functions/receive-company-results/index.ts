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

    const { user_id, company_domain, company_data, status, error_message } = body;

    if (!user_id || !company_domain) {
      return new Response(
        JSON.stringify({ error: "user_id and company_domain are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find or create the research record
    const { data: existingRecord } = await supabase
      .from("research_results")
      .select("id")
      .eq("user_id", user_id)
      .eq("company_domain", company_domain)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let resultId: string;

    if (existingRecord) {
      // Update existing record with company data
      const updateData: any = {
        company_data: company_data || null,
        status: status === "rejected" ? "rejected" : "company_complete",
        error_message: error_message || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("research_results")
        .update(updateData)
        .eq("id", existingRecord.id);

      if (error) {
        console.error("[receive-company-results] Update error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      resultId = existingRecord.id;
    } else {
      // Insert new record
      const { data: newRecord, error } = await supabase
        .from("research_results")
        .insert({
          user_id,
          company_domain,
          company_data: company_data || null,
          status: status === "rejected" ? "rejected" : "company_complete",
          error_message: error_message || null,
        })
        .select("id")
        .single();

      if (error) {
        console.error("[receive-company-results] Insert error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      resultId = newRecord.id;
    }

    console.log("[receive-company-results] Saved result:", resultId);

    // If company research succeeded, trigger prospect research
    if (status !== "rejected" && company_data) {
      // Get people research webhook URL
      const { data: integrationData } = await supabase
        .from("user_integrations")
        .select("people_research_webhook_url")
        .limit(1)
        .maybeSingle();

      if (integrationData?.people_research_webhook_url) {
        console.log("[receive-company-results] Triggering people research...");
        
        // Update status to prospects_pending
        await supabase
          .from("research_results")
          .update({ status: "prospects_pending" })
          .eq("id", resultId);

        try {
          const peoplePayload = {
            user_id,
            company_domain,
            company_data,
            research_result_id: resultId,
          };

          const peopleResponse = await fetch(integrationData.people_research_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(peoplePayload),
          });

          console.log("[receive-company-results] People webhook response:", peopleResponse.status);
          
        } catch (webhookError) {
          console.error("[receive-company-results] People webhook error:", webhookError);
          // Don't fail the whole request, just log the error
        }
      } else {
        console.log("[receive-company-results] No people_research_webhook_url configured");
      }
    }

    return new Response(
      JSON.stringify({ 
        received: true,
        id: resultId,
        status: status === "rejected" ? "rejected" : "company_complete",
        next_step: status !== "rejected" ? "prospects_pending" : null,
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
