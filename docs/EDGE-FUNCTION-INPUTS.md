# Edge Function Input Reference

This document describes the expected inputs for all Supabase edge functions in this project.

## Table of Contents

- [Salesforce Functions](#salesforce-functions)
  - [import-salesforce-campaign](#import-salesforce-campaign)
  - [update-prospect-salesforce](#update-prospect-salesforce)
  - [update-prospect-status-from-salesforce](#update-prospect-status-from-salesforce)
  - [save-campaign-prospects](#save-campaign-prospects)
- [Company Functions](#company-functions)
  - [receive-company-results](#receive-company-results)
  - [save-campaign-companies](#save-campaign-companies)
  - [delete-campaign](#delete-campaign)
- [Prospect Functions](#prospect-functions)
  - [receive-prospect-results](#receive-prospect-results)
  - [send-prospect-to-clay](#send-prospect-to-clay)
  - [clay-webhook](#clay-webhook)
  - [research-callback](#research-callback)
- [Utility Functions](#utility-functions)
  - [research-proxy](#research-proxy)
  - [test-webhook](#test-webhook)

---

## Salesforce Functions

### import-salesforce-campaign

**Path:** `supabase/functions/import-salesforce-campaign/index.ts`

Imports accounts/companies from a Salesforce campaign via n8n webhook.

```typescript
{
  salesforce_campaign_id: string  // Required - Salesforce campaign ID
  campaign_id: string             // Required - Local campaign ID (UUID)
  user_id: string                 // Required - UUID of the user
  webhook_url?: string            // Optional - N8N webhook URL (falls back to user_integrations)
}
```

**Response:**
```json
{
  "success": true,
  "imported_count": 5,
  "companies": [...]
}
```

---

### update-prospect-salesforce

**Path:** `supabase/functions/update-prospect-salesforce/index.ts`

Syncs a prospect with Salesforce contact information.

```typescript
{
  prospect_id: string             // Required - UUID of prospect
  salesforce_contact_id: string   // Required - Salesforce Contact ID (max 100 chars)
  salesforce_contact_url?: string // Optional - Salesforce contact URL
  synced_at?: string              // Optional - ISO timestamp (defaults to now)
  sync_status?: string            // Optional - Status string (defaults to 'success')
}
```

**Validation:**
- `prospect_id` must be a valid UUID
- `salesforce_contact_id` is required and max 100 characters

**Response:**
```json
{
  "success": true,
  "prospect_id": "...",
  "salesforce_contact_id": "...",
  "message": "Prospect updated with Salesforce contact info"
}
```

---

### update-prospect-status-from-salesforce

**Path:** `supabase/functions/update-prospect-status-from-salesforce/index.ts`

Updates prospect status based on Salesforce campaign member status.

```typescript
{
  salesforce_contact_id?: string    // One of these required - Salesforce Contact ID (max 100 chars)
  contact_email?: string            // One of these required - Contact email (max 255 chars)
  campaign_member_status?: string   // Optional - Salesforce campaign status
  has_responded?: boolean           // Optional - Whether contact has responded
  first_responded_date?: string     // Optional - ISO timestamp of first response
  last_modified_date?: string       // Optional - ISO timestamp of last modification
}
```

**Validation:**
- Requires either `salesforce_contact_id` OR `contact_email`
- `contact_email` is validated for email format
- `salesforce_contact_id` max 100 characters

**Status Mapping (Salesforce to internal):**
| Salesforce Status | Internal Status |
|---|---|
| `Sent` | `contacted` |
| `Responded` | `responded` |
| `Converted` | `converted` |
| `Added` | `synced_to_salesforce` |

**Response:**
```json
{
  "success": true,
  "updated_count": 1,
  "prospect_ids": ["..."],
  "salesforce_status": "Responded",
  "message": "Prospect status updated from Salesforce"
}
```

---

### save-campaign-prospects

**Path:** `supabase/functions/save-campaign-prospects/index.ts`

Saves prospects imported from a Salesforce campaign.

```typescript
{
  campaign_id: string              // Required - Local campaign ID
  user_id: string                  // Required - User ID
  salesforce_campaign_id: string   // Required - Salesforce campaign ID
  prospects: Prospect[]            // Required - Non-empty array
}
```

Each **prospect** object:

```typescript
{
  personal_id?: string             // Contact ID from Salesforce
  ContactId?: string               // Alternative Contact ID field
  salesforce_contact_id?: string   // Salesforce Contact ID
  salesforce_account_id?: string   // Salesforce Account ID
  first_name?: string
  last_name?: string
  title?: string                   // Job title
  job_title?: string               // Job title (alternative field)
  linkedin_url?: string
  company_name?: string
  website?: string                 // Company website
  company_linkedin?: string        // Company LinkedIn URL
  priority?: string                // Default 'medium'
  priority_reason?: string
}
```

**Response:**
```json
{
  "success": true,
  "inserted_count": 10,
  "skipped_count": 2,
  "total_processed": 12,
  "errors": [],
  "message": "Successfully imported 10 prospects from Salesforce campaign"
}
```

---

## Company Functions

### receive-company-results

**Path:** `supabase/functions/receive-company-results/index.ts`

Receives company research results from an n8n async workflow.

```typescript
{
  user_id: string                  // Required - UUID (validated against profiles)
  company_domain: string           // Required - Max 255 chars, valid domain format
  campaign_id?: string             // Optional - Campaign ID
  salesforce_account_id?: string   // Optional - Salesforce Account ID
  status?: string                  // Optional - "rejected" or other
  error_message?: string           // Optional - Error description
  company?: string | object        // One of these required - Company data (JSON or raw text)
  text?: string | object           // Fallback field for company data
}
```

The **company data** object (parsed from JSON, may be wrapped in markdown code fences):

```typescript
{
  company?: string                 // Company name
  company_status?: string          // e.g. "Operating"
  acquiredBy?: string              // Acquisition info
  cloud_preference?: {
    provider?: string              // Cloud provider name
    confidence?: number            // Confidence score
    evidence_urls?: string[]       // Supporting URLs
  }
}
```

**Note:** If `company_status === "Operating"`, prospect research is auto-triggered.

**Response:**
```json
{
  "received": true,
  "id": "...",
  "company_research_id": "...",
  "status": "completed",
  "message": "Company research saved. Ready for prospect research."
}
```

---

### save-campaign-companies

**Path:** `supabase/functions/save-campaign-companies/index.ts`

Saves companies selected from a Salesforce campaign import.

```typescript
{
  campaign_id: string              // Required - Campaign ID
  user_id: string                  // Required - User ID
  companies: Company[]             // Required - Non-empty array
}
```

Each **company** object:

```typescript
{
  salesforce_account_id: string    // Salesforce Account ID
  company_name: string             // Company name
  website?: string                 // Company website
  linkedin?: string                // LinkedIn URL
}
```

**Response:**
```json
{
  "success": true,
  "campaign_import_id": "...",
  "total_companies": 5,
  "companies_saved": 5,
  "message": "Campaign companies imported successfully"
}
```

---

### delete-campaign

**Path:** `supabase/functions/delete-campaign/index.ts`

Deletes a campaign and all associated data.

**Authentication:** Bearer token required (Authorization header).

```typescript
{
  campaign_id: string              // Required - Campaign ID to delete
}
```

The campaign must belong to the authenticated user. Deletion cascades through:
1. Prospect research records
2. Company research records
3. Contacts
4. Companies
5. Campaign

**Response:**
```json
{
  "success": true,
  "message": "Campaign deleted successfully"
}
```

---

## Prospect Functions

### receive-prospect-results

**Path:** `supabase/functions/receive-prospect-results/index.ts`

Receives prospect research results from an n8n async workflow. Max 100 contacts per request.

```typescript
{
  user_id: string                  // Required - UUID (validated)
  company_domain?: string          // Optional - Company domain
  company_research_id?: string     // Optional - Company research ID
  company_id?: string              // Optional - Direct company ID
  salesforce_account_id?: string   // Optional - Salesforce Account ID
  salesforce_campaign_id?: string  // Optional - Salesforce Campaign ID
  research_result_id?: string      // Optional - Legacy research result ID
  status?: string                  // Optional - "rejected" or other
  error_message?: string           // Optional - Error description
  prospect?: string | object       // One of these required - Prospect data
  text?: string | object           // Fallback field
  prospects?: string | object      // Alternative field
}
```

Each **contact** in the parsed data:

```typescript
{
  first_name?: string              // Max 100 chars
  last_name?: string               // Max 100 chars
  job_title?: string               // Max 200 chars (also accepts `title`)
  linkedin?: string                // Max 500 chars (also accepts `linkedin_url`)
  priority?: string
  priority_reason?: string
  pitch_type?: string
}
```

**Response:**
```json
{
  "received": true,
  "company_research_id": "...",
  "company_id": "...",
  "prospects_inserted": 3,
  "prospect_ids": ["...", "...", "..."],
  "status": "completed"
}
```

---

### send-prospect-to-clay

**Path:** `supabase/functions/send-prospect-to-clay/index.ts`

Sends prospect(s) to Clay for enrichment.

```typescript
{
  user_id: string                  // Required - User ID
  prospect_id?: string             // One of these required - Single prospect ID
  prospect_ids?: string[]          // One of these required - Multiple prospect IDs
}
```

Prospect must belong to the user. The function builds a Clay payload including prospect details, company info, and Salesforce IDs.

**Response:**
```json
{
  "success": true,
  "sent": 3,
  "failed": 0,
  "results": [
    { "prospect_id": "...", "success": true },
    { "prospect_id": "...", "success": true },
    { "prospect_id": "...", "success": true }
  ]
}
```

---

### clay-webhook

**Path:** `supabase/functions/clay-webhook/index.ts`

Receives enrichment results from Clay and updates prospects.

```typescript
{
  personal_id: string              // Required - UUID of prospect
  email?: string                   // Optional - Enriched email
  phone?: string                   // Optional - Enriched phone
  mobile?: string                  // Optional - Enriched mobile
  is_duplicate?: boolean           // Optional - If true, status set to 'duplicate'
  salesforce_url?: string          // Optional - Salesforce URL
  salesforce_account_id?: string   // Optional - Account ID
  company_id?: string              // Optional - Company ID
}
```

**Status Logic:**
- `is_duplicate === true` -> status = `'duplicate'`
- Otherwise -> status = `'inputted'`

The entire request body is also stored as `clay_response`.

**Response:**
```json
{
  "success": true,
  "prospect_id": "...",
  "status": "inputted",
  "is_duplicate": false
}
```

---

### research-callback

**Path:** `supabase/functions/research-callback/index.ts`

Legacy callback handler for n8n research completion.

```typescript
{
  event: string                    // Required - Event type
  campaign_id?: string             // Optional - Campaign ID (UUID format)
  company_id?: string              // Optional - Company ID
  contacts?: Contact[]             // Optional - Array of contacts (max 100)
}
```

Each **contact**:

```typescript
{
  first_name?: string
  last_name?: string
  name?: string                    // Full name
  company_name?: string
  company?: string                 // Company name (alternative)
  title?: string
  job_title?: string
  email?: string
  phone?: string
  linkedin_url?: string
  linkedin?: string                // LinkedIn URL (alternative)
  priority?: string                // Defaults to "medium"
}
```

**Event Types:**
- `"people_research_complete"` - Inserts contacts into contacts table
- `"research_complete"` - Legacy event type

**Response:**
```json
{
  "success": true,
  "contacts_created": 5,
  "company_id": "..."
}
```

---

## Utility Functions

### research-proxy

**Path:** `supabase/functions/research-proxy/index.ts`

Authenticated proxy for calling n8n webhooks from the frontend (bypasses CORS).

**Authentication:** Bearer token required.

```typescript
{
  webhookUrl: string               // Required - Webhook URL to call (HTTPS/HTTP)
  payload?: any                    // Optional - Request payload (defaults to {})
}
```

**SSRF Protection:** Blocks requests to private/internal addresses (localhost, 127.0.0.1, 10.x.x.x, 172.16.x.x, 192.168.x.x, etc.).

---

### test-webhook

**Path:** `supabase/functions/test-webhook/index.ts`

Tests webhook connectivity for user integrations.

**Authentication:** Bearer token required.

```typescript
{
  url: string                      // Required - Webhook URL to test (HTTPS/HTTP)
  user_id?: string                 // Optional - User ID (for logging)
}
```

Sends a test payload to the webhook and reports success/failure.

**Response:**
```json
{
  "success": true,
  "status": 200,
  "message": "Webhook is working!"
}
```

---

## Common Validation Rules

| Rule | Pattern |
|---|---|
| UUID | `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| Email | `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| Domain | `^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$` |

All functions support CORS with wildcard origin (`*`) and handle `OPTIONS` preflight requests.
