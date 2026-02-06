# Lovable Prompt: B2B Prospecting Research Platform

## What Has Been Built

A complete B2B SDR prospecting research platform with 4 pages + settings:

### Architecture
- **React 18 + TypeScript + Vite + Tailwind + Shadcn/UI**
- **Supabase** for auth, Postgres, realtime subscriptions, edge functions
- **n8n** for Salesforce import + AI research workflows
- **Zustand** for state management
- **Sonner** for toast notifications

### Routes
| Route | Page | Purpose |
|-------|------|---------|
| `/campaigns` | Campaigns.tsx | Create/edit/delete campaigns with 4-step modal |
| `/companies/:campaignId` | Companies.tsx | Import from Salesforce or add companies manually |
| `/research/:campaignId` | Research.tsx | Real-time AI research with company status + prospect discovery |
| `/contacts/:campaignId` | ContactsView.tsx | Review prospects, send to Clay, export CSV |
| `/settings` | Settings.tsx | Webhook config (read-only), dark mode, sound effects |

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/constants.ts` | Hardcoded webhook URLs, status enums |
| `src/services/api.ts` | All Supabase + n8n API calls |
| `src/stores/appStore.ts` | Zustand store (campaigns, companies, contacts, research progress) |
| `src/components/AppLayout.tsx` | Sidebar layout wrapper |
| `src/components/PageHeader.tsx` | Reusable page header with back button |

### Webhook URLs (Hardcoded in `src/lib/constants.ts`)
```
N8N_BASE_URL = https://engagetech.app.n8n.cloud/webhook

SALESFORCE_IMPORT: /salesforce-campaign-import
COMPANY_RESEARCH:  /f545849d-1d19-43e7-9dfb-11e34166907f
PROSPECT_RESEARCH: /845a71b9-f7fd-4466-9599-3cb79e34d3a4
```

### Supabase Tables
- `campaigns` - with rich fields: product, product_category, target_region, job_titles, personas, target_verticals, primary_angle, secondary_angle, pain_points, technical_focus
- `companies` - single table with nullable Salesforce fields (salesforce_account_id, salesforce_campaign_id) for both imported and manual entries
- `company_research` - AI research results per company (company_status, raw_data)
- `prospect_research` - individual prospects found by AI (first_name, last_name, job_title, linkedin_url, priority, pitch_type, sent_to_clay)
- `profiles` - user profiles
- `user_integrations` - per-user settings (dark_mode, sound_effects, clay_webhook_url)

### Edge Functions (Deno)
| Function | Purpose |
|----------|---------|
| `research-proxy` | CORS proxy for n8n webhook calls |
| `import-salesforce-campaign` | Calls n8n SF import, saves companies to DB |
| `receive-company-results` | Callback from n8n, saves to company_research |
| `receive-prospect-results` | Callback from n8n, saves to prospect_research |
| `send-prospect-to-clay` | Sends prospect to Clay webhook for enrichment |
| `delete-campaign` | Cascading delete of campaign + related data |

### User Flow
1. **Create Campaign** - 4-step modal: Name > Product/Region > Job Titles/Personas > Angles/Pain Points
2. **Add Companies** - Import from Salesforce Campaign ID OR add manually (name/website/linkedin)
3. **Research** - Select companies, click "Start Research". AI checks company status (Operating/Acquired/Bankrupt/Not_Found), then finds 3-7 decision-makers per company
4. **Review Contacts** - Company accordions with prospect details. Send individually or bulk to Clay for email/phone enrichment
5. **Export** - CSV export of all prospects

---

## What Needs To Be Done Next

### Priority 1: Research Flow Polish
The research page works but could use these improvements:

1. **Persist research state across navigation** - Currently uses localStorage. When user navigates away and returns, restore research progress from `company_research` and `prospect_research` tables instead of just localStorage.

2. **Auto-start prospect research after company research** - Currently the company research webhook returns data via `research-proxy`, but prospect research should automatically kick off once company data is received. The flow should be:
   - Company webhook returns company status
   - If status is "Operating" or "Acquired" (still active), automatically trigger prospect webhook
   - If status is "Bankrupt" or "Not_Found", skip prospect research and show appropriate message

3. **Progress state sync with database** - The `Research.tsx` page uses Supabase realtime subscriptions on `company_research` and `prospect_research` tables. Ensure the realtime channel filters work correctly and update the UI when n8n callbacks write to the database.

### Priority 2: Clay Integration
The `send-prospect-to-clay` edge function is built and works. It reads the Clay webhook URL from `user_integrations.clay_webhook_url`. What's needed:

1. **Clay webhook URL input in Settings** - Add an input field in Settings.tsx where users can paste their Clay webhook URL. Save it to `user_integrations.clay_webhook_url`.

2. **Clay callback handling** - When Clay enriches a prospect, it calls back with email + phone data. Create an edge function `clay-webhook` that:
   - Receives: `{ personal_id, email, phone, mobile, is_duplicate, salesforce_url }`
   - Updates `prospect_research` with email, phone, status = 'inputted' or 'duplicate'
   - The UI already has realtime subscriptions that will auto-update when the row changes

### Priority 3: Salesforce Contact Sync (Requires Freddy)
After Clay enriches prospects with email/phone, the final step is creating Contacts in Salesforce. This requires:

1. **Freddy creates Connected App** in Salesforce org (OAuth credentials)
2. **n8n workflow** for SF Contact creation is ready (see `docs/n8n-salesforce-sync-workflow.json`)
3. **Frontend button** - Add "Push to Salesforce" button on ContactsView.tsx for enriched prospects
4. **Edge function** - Create `sync-to-salesforce` that calls the n8n SF sync webhook

### Priority 4: UI Polish
1. **Campaign stats** - Currently `companies_count` and `contacts_count` on campaign cards come from DB. Ensure these are computed counts (COUNT of companies WHERE campaign_id, COUNT of prospect_research WHERE company_research.campaign_id).
2. **Batch operations** - "Select All" + "Send All to Clay" on contacts page already works. Add "Export Selected" for partial CSV export.
3. **Research history** - Show past research runs on the research page (completed campaigns).

---

## Database Schema Reference

### campaigns
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
name TEXT NOT NULL
product TEXT
product_category TEXT
target_region TEXT
job_titles TEXT
personas TEXT
target_verticals TEXT
primary_angle TEXT
secondary_angle TEXT
pain_points TEXT
technical_focus TEXT
companies_count INTEGER DEFAULT 0
contacts_count INTEGER DEFAULT 0
created_at TIMESTAMP DEFAULT now()
updated_at TIMESTAMP DEFAULT now()
```

### companies
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
campaign_id UUID REFERENCES campaigns(id)
name TEXT NOT NULL
website TEXT
linkedin_url TEXT
salesforce_account_id TEXT -- nullable for manual entries
salesforce_campaign_id TEXT -- nullable for manual entries
status TEXT DEFAULT 'imported'
created_at TIMESTAMP DEFAULT now()
updated_at TIMESTAMP DEFAULT now()
```

### company_research
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
campaign_id UUID REFERENCES campaigns(id)
company_domain TEXT
company_name TEXT
company_status TEXT -- Operating, Acquired, Bankrupt, Not_Found
raw_data JSONB
status TEXT DEFAULT 'pending'
created_at TIMESTAMP DEFAULT now()
```

### prospect_research
```sql
id UUID PRIMARY KEY
user_id UUID
company_research_id UUID REFERENCES company_research(id)
first_name TEXT
last_name TEXT
job_title TEXT
linkedin_url TEXT
priority TEXT -- High, Medium, Low
priority_reason TEXT
pitch_type TEXT -- Technical, Business, Executive
email TEXT -- populated after Clay enrichment
phone TEXT -- populated after Clay enrichment
mobile TEXT
status TEXT DEFAULT 'pending' -- pending, sent_to_clay, inputted, duplicate
sent_to_clay BOOLEAN DEFAULT false
sent_to_clay_at TIMESTAMP
sent_to_clay_resp JSONB
salesforce_url TEXT
personal_id UUID
raw_data JSONB
created_at TIMESTAMP DEFAULT now()
```

---

## n8n Workflow Reference

### Workflow 1: Salesforce Campaign Import (ACTIVE)
- **Webhook**: `POST /salesforce-campaign-import`
- **Flow**: Webhook -> Salesforce SOQL (Prospecting_Status__c = 'Target Account') -> Extract unique companies -> Return accounts array
- **See**: `docs/n8n-salesforce-campaign-import-workflow.json`

### Workflow 2: Research (ACTIVE)
- **Company Webhook**: `POST /f545849d-1d19-43e7-9dfb-11e34166907f`
- **Prospect Webhook**: `POST /845a71b9-f7fd-4466-9599-3cb79e34d3a4`
- **Flow**: Webhook -> GPT-5.2 (with web search) -> Parse JSON -> Callback to Supabase edge function
- **See**: `docs/n8n-research-workflow.json`

### Workflow 3: Salesforce Contact Sync (NOT ACTIVE - needs Freddy)
- **Webhook**: `POST /salesforce-contact-sync`
- **Flow**: Webhook -> Check existing Contact -> Create/Reuse Contact -> Add CampaignMember -> Return SF URL
- **See**: `docs/n8n-salesforce-sync-workflow.json`
