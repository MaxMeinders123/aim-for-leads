# Aim for Leads - Core Context

## What This Is

SDR prospecting research & enrichment platform. Takes target companies (from Salesforce or manual input), runs AI-powered research to validate the company and find decision-makers, then sends prospects to Clay for email/phone enrichment. The SDR goes from "list of company names" to "qualified prospects with contact details ready for outreach" in minutes instead of hours.

## Tech Stack (never change these)

- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Zustand (state) + Sonner (toasts)
- **Backend**: Supabase (Postgres + Edge Functions in Deno + Realtime subscriptions + RLS)
- **AI Research**: n8n workflows + OpenAI GPT-4 Turbo (with web search + Serper fallback)
- **Enrichment**: Clay (webhook-based contact enrichment for email/phone)
- **LinkedIn Fallback**: Serper (for finding LinkedIn URLs when GPT-4 misses them during prospect research)
- **CRM**: Salesforce (campaign import, contact sync in progress)
- **Hosting**: Lovable platform

## Architecture (never change this pattern)

```
Frontend (React) → research-proxy edge function → n8n webhook (async)
                                                       ↓
                                        GPT-4 Turbo with web search + Serper fallback
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
4. **Prospect Research** → AI finds 3-7 decision-makers per company with priorities + pitch types (with Serper fallback for LinkedIn URLs)
5. **Clay Enrichment** → Prospects sent to Clay for email + phone enrichment
6. **Clay Callback** → Enriched data written back via clay-webhook (email, phone, Salesforce URL). Note: Some enrichments may fail; track via status field.
7. **Salesforce Contact Sync** → IN PROGRESS. Once complete, enriched prospects will auto-sync as Contacts to Salesforce.

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
3. **LinkedIn URLs must be validated** - Check format before storing. Track linkedin_validated in raw_data. Serper provides fallback discovery.
4. **Deduplication** - Never insert duplicate prospects (same name + company_research_id), even across re-research runs.
5. **ID passthrough** - All IDs (user_id, campaign_id, company_id, salesforce_*) must flow through every step.
6. **Supabase edge functions for callbacks** - n8n always POSTs results to edge functions, never directly to frontend.
7. **personal_id for Clay tracking** - Every prospect gets a UUID personal_id. This is how Clay matches enrichment results back.
8. **Clay must go through edge functions** - Frontend calls `send-prospect-to-clay`; do not POST raw contacts to Clay directly.
9. **Handle Clay failures** - Some enrichments fail. Track via status field ("new", "update", "fail") and allow manual retries for failed enrichments.

## Preferred Approach

- **Research quality > speed** - Use high reasoning effort + high web search context for Contact Search (this finds the prospects). Company Check can use medium.
- **Validate, don't trust** - Always validate LinkedIn URLs from AI. LLMs hallucinate URLs frequently.
- **Serper fallback in n8n** - Prospects without LinkedIn URLs from GPT-4 automatically get a Serper search to find their LinkedIn profiles during prospect research.
- **Clay for enrichment, not discovery** - Clay's job is email/phone enrichment. LinkedIn discovery happens in n8n (GPT-4 + Serper).
- **Handle Clay failures gracefully** - Some enrichments may fail (e.g., contact not found). Track status: "new", "update", or "fail" and allow retries.
- **Pass everything through** - When in doubt, include the ID in the payload. Losing an ID is worse than sending an extra field.
- **Pilot phase with 3 users** - Currently validating data quality and safety before scaling. Manual review of research output recommended during pilot.

## n8n Workflow Structure

```
Company Research Webhook
  ↓
Company Check (GPT-4 Turbo, medium effort)
  ↓
Format results
  ↓
POST to receive-company-results (Supabase edge function)

Prospect Research Webhook
  ↓
Contact Search (GPT-4 Turbo, high effort + web search)
  ↓
Parse JSON results
  ↓
LinkedIn Validation + Serper Fallback (if no LinkedIn URL found by GPT-4)
  ↓
Format results
  ↓
POST each prospect to receive-prospect-results (Supabase edge function)
```

**Serper Integration:** During prospect research, if GPT-4 cannot find a LinkedIn URL for a prospect, Serper performs a fallback search to locate their LinkedIn profile. This improves coverage and ensures more prospects have LinkedIn URLs for Clay enrichment.

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

## Current Status (Pilot Phase)

### ✅ LIVE
- Campaign creation & management
- Company import from Salesforce or manual entry
- Company research (AI validation of status, cloud provider, technical summary)
- Prospect research (AI identification of 3-7 decision-makers per company)
- Serper LinkedIn fallback discovery during prospect research
- Real-time progress updates via Supabase subscriptions
- Clay enrichment integration (email, phone, Salesforce URL)
- Clay webhook callback handling
- Multi-user isolation with Row Level Security
- CSV export of prospects

### ⚠️ IN PROGRESS / PARTIAL
- **Clay enrichment success rate**: Most enrichments succeed, but some fail (track via status field: "new", "update", or "fail"). Failed enrichments can be manually retried.
- **Salesforce contact sync**: Prospects can be sent to Clay with Salesforce IDs, but automatic contact creation in Salesforce is in development.

### 📋 PILOT PHASE NOTES
- **Current users**: 3 internal pilot users
- **Daily limit**: ~10 companies per SDR per day (to ensure manual safety checks)
- **Research time saved**: 2-3 hours → ~30 minutes per SDR daily
- **Recommended workflow**: SDRs should review research output before dialing to validate company status and prospect fit.
- **Success tracking**: Monitor Clay enrichment status. Retrigger failed enrichments if needed.
