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
    console.log("[update-prospect-status-from-salesforce] Payload:", JSON.stringify(body, null, 2));

    const {
      salesforce_contact_id,
      contact_email,
      campaign_member_status,
      has_responded,
      first_responded_date,
      last_modified_date
    } = body;

    // Validate required fields
    if (!salesforce_contact_id && !contact_email) {
      return new Response(
        JSON.stringify({
          error: "Either salesforce_contact_id or contact_email is required",
          skipped: true
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to find the prospect by salesforce_contact_id first, then by email
    let query = supabase
      .from("prospect_research")
      .select("id, salesforce_contact_id, email, status");

    if (salesforce_contact_id) {
      query = query.eq("salesforce_contact_id", salesforce_contact_id);
    } else {
      query = query.eq("email", contact_email);
    }

    const { data: prospects, error: findError } = await query;

    if (findError) {
      console.error("[update-prospect-status-from-salesforce] Find error:", findError);
      return new Response(
        JSON.stringify({
          error: "Failed to find prospect",
          details: findError.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prospects || prospects.length === 0) {
      console.log(`[update-prospect-status-from-salesforce] No prospect found for salesforce_contact_id: ${salesforce_contact_id}, email: ${contact_email}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Prospect not found in database - may not have been synced yet",
          skipped: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update all matching prospects (there should only be one, but handle multiple just in case)
    const updateData: Record<string, any> = {
      salesforce_campaign_status: campaign_member_status || null,
      salesforce_has_responded: has_responded || false,
      salesforce_last_activity: last_modified_date || new Date().toISOString(),
    };

    // Update first_responded_date if provided
    if (first_responded_date) {
      updateData.salesforce_first_responded = first_responded_date;
    }

    // Update general status based on Salesforce campaign member status
    if (campaign_member_status) {
      // Map Salesforce statuses to our internal statuses
      const statusMap: Record<string, string> = {
        'Sent': 'contacted',
        'Responded': 'responded',
        'Converted': 'converted',
        'Added': 'synced_to_salesforce',
      };

      if (statusMap[campaign_member_status]) {
        updateData.status = statusMap[campaign_member_status];
      }
    }

    const prospectIds = prospects.map(p => p.id);

    const { data: updatedProspects, error: updateError } = await supabase
      .from("prospect_research")
      .update(updateData)
      .in("id", prospectIds)
      .select();

    if (updateError) {
      console.error("[update-prospect-status-from-salesforce] Update error:", updateError);
      return new Response(
        JSON.stringify({
          error: "Failed to update prospect status",
          details: updateError.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[update-prospect-status-from-salesforce] Successfully updated ${updatedProspects?.length || 0} prospect(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        updated_count: updatedProspects?.length || 0,
        prospect_ids: prospectIds,
        salesforce_status: campaign_member_status,
        message: "Prospect status updated from Salesforce"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[update-prospect-status-from-salesforce] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
