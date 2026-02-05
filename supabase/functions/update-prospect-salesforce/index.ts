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
    console.log("[update-prospect-salesforce] Request received");

    const {
      prospect_id,
      salesforce_contact_id,
      salesforce_contact_url,
      synced_at,
      sync_status
    } = body;

    // Validate required fields
    if (!prospect_id || typeof prospect_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "prospect_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!salesforce_contact_id || typeof salesforce_contact_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "salesforce_contact_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(prospect_id)) {
      return new Response(
        JSON.stringify({ error: "prospect_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate salesforce_contact_id length
    if (salesforce_contact_id.length > 100) {
      return new Response(
        JSON.stringify({ error: "salesforce_contact_id is too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update prospect_research table with Salesforce contact info
    const { data: updatedProspect, error: updateError } = await supabase
      .from("prospect_research")
      .update({
        salesforce_contact_id: salesforce_contact_id,
        salesforce_url: salesforce_contact_url || null,
        synced_at: synced_at || new Date().toISOString(),
        sync_status: sync_status || 'success',
        status: 'synced_to_salesforce',
      })
      .eq("id", prospect_id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "Failed to update prospect",
          details: updateError.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[update-prospect-salesforce] Prospect updated");

    return new Response(
      JSON.stringify({
        success: true,
        prospect_id: updatedProspect.id,
        salesforce_contact_id: salesforce_contact_id,
        message: "Prospect updated with Salesforce contact info"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[update-prospect-salesforce] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
