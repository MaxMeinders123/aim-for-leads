import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    console.error("[receive-research-results] Failed to parse text as JSON:", e);
    return null;
  }
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
    console.log("[receive-research-results] Payload:", JSON.stringify(body, null, 2));

    const { 
      user_id, 
      company_domain, 
      research_result_id, 
      status, 
      error_message 
    } = body;

    // === AUTO-DETECT FIELD FORMAT ===
    // n8n sends: { prospect: "..." } or { company: "..." } or { " company": "..." }
    // Also support explicit: { type: "company", text: "..." }
    
    let rawText: string | undefined;
    let researchType: "company" | "prospect";
    
    if (body.prospect) {
      // Prospect field present - this is prospect research
      rawText = body.prospect;
      researchType = "prospect";
      console.log("[receive-research-results] Detected PROSPECT field");
    } else if (body.company || body[" company"]) {
      // Company field present (with or without leading space)
      rawText = body.company || body[" company"];
      researchType = "company";
      console.log("[receive-research-results] Detected COMPANY field");
    } else if (body.text) {
      // Explicit text + type format
      rawText = body.text;
      researchType = body.type === "prospect" ? "prospect" : "company";
      console.log("[receive-research-results] Using explicit text/type format:", researchType);
    } else {
      console.error("[receive-research-results] No recognized data field found");
      return new Response(
        JSON.stringify({ error: "No data field found. Expected 'company', 'prospect', or 'text'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const parsed_data = parseTextToJson(rawText);
    console.log("[receive-research-results] Parsed data:", parsed_data ? "success" : "null");

    if (!user_id || !company_domain) {
      return new Response(
        JSON.stringify({ error: "user_id and company_domain are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[receive-research-results] Processing", researchType.toUpperCase(), "results");

    if (researchType === "company") {
      // === COMPANY RESEARCH RESULTS ===

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
        const updateData: any = {
          company_data: parsed_data || null,
          status: status === "rejected" ? "rejected" : "company_complete",
          error_message: error_message || null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("research_results")
          .update(updateData)
          .eq("id", existingRecord.id);

        if (error) {
          console.error("[receive-research-results] Update error:", error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        resultId = existingRecord.id;
      } else {
        const { data: newRecord, error } = await supabase
          .from("research_results")
          .insert({
            user_id,
            company_domain,
            company_data: parsed_data || null,
            status: status === "rejected" ? "rejected" : "company_complete",
            error_message: error_message || null,
          })
          .select("id")
          .single();

        if (error) {
          console.error("[receive-research-results] Insert error:", error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        resultId = newRecord.id;
      }

      console.log("[receive-research-results] Saved company result:", resultId);

      // If company research succeeded, trigger prospect research
      if (status !== "rejected" && parsed_data) {
        const { data: integrationData } = await supabase
          .from("user_integrations")
          .select("people_research_webhook_url")
          .limit(1)
          .maybeSingle();

        if (integrationData?.people_research_webhook_url) {
          console.log("[receive-research-results] Triggering people research...");
          
          await supabase
            .from("research_results")
            .update({ status: "prospects_pending" })
            .eq("id", resultId);

          try {
            const peoplePayload = {
              user_id,
              company_domain,
              company_data: parsed_data,
              research_result_id: resultId,
            };

            const peopleResponse = await fetch(integrationData.people_research_webhook_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(peoplePayload),
            });

            console.log("[receive-research-results] People webhook response:", peopleResponse.status);
            
          } catch (webhookError) {
            console.error("[receive-research-results] People webhook error:", webhookError);
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          received: true,
          id: resultId,
          type: "company",
          status: status === "rejected" ? "rejected" : "company_complete",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // === PROSPECT RESEARCH RESULTS ===
      console.log("[receive-research-results] Processing PROSPECT results");

      let recordId = research_result_id;
      
      if (!recordId) {
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

      const updateData: any = {
        prospect_data: parsed_data || null,
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
        console.error("[receive-research-results] Update error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[receive-research-results] Updated result:", recordId);

      // If completed successfully, trigger Clay
      if (status !== "rejected" && updatedRecord) {
        const { data: integrationData } = await supabase
          .from("user_integrations")
          .select("clay_webhook_url")
          .limit(1)
          .maybeSingle();

        if (integrationData?.clay_webhook_url) {
          console.log("[receive-research-results] Triggering Clay webhook...");
          
          try {
            const clayPayload = {
              user_id,
              company_domain,
              company_data: updatedRecord.company_data,
              prospect_data: parsed_data,
              research_result_id: recordId,
              triggered_at: new Date().toISOString(),
            };

            const clayResponse = await fetch(integrationData.clay_webhook_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(clayPayload),
            });

            const clayResult = await clayResponse.text();
            console.log("[receive-research-results] Clay response:", clayResult);

            await supabase
              .from("research_results")
              .update({
                clay_triggered: true,
                clay_response: { status: clayResponse.status, body: clayResult },
              })
              .eq("id", recordId);

          } catch (clayError) {
            console.error("[receive-research-results] Clay error:", clayError);
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
          type: "prospect",
          status: status === "rejected" ? "rejected" : "completed",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[receive-research-results] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
