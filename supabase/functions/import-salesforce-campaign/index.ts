import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("[import-salesforce-campaign] Payload:", JSON.stringify(body, null, 2));

    const { salesforce_campaign_id, campaign_id, user_id } = body;

    if (!salesforce_campaign_id || !campaign_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "salesforce_campaign_id, campaign_id, and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve webhook URL server-side: user_integrations → env secret fallback
    const { data: integrationData } = await supabase
      .from("user_integrations")
      .select("salesforce_import_webhook_url")
      .eq("user_id", user_id)
      .maybeSingle();

    const webhookUrl = integrationData?.salesforce_import_webhook_url || Deno.env.get("DEFAULT_SALESFORCE_IMPORT_WEBHOOK");

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "Salesforce import webhook URL not configured. Set it in Settings or contact admin." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[import-salesforce-campaign] Calling n8n webhook:", webhookUrl);

    // Call n8n webhook to get accounts from Salesforce
    const n8nResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salesforce_campaign_id,
        user_id,
      }),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error("[import-salesforce-campaign] n8n error:", errorText);
      return new Response(
        JSON.stringify({ error: `Salesforce import failed: ${errorText}` }),
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
      salesforce_account_id: acc.salesforce_account_id || acc.id || acc.Id || null,
      salesforce_campaign_id,
      status: 'imported',
    }));

    console.log("[import-salesforce-campaign] Companies from Salesforce:", companiesToInsert.length);

    // Deduplicate: check which companies already exist in this campaign
    // Match by salesforce_account_id (primary), name, or website domain
    const { data: existingCompanies } = await supabase
      .from("companies")
      .select("salesforce_account_id, name, website")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id);

    const existingSfIds = new Set(
      (existingCompanies || [])
        .map((c: { salesforce_account_id: string | null }) => c.salesforce_account_id)
        .filter(Boolean)
    );
    const existingNames = new Set(
      (existingCompanies || [])
        .map((c: { name: string }) => c.name.toLowerCase().trim())
    );
    
    // Extract domains from existing websites
    const extractDomain = (url: string | null): string | null => {
      if (!url) return null;
      try {
        const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
        return new URL(cleanUrl).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return url.toLowerCase().replace(/^www\./, '');
      }
    };
    
    const existingDomains = new Set(
      (existingCompanies || [])
        .map((c: { website: string | null }) => extractDomain(c.website))
        .filter(Boolean)
    );

    const newCompanies = companiesToInsert.filter((c: { salesforce_account_id: string | null; name: string; website: string | null }) => {
      // Skip if this SF account ID already exists in the campaign
      if (c.salesforce_account_id && existingSfIds.has(c.salesforce_account_id)) {
        return false;
      }
      // Skip if company name already exists in the campaign
      if (existingNames.has(c.name.toLowerCase().trim())) {
        return false;
      }
      // Skip if website domain already exists in the campaign
      const domain = extractDomain(c.website);
      if (domain && existingDomains.has(domain)) {
        return false;
      }
      return true;
    });

    const skippedCount = companiesToInsert.length - newCompanies.length;
    if (skippedCount > 0) {
      console.log(`[import-salesforce-campaign] Skipped ${skippedCount} duplicate companies`);
    }

    if (newCompanies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          imported_count: 0,
          skipped_duplicates: skippedCount,
          message: "All companies from this Salesforce campaign are already imported",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[import-salesforce-campaign] Inserting new companies:", newCompanies.length);

    const { data: insertedCompanies, error: insertError } = await supabase
      .from("companies")
      .insert(newCompanies)
      .select();

    if (insertError) {
      console.error("[import-salesforce-campaign] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update campaign companies_count with actual total (not just this import batch)
    const { count: totalCompanies } = await supabase
      .from("companies")
      .select("id", { count: 'exact', head: true })
      .eq("campaign_id", campaign_id);

    await supabase
      .from("campaigns")
      .update({ companies_count: totalCompanies || 0 })
      .eq("id", campaign_id);

    console.log("[import-salesforce-campaign] Successfully imported:", insertedCompanies?.length);

    return new Response(
      JSON.stringify({
        success: true,
        imported_count: insertedCompanies?.length || 0,
        skipped_duplicates: skippedCount,
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
