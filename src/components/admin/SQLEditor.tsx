import React, { useState } from "react";
import { supabase } from "@/utils/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader, Copy } from "lucide-react";

interface QueryResult {
  success: boolean;
  results: any[];
  query: string;
  executedAt: string;
  userId: string;
  error?: string;
  details?: string;
}

export function SQLEditor() {
  const [query, setQuery] = useState("SELECT * FROM public.database_schema LIMIT 10;");
  const [results, setResults] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "results">("editor");

  const handleExecuteQuery = async () => {
    if (!query.trim()) {
      setError("Please enter a SQL query");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: session_error } = await supabase.auth.getSession();
      if (session_error || !data.session) {
        setError("Not authenticated. Please log in.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sql-editor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ query }),
        }
      );

      const responseData: QueryResult = await response.json();

      if (!response.ok) {
        setError(responseData.error || "Query execution failed");
        setResults(null);
      } else {
        setResults(responseData);
        setError(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(query);
  };

  const handleLoadSchemaQuery = () => {
    setQuery("SELECT * FROM public.database_schema;");
  };

  const handleLoadCompanyResearchQuery = () => {
    setQuery(
      "SELECT id, user_id, company_domain, company_name, status, created_at FROM public.company_research LIMIT 50;"
    );
  };

  const handleLoadProspectResearchQuery = () => {
    setQuery(
      "SELECT id, company_research_id, user_id, first_name, last_name, job_title, sent_to_clay FROM public.prospect_research LIMIT 50;"
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Database SQL Editor</CardTitle>
          <CardDescription>
            Execute read-only SQL queries on your database. Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Query Templates */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadSchemaQuery}
              className="text-xs"
            >
              Schema
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadCompanyResearchQuery}
              className="text-xs"
            >
              Company Research
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadProspectResearchQuery}
              className="text-xs"
            >
              Prospect Research
            </Button>
          </div>

          {/* Query Editor */}
          <div className="space-y-2">
            <label className="text-sm font-medium">SQL Query</label>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your SQL query..."
              className="font-mono text-sm min-h-32"
            />
          </div>

          {/* Execute Button */}
          <div className="flex gap-2">
            <Button
              onClick={handleExecuteQuery}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                "Execute Query"
              )}
            </Button>
            <Button
              onClick={handleCopyQuery}
              variant="outline"
              size="icon"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Error</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Success Display */}
          {results && !error && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md flex gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                <p className="font-medium">
                  Query executed successfully at {new Date(results.executedAt).toLocaleTimeString()}
                </p>
                <p>
                  {results.results.length} row{results.results.length !== 1 ? "s" : ""} returned
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Display */}
      {results && results.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Query Results</CardTitle>
            <CardDescription>
              {results.results.length} row{results.results.length !== 1 ? "s" : ""} returned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {results.results.length > 0 &&
                      Object.keys(results.results[0].result || {}).map((key) => (
                        <th
                          key={key}
                          className="text-left px-3 py-2 font-semibold text-gray-700"
                        >
                          {key}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b hover:bg-gray-50 last:border-b-0"
                    >
                      {Object.values(row.result || {}).map((value: any, colIdx) => (
                        <td
                          key={colIdx}
                          className="px-3 py-2 text-gray-700 break-words max-w-xs"
                        >
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty Results */}
      {results && results.results.length === 0 && !error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">No results returned from query</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
