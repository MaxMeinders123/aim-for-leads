import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Must match headers the browser/client might send (preflight will fail otherwise)
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { webhookUrl, payload } = await req.json();

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "webhookUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    try {
      const parsedUrl = new URL(webhookUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid URL: '${webhookUrl}'` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[research-proxy] Calling webhook: ${webhookUrl}`);
    
    // Make the request to the webhook from the server (no CORS issues)
    // Note: Supabase Edge Functions have platform execution limits
    // The actual timeout depends on your Supabase plan
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

    console.log(`[research-proxy] Response status: ${response.status}`);

    // Get the raw response text
    const responseText = await response.text();
    console.log(`[research-proxy] Response length: ${responseText.length} chars`);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Webhook returned ${response.status}`,
          details: responseText.substring(0, 500)
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the raw response - let the frontend parse it
    return new Response(responseText, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[research-proxy] Error: ${errorMessage}`);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
