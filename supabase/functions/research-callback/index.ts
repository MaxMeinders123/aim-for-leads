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
    const { event, campaign_id, contacts } = body;

    if (event === "research_complete" && campaign_id && contacts) {
      // Insert contacts from n8n research results
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
        console.error("Error inserting contacts:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update campaign contacts count
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
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
