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
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    
    if (authError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { url, user_id } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
      
      // Block private/internal network ranges to prevent SSRF
      const hostname = parsedUrl.hostname.toLowerCase();
      const blockedPatterns: (string | RegExp)[] = [
        // Loopback addresses
        'localhost', /^127\./, /^0\.0\.0\.0$/, '::1', /^::ffff:127\./,
        // Private networks (RFC 1918)
        /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
        // Link-local / Cloud metadata endpoints (AWS/Azure/GCP)
        /^169\.254\./, /^fe80:/i, /^::ffff:169\.254\./,
        // Broadcast / Reserved addresses
        /^255\.255\.255\.255$/, /^224\./, /^240\./,
        // IPv6 private (Unique Local Addresses)
        /^fd[0-9a-f]{2}:/i, /^fc[0-9a-f]{2}:/i,
        // Special domains
        /\.local$/i, /\.internal$/i, /\.localhost$/i
      ];
      
      for (const pattern of blockedPatterns) {
        if (typeof pattern === 'string' && hostname === pattern) {
          throw new Error('Internal addresses not allowed');
        }
        if (pattern instanceof RegExp && pattern.test(hostname)) {
          throw new Error('Internal addresses not allowed');
        }
      }
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid URL: '${url}'` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Make the request to the webhook from the server (no CORS issues)
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "test",
        source: "engagetech_researcher",
        user_id: claims.claims.sub || "test_user",
        company_domain: "example.com",
      }),
    });

    await response.text(); // Consume response body

    return new Response(
      JSON.stringify({ 
        success: response.ok, 
        status: response.status,
        message: response.ok ? "Webhook is working!" : "Webhook test failed"
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
