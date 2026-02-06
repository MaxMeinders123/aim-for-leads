// =============================================================================
// Hardcoded webhook URLs for n8n workflows
// Update N8N_BASE_URL to match your n8n instance
// =============================================================================

const N8N_BASE_URL = "https://engagetech12.app.n8n.cloud/webhook";

export const WEBHOOKS = {
  /** Salesforce Campaign Import - queries SF for target accounts */
  SALESFORCE_IMPORT: `${N8N_BASE_URL}/salesforce-campaign-import`,
  /** Company Research - validates company status (Operating/Acquired/Bankrupt) */
  COMPANY_RESEARCH: `${N8N_BASE_URL}/f545849d-1d19-43e7-9dfb-11e34166907f`,
  /** Prospect Research - finds decision-makers at company */
  PROSPECT_RESEARCH: `${N8N_BASE_URL}/845a71b9-f7fd-4466-9599-3cb79e34d3a4`,
  /** Clay Integration - enriches prospects and syncs to Salesforce */
  CLAY: `${N8N_BASE_URL}/clay-enrichment`,
} as const;

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
