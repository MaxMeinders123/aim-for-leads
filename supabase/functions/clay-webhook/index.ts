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
    console.log("[clay-webhook] Received:", JSON.stringify(body, null, 2));

    // Clay sends enrichment results with personal_id to identify the prospect
    const { 
      personal_id, 
      email, 
      phone, 
      mobile, 
      is_duplicate, 
      salesforce_url,
      salesforce_account_id,
      company_id,
      // Legacy fields for backwards compatibility
      event,
      campaign_id,
      data 
    } = body;

    // New flow: Update prospect by personal_id with enrichment data
    if (personal_id) {
      console.log(`[clay-webhook] Updating prospect with personal_id: ${personal_id}`);
      
      const newStatus = is_duplicate === true ? 'duplicate' : 'inputted';
      
      const { data: updatedProspect, error: updateError } = await supabase
        .from("prospect_research")
        .update({
          email: email || null,
          phone: phone || null,
          mobile: mobile || null,
          status: newStatus,
          salesforce_url: salesforce_url || null,
          salesforce_account_id: salesforce_account_id || null,
          sent_to_clay: true,
          sent_to_clay_at: new Date().toISOString(),
          clay_response: body,
        })
        .eq("personal_id", personal_id)
        .select()
        .single();

      if (updateError) {
        console.error("[clay-webhook] Failed to update prospect by personal_id:", updateError);

        // If no prospect found with this personal_id, it might be a data issue
        if (updateError.code === 'PGRST116') {
          console.error(`[clay-webhook] No prospect found with personal_id: ${personal_id}`);
          console.error("[clay-webhook] This usually means:");
          console.error("  1. Prospect was sent to Clay before personal_id was generated");
          console.error("  2. Clay sent wrong personal_id");
          console.error("  3. Prospect was deleted from database");

          return new Response(
            JSON.stringify({
              error: `No prospect found with personal_id: ${personal_id}`,
              details: "Prospect may have been sent to Clay without personal_id or may have been deleted",
              personal_id: personal_id
            }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Other database errors
        return new Response(
          JSON.stringify({
            error: "Database error while updating prospect",
            details: updateError.message,
            code: updateError.code
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[clay-webhook] Successfully updated prospect: ${updatedProspect?.id}, status: ${newStatus}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          prospect_id: updatedProspect?.id,
          status: newStatus,
          is_duplicate: is_duplicate || false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Legacy flow: Handle different event types from Clay (backwards compatibility)
    switch (event) {
      case "enrichment_complete": {
        if (body.company_id && data) {
          console.log(`[clay-webhook] Legacy enrichment complete for company ${body.company_id}`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Enrichment data received (legacy)",
              company_id: body.company_id 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "contacts_enriched": {
        // Update prospect_research instead of contacts table
        if (campaign_id && data?.contacts) {
          console.log(`[clay-webhook] Legacy contacts_enriched for campaign ${campaign_id}`);
          
          const results: { prospect_id: string; success: boolean }[] = [];
          
          for (const contact of data.contacts) {
            if (contact.personal_id) {
              const { data: updated, error } = await supabase
                .from("prospect_research")
                .update({
                  email: contact.email || null,
                  phone: contact.phone || null,
                  status: contact.is_duplicate ? 'duplicate' : 'inputted',
                  salesforce_url: contact.salesforce_url || null,
                  clay_response: contact,
                })
                .eq("personal_id", contact.personal_id)
                .select("id")
                .single();

              results.push({ 
                prospect_id: updated?.id || contact.personal_id, 
                success: !error 
              });
            }
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              processed: results.length,
              results
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      default: {
        // Generic handler - just log and acknowledge
        console.log(`[clay-webhook] Unknown event or no personal_id:`, body);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Webhook received but no action taken (missing personal_id)",
            received_at: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid request - no personal_id or valid event provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[clay-webhook] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
