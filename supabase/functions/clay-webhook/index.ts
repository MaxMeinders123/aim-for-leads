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
    console.log("[clay-webhook] Payload received:", JSON.stringify(body, null, 2));

    // Clay sends results with personal_id or session_id to identify the prospect
    // Expected payload: { personal_id, session_id, is_duplicate, salesforce_url, email, phone }
    const {
      personal_id,
      session_id,
      user_id,
      type,          // "New" | "Update" | "Fail" - record status from Clay
      link,          // Merged CRM link (Salesforce URL)
      email,         // Work Email from Clay
      phone,         // Mobile Phone from Clay
      // Legacy fields
      is_duplicate,
      salesforce_url,
      event,
      campaign_id,
      data
    } = body;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Match prospect by personal_id or session_id
    const matchId = personal_id || session_id;
    const matchColumn = personal_id ? "personal_id" : "clay_session_id";

    if (matchId) {
      // Validate UUID format
      if (!uuidRegex.test(matchId)) {
        console.error(`[clay-webhook] Invalid ${matchColumn} format:`, matchId);
        return new Response(
          JSON.stringify({ error: `Invalid ${matchColumn} format` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Map type to status: "New" → "new", "Update" → "update", "Fail" → "fail"
      // Fall back to legacy is_duplicate logic if type is not provided
      let newStatus: string;
      if (type) {
        newStatus = type.toLowerCase(); // "New" → "new", "Update" → "update", "Fail" → "fail"
      } else {
        newStatus = is_duplicate === true ? 'duplicate' : 'inputted';
      }

      const crmLink = link || salesforce_url;

      console.log(`[clay-webhook] Updating prospect by ${matchColumn}=${matchId} to status: ${newStatus}, crm_link: ${crmLink}`);

      // Build update object — only set fields that Clay actually sent
      const updateFields: Record<string, any> = {
        status: newStatus,
        clay_response: body,
      };
      if (crmLink) updateFields.salesforce_url = crmLink;
      if (email) updateFields.email = email;
      if (phone) updateFields.phone = phone;

      let updateQuery = supabase
        .from("prospect_research")
        .update(updateFields)
        .eq(matchColumn, matchId);

      if (user_id) {
        updateQuery = updateQuery.eq("user_id", user_id);
      }

      const { data: updatedProspect, error: updateError } = await updateQuery
        .select()
        .single();

      if (updateError) {

        // If no prospect found with this ID, it might be a data issue
        if (updateError.code === 'PGRST116') {
          return new Response(
            JSON.stringify({
              error: `No prospect found with ${matchColumn}: ${matchId}`,
              details: "Prospect may not exist"
            }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Other database errors
        return new Response(
          JSON.stringify({
            error: "Database error while updating prospect",
            details: updateError.message
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[clay-webhook] Prospect updated");

      return new Response(
        JSON.stringify({ 
          success: true, 
          prospect_id: updatedProspect?.id,
          status: newStatus,
          type: type || null
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Legacy flow: Handle different event types from Clay (backwards compatibility)
    switch (event) {
      case "enrichment_complete": {
        if (body.company_id && data) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Enrichment data received (legacy)"
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "contacts_enriched": {
        // Update prospect_research instead of contacts table
        if (campaign_id && data?.contacts) {
          
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
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Webhook received but no action taken"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid request - no personal_id, session_id, or valid event provided" }),
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
