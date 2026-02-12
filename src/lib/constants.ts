// =============================================================================
// Constants — no webhook URLs exposed in frontend
// =============================================================================

// Supabase Edge Function endpoints (auto-derived from project URL)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const EDGE_FUNCTIONS = {
  RESEARCH_PROXY: `${SUPABASE_URL}/functions/v1/research-proxy`,
  IMPORT_SALESFORCE: `${SUPABASE_URL}/functions/v1/import-salesforce-campaign`,
  SEND_TO_CLAY: `${SUPABASE_URL}/functions/v1/send-prospect-to-clay`,
  DELETE_CAMPAIGN: `${SUPABASE_URL}/functions/v1/delete-campaign`,
} as const;

// Company status types from AI research
export const COMPANY_STATUSES = {
  OPERATING: "Operating",
  ACQUIRED: "Acquired",
  RENAMED: "Renamed",
  BANKRUPT: "Bankrupt",
  NOT_FOUND: "Not_Found",
} as const;

// Prospect Clay statuses
export const CLAY_STATUSES = {
  NOT_SENT: "not_sent",
  SENT: "sent_to_clay",
  PENDING: "pending",
  INPUTTED: "inputted",
  DUPLICATE: "duplicate",
  FAILED: "failed",
} as const;
