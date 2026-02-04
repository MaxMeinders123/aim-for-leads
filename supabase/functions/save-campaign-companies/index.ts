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
    console.log("[save-campaign-companies] Payload:", JSON.stringify(body, null, 2));

    const { campaign_id, user_id, companies } = body;

    // Validate required fields
    if (!campaign_id || typeof campaign_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "campaign_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: "user_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: "companies array is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create or update campaign import record
    const { data: campaignImport, error: campaignError } = await supabase
      .from("campaign_imports")
      .upsert({
        user_id: user_id,
        salesforce_campaign_id: campaign_id,
        total_companies: companies.length,
        status: 'pending_selection',
        imported_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,salesforce_campaign_id'
      })
      .select()
      .single();

    if (campaignError) {
      console.error("[save-campaign-companies] Campaign import error:", campaignError);
      return new Response(
        JSON.stringify({
          error: "Failed to create campaign import record",
          details: campaignError.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[save-campaign-companies] Created campaign import:", campaignImport.id);

    // Save each company to campaign_companies table
    const companiesToInsert = companies.map(company => ({
      campaign_import_id: campaignImport.id,
      user_id: user_id,
      salesforce_account_id: company.salesforce_account_id,
      company_name: company.company_name,
      website: company.website,
      linkedin: company.linkedin,
      selected: false, // User hasn't selected yet
      status: 'pending',
    }));

    const { data: insertedCompanies, error: insertError } = await supabase
      .from("campaign_companies")
      .upsert(companiesToInsert, {
        onConflict: 'campaign_import_id,salesforce_account_id'
      })
      .select();

    if (insertError) {
      console.error("[save-campaign-companies] Insert error:", insertError);
      return new Response(
        JSON.stringify({
          error: "Failed to save companies",
          details: insertError.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[save-campaign-companies] Saved ${insertedCompanies.length} companies`);

    return new Response(
      JSON.stringify({
        success: true,
        campaign_import_id: campaignImport.id,
        total_companies: companies.length,
        companies_saved: insertedCompanies.length,
        message: "Campaign companies imported successfully"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[save-campaign-companies] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
