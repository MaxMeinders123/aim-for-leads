import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allowed SQL query patterns (read-only and safe operations)
const ALLOWED_PATTERNS = [
  /^\s*SELECT\s+/i,
  /^\s*SHOW\s+/i,
  /^\s*DESCRIBE\s+/i,
  /^\s*EXPLAIN\s+/i,
];

// Blocked patterns to prevent destructive operations
const BLOCKED_PATTERNS = [
  /DROP\s+TABLE/i,
  /DROP\s+SCHEMA/i,
  /DELETE\s+FROM/i,
  /TRUNCATE\s+/i,
  /ALTER\s+TABLE\s+DROP/i,
  /UPDATE\s+/i,
  /INSERT\s+INTO/i,
  /CREATE\s+TABLE/i,
  /GRANT\s+/i,
  /REVOKE\s+/i,
  /BEGIN\s+TRANSACTION/i,
  /COMMIT\s+/i,
  /ROLLBACK\s+/i,
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is authenticated
    const { data: userData, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Query parameter is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate query is allowed
    const isAllowed = ALLOWED_PATTERNS.some(pattern => pattern.test(query));
    if (!isAllowed) {
      return new Response(
        JSON.stringify({
          error: "Query type not allowed. Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are permitted."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for blocked patterns
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(query));
    if (isBlocked) {
      return new Response(
        JSON.stringify({
          error: "Query contains blocked operations. Destructive operations are not allowed."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sql-editor] User ${userData.user.id} executing query: ${query.substring(0, 100)}`);

    // Execute query using service role
    const { data, error } = await supabase.rpc("execute_sql_query", {
      query,
    });

    if (error) {
      console.error(`[sql-editor] Query error:`, error);
      return new Response(
        JSON.stringify({
          error: "Query execution failed",
          details: error.message
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: data,
        query: query,
        executedAt: new Date().toISOString(),
        userId: userData.user.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[sql-editor] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
