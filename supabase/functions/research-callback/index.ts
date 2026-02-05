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
    const { event, campaign_id, company_id, contacts } = body;

    console.log("[research-callback] Request received");

    // Validate campaign_id format if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (campaign_id && !uuidRegex.test(campaign_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid campaign_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate campaign exists if campaign_id provided
    if (campaign_id) {
      const { data: campaignExists } = await supabase
        .from("campaigns")
        .select("id")
        .eq("id", campaign_id)
        .maybeSingle();

      if (!campaignExists) {
        return new Response(
          JSON.stringify({ error: "Campaign not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle people research complete (async callback from n8n)
    if (event === "people_research_complete" && campaign_id && contacts) {
      // Limit contacts array size
      if (!Array.isArray(contacts) || contacts.length > 100) {
        return new Response(
          JSON.stringify({ error: "contacts must be an array with max 100 items" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Map contacts from n8n format to database format
      const contactsToInsert = contacts.map((contact: any) => ({
        campaign_id,
        company_id: company_id || null,
        company_name: contact.company_name || contact.company || null,
        name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        title: contact.title || contact.job_title || null,
        email: contact.email || null,
        phone: contact.phone || null,
        linkedin_url: contact.linkedin_url || contact.linkedin || null,
        priority: (contact.priority || "medium").toLowerCase(),
      }));

      const { data, error } = await supabase
        .from("contacts")
        .insert(contactsToInsert)
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update campaign contacts count
      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign_id);

      await supabase
        .from("campaigns")
        .update({ contacts_count: count || 0 })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          contacts_created: data?.length || 0,
          company_id: company_id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Legacy: Handle research_complete event
    if (event === "research_complete" && campaign_id && contacts) {
      if (!Array.isArray(contacts) || contacts.length > 100) {
        return new Response(
          JSON.stringify({ error: "contacts must be an array with max 100 items" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const contactsToInsert = contacts.map((contact: any) => ({
        campaign_id,
        company_id: contact.company_id || null,
        company_name: contact.company_name,
        name: contact.name,
        title: contact.title || null,
        email: contact.email || null,
        phone: contact.phone || null,
        linkedin_url: contact.linkedin_url || null,
        priority: contact.priority || "medium",
      }));

      const { data, error } = await supabase
        .from("contacts")
        .insert(contactsToInsert)
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("campaigns")
        .update({ contacts_count: contactsToInsert.length })
        .eq("id", campaign_id);

      return new Response(
        JSON.stringify({ success: true, contacts_created: data?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid event or missing data" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[research-callback] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
