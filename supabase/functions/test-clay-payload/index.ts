import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProspectWithCompany {
  id: string;
  personal_id: string | null;
  linkedin_url: string | null;
  salesforce_account_id: string | null;
  salesforce_campaign_id: string | null;
  company_id: string | null;
  campaign_id: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  companies: {
    id: string;
    name: string;
    salesforce_account_id: string | null;
    salesforce_campaign_id: string | null;
    campaign_id: string | null;
  } | null;
}

/**
 * Returns the exact payload that would be sent to Clay for the most recent
 * prospect_research record (or a specific one if prospect_id is provided).
 * Useful for debugging/testing Clay integration.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { user_id, prospect_id } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectFields = `
      id,
      personal_id,
      linkedin_url,
      salesforce_account_id,
      salesforce_campaign_id,
      company_id,
      campaign_id,
      first_name,
      last_name,
      job_title,
      companies:company_id (
        id,
        name,
        salesforce_account_id,
        salesforce_campaign_id,
        campaign_id
      )
    `;

    let prospect: ProspectWithCompany | null = null;

    if (prospect_id) {
      const { data, error } = await supabase
        .from("prospect_research")
        .select(selectFields)
        .eq("id", prospect_id)
        .eq("user_id", user_id)
        .single();
      
      if (error) throw error;
      prospect = data as ProspectWithCompany;
    } else {
      const { data, error } = await supabase
        .from("prospect_research")
        .select(selectFields)
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (error) throw error;
      prospect = (data as ProspectWithCompany[])?.[0] ?? null;
    }

    if (!prospect) {
      return new Response(
        JSON.stringify({ error: "No prospect found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the EXACT Clay payload that send-prospect-to-clay would send
    const companies = prospect.companies;

    const clayPayload = {
      personal_id: prospect.personal_id,
      linkedin_url: prospect.linkedin_url,
      salesforce_account_id:
        prospect.salesforce_account_id || companies?.salesforce_account_id || null,
      salesforce_campaign_id:
        prospect.salesforce_campaign_id || companies?.salesforce_campaign_id || null,
    };

    return new Response(
      JSON.stringify({
        message: "This is the exact payload that would be sent to Clay",
        prospect_summary: {
          id: prospect.id,
          name: `${prospect.first_name ?? ""} ${prospect.last_name ?? ""}`.trim() || "(no name)",
          job_title: prospect.job_title,
          company_name: companies?.name ?? "(no company)",
        },
        clay_payload: clayPayload,
        resolved_from: {
          salesforce_account_id_source: prospect.salesforce_account_id
            ? "prospect_research"
            : companies?.salesforce_account_id
            ? "companies"
            : "none",
          salesforce_campaign_id_source: prospect.salesforce_campaign_id
            ? "prospect_research"
            : companies?.salesforce_campaign_id
            ? "companies"
            : "none",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
