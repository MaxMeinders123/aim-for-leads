import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    console.log("[import-salesforce-campaign] Payload:", JSON.stringify(body, null, 2));

    const { salesforce_campaign_id, campaign_id, user_id } = body;

    if (!salesforce_campaign_id || !campaign_id || !user_id) {
      console.error("[import-salesforce-campaign] Missing required fields:", { salesforce_campaign_id, campaign_id, user_id });
      return new Response(
        JSON.stringify({
          error: "salesforce_campaign_id, campaign_id, and user_id are required",
          details: { salesforce_campaign_id: !!salesforce_campaign_id, campaign_id: !!campaign_id, user_id: !!user_id }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Salesforce import webhook URL from user_integrations
    console.log("[import-salesforce-campaign] Fetching webhook URL for user:", user_id);
    const { data: integrationData, error: integrationError } = await supabase
      .from("user_integrations")
      .select("salesforce_import_webhook_url")
      .eq("user_id", user_id)
      .maybeSingle();

    if (integrationError) {
      console.error("[import-salesforce-campaign] Integration fetch error:", integrationError);
      return new Response(
        JSON.stringify({ error: `Database error: ${integrationError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integrationData?.salesforce_import_webhook_url) {
      console.error("[import-salesforce-campaign] Webhook URL not configured");
      return new Response(
        JSON.stringify({ error: "Salesforce import webhook URL not configured. Please add it in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[import-salesforce-campaign] Calling n8n webhook:", integrationData.salesforce_import_webhook_url);

    // Call n8n webhook to get accounts from Salesforce
    let n8nResponse;
    try {
      n8nResponse = await fetch(integrationData.salesforce_import_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesforce_campaign_id,
          user_id,
        }),
      });
    } catch (fetchError: any) {
      console.error("[import-salesforce-campaign] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: `Failed to reach n8n webhook: ${fetchError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[import-salesforce-campaign] n8n response status:", n8nResponse.status);

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error("[import-salesforce-campaign] n8n error response:", errorText);
      return new Response(
        JSON.stringify({
          error: `n8n webhook returned ${n8nResponse.status}`,
          details: errorText,
          webhook_url: integrationData.salesforce_import_webhook_url
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const n8nResult = await n8nResponse.json();
    console.log("[import-salesforce-campaign] n8n response:", JSON.stringify(n8nResult, null, 2));

    // Extract accounts array - handle different response formats
    let accounts = n8nResult.accounts || n8nResult.data?.accounts || n8nResult;
    if (!Array.isArray(accounts)) {
      accounts = [accounts].filter(Boolean);
    }

    if (accounts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, imported_count: 0, message: "No accounts found in Salesforce campaign" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map and insert companies
    const companiesToInsert = accounts.map((acc: any) => ({
      user_id,
      campaign_id,
      name: acc.name || acc.Name || 'Unknown',
      website: acc.website || acc.Website || null,
      linkedin_url: acc.linkedin_url || acc.LinkedIn_URL__c || null,
      salesforce_account_id: acc.id || acc.Id || null,
      salesforce_campaign_id,
      status: 'imported',
    }));

    console.log("[import-salesforce-campaign] Inserting companies:", companiesToInsert.length);
    console.log("[import-salesforce-campaign] Sample company:", JSON.stringify(companiesToInsert[0], null, 2));

    const { data: insertedCompanies, error: insertError } = await supabase
      .from("companies")
      .insert(companiesToInsert)
      .select();

    if (insertError) {
      console.error("[import-salesforce-campaign] Insert error:", insertError);
      return new Response(
        JSON.stringify({
          error: "Database insert failed",
          details: insertError.message,
          hint: insertError.hint,
          code: insertError.code
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update campaign companies_count
    await supabase
      .from("campaigns")
      .update({ companies_count: insertedCompanies?.length || 0 })
      .eq("id", campaign_id);

    console.log("[import-salesforce-campaign] Successfully imported:", insertedCompanies?.length);

    return new Response(
      JSON.stringify({
        success: true,
        imported_count: insertedCompanies?.length || 0,
        companies: insertedCompanies,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[import-salesforce-campaign] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
