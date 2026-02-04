
# Fix n8n Integration: Separate Company and Prospect Research Flow

## Overview

This plan addresses the issues with the current n8n integration by creating a properly separated, sequential research flow with:
1. **Separate Edge Functions** for company and prospect research
2. **Proper Database Schema** with company_research and prospect_research tables
3. **Sequential Processing** where prospect research only starts after company research completes
4. **Individual Prospect Selection** for sending to Clay (not just bulk)

## Current Problems Identified

1. **Single Combined Endpoint**: `receive-research-results` handles both company and prospect data, causing race conditions when n8n sends both types simultaneously
2. **Auto-Detection Issues**: The field detection logic (`company`, ` company`, `prospect`) is fragile
3. **No True Sequential Dependency**: n8n can send prospect data before company data is saved
4. **Bulk Clay Only**: All prospects are sent to Clay at once, no individual selection
5. **Data Mixed in One Table**: `research_results` table stores both company and prospect data as JSONB blobs instead of normalized tables
6. **No Foreign Key Links**: Prospects aren't properly linked to their parent company records

## Solution Architecture

```text
+------------------+     +-----------------------+     +------------------------+
| User Initiates   |     | Frontend sends to n8n |     | n8n Company Research   |
| Research         | --> | Company Webhook       | --> | Workflow               |
+------------------+     +-----------------------+     +------------------------+
                                                                  |
                                                                  v
+------------------------+     +------------------------+     +------------------------+
| company_research table | <-- | receive-company-results| <-- | n8n POSTs results      |
| (company_id, data...)  |     | Edge Function          |     | to edge function       |
+------------------------+     +------------------------+     +------------------------+
         |
         | status = 'completed' triggers...
         v
+------------------------+     +------------------------+     +------------------------+
| Frontend detects       |     | n8n Prospect Research  | <-- | Automatic trigger OR   |
| completion, shows      | --> | Workflow               |     | manual button          |
| "Start Prospect"       |     +------------------------+     +------------------------+
+------------------------+                |
                                          v
+------------------------+     +------------------------+     +------------------------+
| prospect_research table| <-- | receive-prospect-results| <-- | n8n POSTs results     |
| (prospect_id, company  |     | Edge Function           |     | to edge function      |
| _id FK, data...)       |     +-------------------------+     +-----------------------+
+------------------------+
         |
         v
+------------------------+     +------------------------+
| Frontend shows         |     | User selects prospects |
| prospects with         | --> | individually to send   |
| checkboxes             |     | to Clay                |
+------------------------+     +------------------------+
```

## Implementation Details

### 1. Database Schema Changes

**New Table: `company_research`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| campaign_id | uuid | FK to campaigns (optional) |
| company_domain | text | Domain being researched |
| company_name | text | Resolved company name |
| status | text | 'processing', 'completed', 'failed' |
| company_status | text | 'Operating', 'Acquired', 'Bankrupt' |
| acquired_by | text | If acquired, by whom |
| cloud_provider | text | Detected cloud preference |
| cloud_confidence | integer | Confidence score (0-100) |
| evidence_urls | text[] | Array of evidence URLs |
| raw_data | jsonb | Full raw response for debugging |
| created_at | timestamptz | When created |
| updated_at | timestamptz | Last update |

**New Table: `prospect_research`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| company_research_id | uuid | FK to company_research |
| user_id | uuid | FK to auth.users |
| first_name | text | Prospect first name |
| last_name | text | Prospect last name |
| job_title | text | Current job title |
| linkedin_url | text | LinkedIn profile URL |
| priority | text | 'High', 'Medium', 'Low' |
| priority_reason | text | Why this priority |
| pitch_type | text | Recommended pitch angle |
| sent_to_clay | boolean | Has been sent to Clay |
| sent_to_clay_at | timestamptz | When sent to Clay |
| created_at | timestamptz | When created |

### 2. Edge Function: `receive-company-results` (Update)

Updates the existing function to:
- Accept company research data from n8n
- Parse the raw LLM text (strip markdown fences)
- Insert into `company_research` table with normalized columns
- Return the `company_research_id` for n8n to use in prospect research
- NOT auto-trigger prospect research (let frontend control this)

**Expected Payload:**
```json
{
  "user_id": "uuid",
  "company_domain": "klm.com",
  "company": "```json\n{...}\n```",
  "status": "completed"
}
```

### 3. Edge Function: `receive-prospect-results` (Update)

Updates the existing function to:
- Accept prospect research data from n8n
- Require `company_research_id` to link prospects to company
- Parse the raw LLM text with contacts array
- Insert each prospect as a separate row in `prospect_research` table
- Set `sent_to_clay = false` by default

**Expected Payload:**
```json
{
  "user_id": "uuid",
  "company_domain": "klm.com",
  "company_research_id": "uuid",
  "prospect": "```json\n{...}\n```",
  "status": "completed"
}
```

### 4. New Edge Function: `send-prospect-to-clay`

A new function specifically for sending individual prospects to Clay:
- Accepts `prospect_id` (single) or `prospect_ids` (array)
- Fetches prospect data and related company data
- Sends to configured Clay webhook
- Updates `sent_to_clay = true` and `sent_to_clay_at` timestamp
- Returns success/failure per prospect

### 5. Frontend Updates

**A. Research System Page (`ResearchSystem.tsx`)**

Major refactor to:
- Display company research status in a dedicated card
- Show "Start Prospect Research" button only after company research completes
- Display prospects in a table with checkboxes
- Add "Send to Clay" button for selected prospects
- Add individual "Send to Clay" icon button on each prospect row
- Show "Sent" badge on prospects already sent to Clay

**B. New Components**

Create reusable components:
- `CompanyResearchCard` - Shows company status, cloud preference, evidence
- `ProspectTable` - Table of prospects with selection, sorting, Clay status
- `ProspectRow` - Individual prospect with checkbox and Clay button

**C. Real-time Updates**

Separate subscriptions for:
- `company_research` table changes
- `prospect_research` table changes

### 6. Delete Unified Endpoint

After implementing the separated endpoints, delete:
- `supabase/functions/receive-research-results/` directory

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/[timestamp]_separate_research_tables.sql` | Create | New company_research and prospect_research tables |
| `supabase/functions/receive-company-results/index.ts` | Modify | Insert into company_research table |
| `supabase/functions/receive-prospect-results/index.ts` | Modify | Insert into prospect_research table with FK |
| `supabase/functions/send-prospect-to-clay/index.ts` | Create | New endpoint for individual Clay sending |
| `src/pages/ResearchSystem.tsx` | Modify | Refactor for two-step flow with individual selection |
| `src/components/research/CompanyResearchCard.tsx` | Create | Company research display component |
| `src/components/research/ProspectTable.tsx` | Create | Prospects table with selection |
| `supabase/functions/receive-research-results/` | Delete | Remove unified endpoint |

## RLS Policies

**company_research table:**
- SELECT: Users can view their own company research (`user_id = auth.uid()`)
- INSERT: Edge functions can insert (using service role)
- UPDATE: Edge functions can update (using service role)

**prospect_research table:**
- SELECT: Users can view prospects for their company research
- INSERT: Edge functions can insert (using service role)
- UPDATE: Users can update `sent_to_clay` status; edge functions can update all

## n8n Workflow Configuration

Update n8n workflows to:

1. **Company Research Workflow:**
   - POST to `receive-company-results`
   - Include: `user_id`, `company_domain`, `company` (raw LLM text)
   - Do NOT auto-trigger prospect research

2. **Prospect Research Workflow:**
   - Triggered separately (by user action or another n8n trigger)
   - POST to `receive-prospect-results`
   - Include: `user_id`, `company_domain`, `company_research_id`, `prospect` (raw LLM text)

## User Flow After Implementation

1. User enters company domain and clicks "Start Company Research"
2. Company research runs, results appear in real-time
3. "Start Prospect Research" button becomes active
4. User clicks button to trigger prospect research
5. Prospects appear in table as they're found
6. User selects prospects with checkboxes
7. User clicks "Send Selected to Clay" or individual Clay buttons
8. Sent prospects show "Sent" badge

## Technical Summary

- **2 new database tables** with proper foreign keys
- **3 edge functions** (update 2 existing, create 1 new)
- **1 edge function deleted** (unified endpoint)
- **3 new UI components** for cleaner code organization
- **Separate realtime subscriptions** for company and prospect data
- **Individual prospect Clay sending** with tracking
