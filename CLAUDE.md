# Aim for Leads - Core Context

## What This Is

SDR prospecting research & enrichment platform. Takes target companies (from Salesforce or manual input), runs AI-powered research to validate the company and find decision-makers, then sends prospects to Clay for email/phone enrichment. The SDR goes from "list of company names" to "qualified prospects with contact details ready for outreach" in minutes instead of hours.

## Tech Stack (never change these)

- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Zustand (state) + Sonner (toasts)
- **Backend**: Supabase (Postgres + Edge Functions in Deno + Realtime subscriptions + RLS)
- **AI Research**: n8n workflows + OpenAI GPT-5.2 (with web search)
- **Enrichment**: Clay (webhook-based contact enrichment)
- **CRM**: Salesforce (campaign import, contact sync)
- **Hosting**: Lovable platform

## Architecture (never change this pattern)

```
Frontend (React) → research-proxy edge function → n8n webhook (async)
                                                       ↓
                                                  GPT-5.2 with web search
                                                       ↓
                                              n8n POSTs results to:
                                              receive-company-results (edge function)
                                              receive-prospect-results (edge function)
                                                       ↓
                                              Supabase INSERT → Realtime → Frontend auto-updates
```

Research is **always async**. n8n responds immediately with `{"status": "processing"}`. Results arrive via callback edge functions. Frontend listens via Supabase Realtime subscriptions.

### Async UI expectations

- Company research results arrive first via `company_research` inserts; prospect results arrive later via `prospect_research` inserts.
- The UI should remain in an active "researching/awaiting callbacks" state until both company and prospect callbacks are received (no premature "complete" state).

## The Pipeline (this order never changes)

1. **Campaign Setup** → SDR defines targeting (product, region, titles, personas, pain points)
2. **Company Import** → From Salesforce campaign ID or manual (name + website)
3. **Company Research** → AI validates status (Operating/Acquired/Bankrupt/Not_Found) + cloud provider
4. **Prospect Research** → AI finds 3-7 decision-makers per company with priorities + pitch types
5. **LinkedIn Enrichment** → SerpAPI fallback for contacts found without LinkedIn URLs
6. **Clay Enrichment** → Prospects sent to Clay for email + phone + Salesforce sync
7. **Clay Callback** → Enriched data written back automatically via clay-webhook

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `campaigns` | Campaign targeting config (product, region, titles, personas, pain points) |
| `companies` | Target companies per campaign (name, website, SF account ID) |
| `company_research` | AI research results per company (status, cloud provider, summary) |
| `prospect_research` | Individual prospects found by AI (name, title, LinkedIn, priority, Clay status) |
| `user_integrations` | Per-user webhook URLs and settings |
| `profiles` | User profiles for auth |

## Key Edge Functions

| Function | Purpose |
|----------|---------|
| `research-proxy` | CORS proxy for n8n calls, validates auth |
| `receive-company-results` | n8n callback: saves company research, auto-triggers prospect research |
| `receive-prospect-results` | n8n callback: saves each prospect, validates LinkedIn URLs, deduplicates |
| `send-prospect-to-clay` | Sends prospect to Clay with personal_id + session_id + callback_webhook |
| `clay-webhook` | Receives enriched data from Clay (email, phone, SF URL), updates prospect |

## Key IDs That Flow Through the Pipeline

These IDs must ALWAYS be passed through every step. Losing one breaks downstream features:

- `user_id` → Auth/RLS isolation (never lose this)
- `campaign_id` → Links everything to the campaign
- `company_id` → Links to the companies table entry
- `company_research_id` → Links prospect to company research
- `salesforce_account_id` → Links to SF account for Clay/SF sync
- `salesforce_campaign_id` → Links to SF campaign for Clay/SF sync
- `personal_id` → UUID per prospect for Clay tracking (generated in receive-prospect-results)
- `clay_session_id` → UUID per Clay request for matching callback

## What Goes to Clay (outbound)

```json
{
  "personal_id": "uuid (for matching response back)",
  "session_id": "uuid (request-level matching)",
  "user_id": "uuid (optional, used to scope webhook updates)",
  "linkedin_url": "https://linkedin.com/in/...",
  "salesforce_account_id": "001XXXXXXX",
  "salesforce_campaign_id": "701XXXXXXX",
  "callback_webhook": "https://<supabase>/functions/v1/clay-webhook"
}
```

## What Comes Back from Clay (inbound)

```json
{
  "personal_id": "uuid (matches outbound)",
  "session_id": "uuid (matches outbound)",
  "is_duplicate": false,
  "email": "enriched@example.com",
  "phone": "+1-555-0000",
  "salesforce_url": "https://sf.salesforce.com/003XXXXX"
}
```

## Constraints (never violate these)

1. **RLS always enforced** - Every table filters by user_id. Users only see their own data.
2. **Async research only** - Never make the frontend wait for AI. Always use webhook + callback + realtime.
3. **LinkedIn URLs must be validated** - Check format before storing. Track linkedin_validated in raw_data.
4. **Deduplication** - Never insert duplicate prospects (same name + company_research_id).
5. **ID passthrough** - All IDs (campaign_id, company_id, salesforce_*) must flow through every step.
6. **Supabase edge functions for callbacks** - n8n always POSTs results to edge functions, never directly to frontend.
7. **personal_id for Clay tracking** - Every prospect gets a UUID personal_id. This is how Clay matches results back.
8. **Clay must go through edge functions** - Frontend should call `send-prospect-to-clay`; do not POST raw contacts to Clay directly.

## Preferred Approach

- **Research quality > speed** - Use high reasoning effort + high web search context for Contact Search (this finds the prospects). Company Check can use medium.
- **Validate, don't trust** - Always validate LinkedIn URLs from AI. LLMs hallucinate URLs frequently.
- **SerpAPI fallback** - Contacts found without LinkedIn URLs get a second-pass SerpAPI search to find their profiles.
- **Clay for enrichment, not discovery** - Clay's job is email/phone/SF sync. LinkedIn discovery happens in n8n.
- **Pass everything through** - When in doubt, include the ID in the payload. Losing an ID is worse than sending an extra field.

## n8n Workflow Structure

```
Company Research Webhook → Company Check (GPT) → Format → Send to Supabase
Prospect Research Webhook → Contact Search (GPT, high effort) → Parse JSON → Validate & Format (LinkedIn validation) → Send to Supabase
```

The n8n workflow JSON is in `/n8n-workflow-async.json`. Import it into n8n to update.

## File Locations

| What | Where |
|------|-------|
| Frontend app | `src/` |
| API calls | `src/services/api.ts` |
| Webhook URLs | `src/lib/constants.ts` |
| State store | `src/stores/appStore.ts` |
| Edge functions | `supabase/functions/` |
| n8n workflow | `n8n-workflow-async.json` |
| Product docs | `docs/` |
