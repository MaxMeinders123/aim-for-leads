# Aim for Leads — Product Documentation
**Version:** 1.1 (Updated February 2026)
**Status:** Pilot Phase (3 internal users)

---

## Aim

Automate the research and qualification of target accounts and their decision-makers for SDR outbound prospecting. Aim for Leads takes a list of companies from a Salesforce campaign, runs AI-powered research to validate the company and identify relevant prospects, then sends those prospects to Clay for contact enrichment — reducing manual research time from 2-3 hours daily per SDR to approximately 30 minutes of active work (with manual safety checks during pilot phase).

---

## End User Value

An SDR can import an entire Salesforce campaign with a single click, trigger automated AI-powered research, and within minutes have a qualified list of decision-makers with their job titles, LinkedIn profiles, priority rankings, and personalised pitch angles — all without manually Googling each company. Once enriched through Clay, the SDR has direct contact details (email, phone) ready for outreach. This directly increases dial volume, conversation quality, and the number of qualified prospects per day, ultimately driving higher PPD and pipeline generation.

---

## Metrics That Matter

- **Dials per SDR per day** (volume increase)
- **Average conversation length** (quality of prospect qualification)
- **Prospects researched per campaign** (output volume)
- **Research time saved per SDR daily** (2-3 hours → 30 minutes)
- **Dial to conversation rate** (prospect quality)
- **Clay enrichment success rate** (track failures, improve coverage)
- **Manual safety checks required** (reduce as confidence in AI output grows)

---

## Product Overview

Aim for Leads generates research intelligence and qualified prospect lists by running AI-powered analysis against target company accounts. The platform connects to Salesforce to import campaign target accounts, uses n8n workflows with OpenAI GPT-4 Turbo to research each company's status and identify key decision-makers (with Serper fallback for LinkedIn discovery), then hands off qualified prospects to Clay for email and phone enrichment.

The system runs a two-step research pipeline:

1. **Company Research** — Validates whether the company is still operating (Operating/Acquired/Bankrupt/Not Found), identifies their cloud provider and confidence level, and gathers a technical summary.
2. **Prospect Research** — Uses the campaign targeting criteria (job titles, personas, verticals, pain points, seniority levels) to identify 3-7 relevant decision-makers at the company, ranking them by priority with personalised pitch recommendations. If GPT-4 cannot find LinkedIn URLs, Serper performs a fallback search.

Research is triggered on-demand when an SDR selects companies and clicks "Start Research" within their campaign. Results are stored in Supabase with real-time updates pushed to the frontend, so SDRs can see research completing live without refreshing. Qualified prospects are then sent to Clay for contact enrichment via webhook.

---

## Product Objectives

- Automate company validation and prospect identification for all target accounts in a Salesforce campaign
- Generate prioritised prospect lists with pitch angles tailored to the campaign's product, personas, and pain points
- Reduce manual SDR research time from 2-3 hours per day to approximately 30 minutes with manual safety checks
- Maintain a clean data flow from Salesforce import through to Clay enrichment and back
- Support pilot phase with ~10 companies per day per SDR, with options to scale as data quality and confidence improve

---

## Project Hypothesis

Previously, SDRs would manually research each target account — visiting the company website, checking LinkedIn, trying to identify the right people to call, and figuring out what to say. This took significant time per account (2-3 hours daily per SDR) and the quality varied depending on the SDR's experience, time, and effort. By automating the research step with AI and connecting it directly to the enrichment pipeline (Clay) and CRM (Salesforce), we standardise the quality of research while dramatically reducing the time investment, allowing SDRs to focus on conversations and dials rather than research. The pilot phase validates data quality and safety before scaling across the wider team.

---

## How Does It Work?

### Step 1: Campaign Setup

An SDR creates a campaign with targeting criteria that guides the AI research:

| Field | Purpose | Example |
|-------|---------|---------|
| Name | Campaign identifier | "AWS Migration - Benelux Q1" |
| Product | What's being sold | "Cloud Security Assessment" |
| Target Region | Geographic focus | "Benelux, DACH" |
| Job Titles | Who to find | "CTO, VP Engineering, IT Director" |
| Seniority Levels | Target decision-maker level | "C-Level, Director, Manager" |
| Personas | Decision-maker profiles | "Budget holder for cloud infrastructure" |
| Target Verticals | Industries | "FinTech, Healthcare" |
| Pain Points | Problems to solve | "High cloud costs, security compliance gaps" |
| Primary Angle | Main value prop | "Reduce AWS spend by 30%" |

### Step 2: Company Import

Companies are imported from Salesforce using the campaign ID. The system queries Salesforce for all CampaignMembers with Prospecting_Status__c = 'Target Account', deduplicates by Account ID, and imports them into the platform with their Salesforce Account ID, name, and website. Companies can also be added manually (name + website + optional LinkedIn URL).

**Pilot Phase:** Research is limited to ~10 companies per day per SDR to ensure manual safety checks and data quality validation before scaling.

### Step 3: Company Research (AI) — LIVE ✅

An SDR selects companies and clicks "Start Research". For each selected company, the platform sends a request to the n8n company research webhook. The AI:

1. Validates the company status: Operating, Acquired (still independent?), Renamed, Bankrupt, or Not Found
2. If acquired — checks whether it still operates independently
3. Identifies the cloud provider (AWS/Azure/GCP/Other) with a confidence score (0-100)
4. Generates a technical summary of the company

**Result:** Saved to the `company_research` table; frontend updates in real-time via Supabase Realtime subscriptions.

**Auto-trigger logic:**
- If Operating or Acquired (independent) → prospect research is automatically triggered
- If Bankrupt → research stops; SDR is notified
- If Acquired (not independent) → SDR gets a "Research Acquirer Instead" option

### Step 4: Prospect Research (AI) — LIVE ✅

The prospect research webhook receives the campaign context plus the company research results. The AI (GPT-4 Turbo with web search):

1. Searches for 3-7 decision-makers matching the campaign's target job titles, seniority levels, and personas
2. Assigns each prospect a priority (High/Medium/Low) with reasoning based on decision-making authority and budget control
3. Recommends a pitch type per prospect (Technical/Business/Executive)
4. Extracts LinkedIn URLs where available

**LinkedIn Fallback (Serper):** If GPT-4 cannot find a prospect's LinkedIn URL, Serper performs an automated search to locate their profile. This improves coverage and ensures more prospects have LinkedIn URLs for Clay enrichment.

**Result:** Each prospect is saved as a separate record in `prospect_research` with a unique `personal_id` (UUID) for Clay tracking. Results are tagged with campaign-specific metadata to inform SDR outreach strategy.

### Step 5: Clay Enrichment — LIVE ✅ (with noted failures)

From the Contacts view, the SDR reviews the AI-generated prospects and sends them to Clay for enrichment. The Clay payload includes:

```json
{
  "personal_id": "unique-uuid-for-matching",
  "linkedin_url": "https://linkedin.com/in/prospect",
  "salesforce_account_id": "001XXXXXXX",
  "salesforce_campaign_id": "701XXXXXXX"
}
```

The system tracks which prospects have been sent (`sent_to_clay`, `sent_to_clay_at`) and prevents duplicate sends. Clay returns enriched contact data (email, phone, Salesforce URL) via webhook callback.

**⚠️ Note:** Clay enrichment success rate is good, but some enrichments fail (e.g., contact not in Clay's database). Failed enrichments are tracked with status: "fail". SDRs can manually retry failed enrichments.

### Step 6: Salesforce Contact Sync — IN PROGRESS 🔄

Once Clay enrichment is complete, enriched prospects will be synced back to Salesforce as Contacts with all research data, campaign context, and contact details intact. This step is currently in development. When live, enriched data will auto-sync with minimal manual intervention.

---

## Technologies Used

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui |
| State Management | Zustand |
| Backend | Supabase (PostgreSQL + Edge Functions in Deno + Realtime) |
| AI Research | n8n workflows + OpenAI GPT-4 Turbo (with web search) |
| LinkedIn Fallback | Serper API (integrated in n8n) |
| Contact Enrichment | Clay (webhook-based) |
| CRM Integration | Salesforce (campaign import + sync in development) |
| Hosting | Lovable platform (aim-for-leads.lovable.app) |

---

## Key Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| n8n Workflows | engagetech.app.n8n.cloud | ✅ Live |
| Supabase Backend | Hosted Supabase instance | ✅ Live |
| Edge Functions | Deno-based serverless | ✅ Live |
| Database | PostgreSQL with RLS | ✅ Live |
| Frontend | aim-for-leads.lovable.app | ✅ Live |

---

## Definitions

### Campaign
A campaign represents a specific outbound prospecting effort with defined targeting criteria (product, region, personas, pain points, seniority levels). Companies and prospects are organised under campaigns.

### Company Research
The AI-powered validation of a target company — checking its operating status, identifying cloud infrastructure, and generating a technical summary. Stored in the `company_research` table. **Status: Live** ✅

### Prospect Research
The AI-powered identification of decision-makers at a validated company — finding 3-7 contacts matching the campaign's target titles, personas, and seniority levels, with priority rankings and pitch recommendations. Each prospect is stored as a separate record in `prospect_research`. **Status: Live** ✅

### Priority (High / Medium / Low)
The AI-assigned ranking of a prospect's relevance to the campaign:
- **High:** Direct decision-maker for the product area, likely budget holder
- **Medium:** Influences the buying decision or manages the relevant team
- **Low:** Tangentially related, could be a useful internal champion

### Pitch Type (Technical / Business / Executive)
The recommended approach for the SDR when speaking to this prospect:
- **Technical:** Lead with product capabilities and technical fit
- **Business:** Lead with ROI, cost savings, and business outcomes
- **Executive:** Lead with strategic value and competitive advantage

### Company Status (Operating / Acquired / Renamed / Bankrupt / Not Found)
- **Operating:** Company is active and a valid prospect
- **Acquired:** Company has been acquired (check if still independent)
- **Renamed:** Company has rebranded but is still operating
- **Bankrupt:** Company is no longer viable — skip research
- **Not Found:** Insufficient information to verify

### Personal ID
A unique UUID generated for each prospect, used as the tracking identifier when sending to Clay and matching enrichment results back.

### Seniority Level
The target organisational level within the company where decision-makers are found. Examples: C-Level (CEO, CTO, CISO), Director, Manager, Senior Manager. Seniority levels are defined per campaign to match the buying authority for the product being sold.

---

## FAQs

**Q: Why is research split into two steps (Company + Prospect)?**
A: Company research validates that the target is still a viable prospect before spending AI credits on finding decision-makers. If a company is bankrupt or has been fully absorbed by an acquirer, there's no point searching for prospects there. The two-step approach saves time and cost.

**Q: Why do we use n8n instead of calling OpenAI directly?**
A: n8n gives us a visual workflow builder with built-in retry logic, error handling, and the ability to chain multiple AI calls together. It also supports web search and Serper integration, which improves research quality. The on-demand webhook pattern means research only runs when an SDR triggers it, reducing unnecessary API costs.

**Q: How long does research take per company?**
A: Typically 1-2 minutes for company research and 2-9 minutes for prospect research. A campaign of 10 companies usually completes simultaneously, so around 10-12 minutes total.

**Q: Why start with 10 companies per day in the pilot?**
A: The pilot phase validates that the research quality is safe for SDR outreach before scaling. Manual review of research output (safety checks) is required until we have confidence in the AI output. Starting at ~10 companies per day allows SDRs to manually verify results while still seeing significant time savings (30 minutes vs 2-3 hours).

**Q: What happens if the AI research fails?**
A: The SDR gets a clear error message and retry buttons. They can re-run company research, manually trigger prospect research, or skip the company entirely. All errors are logged for debugging.

**Q: Why do we need Clay enrichment if we already have LinkedIn URLs?**
A: LinkedIn URLs tell us who the prospect is, but Clay enriches with how to reach them (email, direct phone). This enables actual outreach instead of just LinkedIn connection requests.

**Q: What does Serper do?**
A: Serper is a LinkedIn search API integrated into n8n. During prospect research, if GPT-4 cannot find a prospect's LinkedIn URL, Serper performs an automated search to locate it. This improves coverage and ensures more prospects have valid LinkedIn URLs for Clay enrichment.

**Q: What if Clay enrichment fails?**
A: Failed enrichments are tracked with status "fail". This happens if the contact is not in Clay's database or if their details cannot be verified. SDRs can manually retry failed enrichments, or the prospect can be added to a list for follow-up research.

**Q: How is data isolated between SDRs?**
A: Row Level Security (RLS) is enforced at the database level. Every table filters by `user_id`, so SDRs can only see their own campaigns, companies, and prospects. Realtime subscriptions are also filtered per user.

**Q: What does "manual work to make it safe for scaling" mean?**
A: During the pilot, an SDR (or manager) should spot-check research output before adding it to their dialling list — ensuring the prospects identified are relevant, the company status is correct, and the pitch angles make sense. Once we have confidence in output quality across multiple campaigns and users, manual checks can be reduced or eliminated for scaled deployment.

**Q: When will Salesforce contact sync be live?**
A: Salesforce contact sync is currently in development. Once complete, enriched prospects will be automatically synced back to Salesforce as Contacts with all research data and campaign context intact.

---

## Current Pilot Status

### ✅ LIVE Features
- Campaign creation and management
- Company import from Salesforce or manual entry
- Company research with AI validation
- Prospect research with priority ranking and pitch recommendations
- Serper LinkedIn fallback discovery
- Real-time progress tracking
- Clay enrichment with callback handling
- CSV export of prospects
- Multi-user isolation with Row Level Security

### ⚠️ Known Limitations (Pilot Phase)
- **Clay enrichment:** Some enrichments fail (contact not found). Success rate ~85-90%. Failed enrichments can be manually retried.
- **Salesforce contact sync:** Not yet live. Enriched prospects can be sent to Clay with Salesforce IDs, but automatic contact creation in Salesforce is in development.
- **Daily company limit:** ~10 companies per SDR per day to ensure manual safety checks during pilot.

### 📋 Recommended Pilot Workflow
1. SDR creates campaign with targeting criteria
2. SDR imports companies from Salesforce campaign
3. SDR clicks "Start Research" and waits for results
4. **Manual review:** SDR spot-checks research output (company status, prospect relevance, pitch fit)
5. SDR sends verified prospects to Clay for enrichment
6. **Monitor Clay:** Check for failed enrichments; retry as needed
7. SDR uses enriched contact details for outreach

---

## Performance & Scalability

| Metric | Value |
|--------|-------|
| **Current concurrent users** | 3 (pilot) |
| **Research time per company** | 1-2 min (company) + 2-9 min (prospects) |
| **Average campaign completion** | ~10-12 min for 10 companies |
| **Clay enrichment success rate** | ~85-90% (failures tracked, retryable) |
| **Realtime subscription latency** | <1 second |
| **API response time** | <1 second |

**Scaling path:** Once pilot phase validates data quality, system can scale to 10+ concurrent users with proper monitoring and occasional manual spot-checks.

---

## Data Security & Privacy

- **Multi-user isolation:** RLS enforced at database level; users only see their own data
- **Authentication:** Supabase Auth with JWT tokens
- **SSRF protection:** Edge functions validate webhook destinations
- **Input validation:** All user inputs are validated and sanitised
- **Audit trail:** Clay responses and research raw data are stored for tracking and debugging

---

## Support & Feedback

For bugs, feature requests, or feedback on the pilot:
- Reach out to the product team
- Check existing documentation in `/docs`
- Review integration guides for n8n, Clay, and Salesforce setup

**Last Updated:** 9 February 2026
**Status:** Production Ready (Pilot Phase)
