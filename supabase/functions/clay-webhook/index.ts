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
    console.log("Clay webhook received:", JSON.stringify(body, null, 2));

    const { event, campaign_id, company_id, data } = body;

    // Handle different event types from Clay
    switch (event) {
      case "enrichment_complete": {
        // Store enriched company data
        if (company_id && data) {
          // You can extend this to store enrichment data in a dedicated table
          console.log(`Enrichment complete for company ${company_id}:`, data);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Enrichment data received",
              company_id 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "contacts_enriched": {
        // Handle enriched contacts from Clay
        if (campaign_id && data?.contacts) {
          const contactsToUpsert = data.contacts.map((contact: any) => ({
            campaign_id,
            company_id: contact.company_id || null,
            company_name: contact.company_name,
            name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
            title: contact.job_title || contact.title || null,
            email: contact.email || null,
            phone: contact.phone || null,
            linkedin_url: contact.linkedin || contact.linkedin_url || null,
            priority: (contact.priority || "medium").toLowerCase(),
          }));

          const { data: insertedData, error } = await supabase
            .from("contacts")
            .upsert(contactsToUpsert, { onConflict: 'id' })
            .select();

          if (error) {
            console.error("Error upserting contacts:", error);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              contacts_processed: insertedData?.length || 0 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "company_data": {
        // Handle company research data from Clay
        if (data) {
          console.log("Company data received:", data);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Company data received",
              data 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      default: {
        // Generic handler - just log and acknowledge
        console.log(`Unknown event type: ${event}`, body);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Webhook received",
            event,
            received_at: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid event or missing data" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Clay webhook error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
