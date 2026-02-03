import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    // Extended timeout: 15 minutes for long-running AI research
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 900000); // 15 min
    
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

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
    
    // Check if it was a timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: "Request timed out (15 min limit)" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
