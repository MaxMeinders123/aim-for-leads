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
    console.log("[save-campaign-prospects] Payload:", JSON.stringify(body, null, 2));

    const { campaign_id, user_id, prospects, salesforce_campaign_id } = body;

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

    if (!prospects || !Array.isArray(prospects) || prospects.length === 0) {
      return new Response(
        JSON.stringify({ error: "prospects array is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!salesforce_campaign_id) {
      return new Response(
        JSON.stringify({ error: "salesforce_campaign_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[save-campaign-prospects] Processing ${prospects.length} prospects for campaign ${campaign_id}`);

    // Get or create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaign_id)
      .single();

    if (campaignError) {
      console.error("[save-campaign-prospects] Campaign not found:", campaignError);
      return new Response(
        JSON.stringify({
          error: "Campaign not found. Please create a campaign first.",
          details: campaignError.message
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each prospect
    let insertedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const prospect of prospects) {
      try {
        // Extract Salesforce Contact ID from personal_id field
        const salesforceContactId = prospect.personal_id || prospect.ContactId || prospect.salesforce_contact_id;

        if (!salesforceContactId) {
          console.warn("[save-campaign-prospects] Skipping prospect without Contact ID:", prospect);
          skippedCount++;
          continue;
        }

        // First, ensure the company exists
        let companyId = null;
        if (prospect.salesforce_account_id) {
          // Check if company already exists
          const { data: existingCompany } = await supabase
            .from("companies")
            .select("id")
            .eq("salesforce_account_id", prospect.salesforce_account_id)
            .eq("campaign_id", campaign_id)
            .maybeSingle();

          if (existingCompany) {
            companyId = existingCompany.id;
          } else {
            // Create company if it doesn't exist
            const { data: newCompany, error: companyError } = await supabase
              .from("companies")
              .insert({
                campaign_id,
                user_id,
                salesforce_account_id: prospect.salesforce_account_id,
                salesforce_campaign_id,
                name: prospect.company_name || "Unknown Company",
                website: prospect.website || null,
                linkedin_url: prospect.company_linkedin || null,
                status: 'imported',
              })
              .select("id")
              .single();

            if (companyError) {
              console.error("[save-campaign-prospects] Error creating company:", companyError);
              errors.push(`Failed to create company for ${salesforceContactId}: ${companyError.message}`);
              skippedCount++;
              continue;
            }

            companyId = newCompany.id;
          }
        }

        // Create company_research record (required for prospect_research)
        const { data: companyResearch, error: researchError } = await supabase
          .from("company_research")
          .insert({
            user_id,
            campaign_id,
            company_domain: prospect.website || "unknown",
            company_name: prospect.company_name || "Unknown Company",
            status: 'completed',
            salesforce_account_id: prospect.salesforce_account_id,
            salesforce_campaign_id,
          })
          .select("id")
          .single();

        if (researchError) {
          console.error("[save-campaign-prospects] Error creating company research:", researchError);
          errors.push(`Failed to create research for ${salesforceContactId}: ${researchError.message}`);
          skippedCount++;
          continue;
        }

        // Insert prospect into prospect_research table
        const { error: prospectError } = await supabase
          .from("prospect_research")
          .insert({
            company_research_id: companyResearch.id,
            user_id,
            first_name: prospect.first_name || null,
            last_name: prospect.last_name || null,
            job_title: prospect.title || prospect.job_title || null,
            linkedin_url: prospect.linkedin_url || null,
            salesforce_account_id: prospect.salesforce_account_id,
            salesforce_campaign_id,
            salesforce_contact_id: salesforceContactId,
            personal_id: prospect.personal_id || null,
            priority: prospect.priority || 'medium',
            priority_reason: prospect.priority_reason || 'Imported from Salesforce campaign',
            sent_to_clay: false,
          });

        if (prospectError) {
          console.error("[save-campaign-prospects] Error inserting prospect:", prospectError);
          errors.push(`Failed to insert prospect ${salesforceContactId}: ${prospectError.message}`);
          skippedCount++;
          continue;
        }

        insertedCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("[save-campaign-prospects] Error processing prospect:", errorMsg);
        errors.push(`Error processing prospect: ${errorMsg}`);
        skippedCount++;
      }
    }

    console.log(`[save-campaign-prospects] Inserted ${insertedCount} prospects, skipped ${skippedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted_count: insertedCount,
        skipped_count: skippedCount,
        total_processed: prospects.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully imported ${insertedCount} prospects from Salesforce campaign`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[save-campaign-prospects] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
