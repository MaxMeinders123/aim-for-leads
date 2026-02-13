import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Resolve webhook URL server-side: user_integrations → env secret fallback
async function resolveWebhookUrl(
  supabaseClient: any,
  userId: string,
  webhookType: string,
): Promise<string | null> {
  // 1. Check user_integrations for a custom URL
  const columnMap: Record<string, string> = {
    company_research: "company_research_webhook_url",
    people_research: "people_research_webhook_url",
    salesforce_import: "salesforce_import_webhook_url",
    clay: "clay_webhook_url",
  };

  const column = columnMap[webhookType];
  if (column) {
    const { data } = await supabaseClient
      .from("user_integrations")
      .select(column)
      .eq("user_id", userId)
      .maybeSingle();

    const customUrl = data?.[column];
    if (customUrl) return customUrl;
  }

  // 2. Fall back to environment secrets
  const envMap: Record<string, string> = {
    company_research: "DEFAULT_COMPANY_RESEARCH_WEBHOOK",
    people_research: "DEFAULT_PROSPECT_RESEARCH_WEBHOOK",
    salesforce_import: "DEFAULT_SALESFORCE_IMPORT_WEBHOOK",
    clay: "DEFAULT_CLAY_WEBHOOK",
  };

  const envKey = envMap[webhookType];
  if (envKey) {
    return Deno.env.get(envKey) || null;
  }

  return null;
}

// SSRF protection — block internal/private network addresses
function validateExternalUrl(url: string): void {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Invalid protocol');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedPatterns: (string | RegExp)[] = [
    'localhost', /^127\./, /^0\.0\.0\.0$/, '::1', /^::ffff:127\./,
    /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
    /^169\.254\./, /^fe80:/i, /^::ffff:169\.254\./,
    /^255\.255\.255\.255$/, /^224\./, /^240\./,
    /^fd[0-9a-f]{2}:/i, /^fc[0-9a-f]{2}:/i,
    /\.local$/i, /\.internal$/i, /\.localhost$/i,
  ];

  for (const pattern of blockedPatterns) {
    if (typeof pattern === 'string' && hostname === pattern) {
      throw new Error('Internal addresses not allowed');
    }
    if (pattern instanceof RegExp && pattern.test(hostname)) {
      throw new Error('Internal addresses not allowed');
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabaseAuth.auth.getClaims(token);

    if (authError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;
    const body = await req.json();
    const { webhook_type, payload } = body;

    if (!webhook_type) {
      return new Response(
        JSON.stringify({ error: "webhook_type is required (company_research | people_research | salesforce_import | clay)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client to read user_integrations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const webhookUrl = await resolveWebhookUrl(supabaseService, userId, webhook_type);

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: `No webhook URL configured for type: ${webhook_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL (SSRF protection)
    try {
      validateExternalUrl(webhookUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid webhook URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[research-proxy] Proxying authenticated request");

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Webhook returned ${response.status}`,
          details: responseText.substring(0, 200)
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(responseText, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[research-proxy] Error:", errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
