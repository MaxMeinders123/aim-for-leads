# Aim for Leads - Product Document

**Product**: SDR Prospecting Research & Enrichment Platform
**Version**: 1.0 (Supabase + n8n + Clay)
**Last Updated**: February 6th, 2026

---

## Aim

Automate the research and qualification of target accounts and their decision-makers for SDR outbound prospecting. The platform takes a list of companies from a Salesforce campaign, runs AI-powered research to validate the company and identify relevant prospects, then sends those prospects to Clay for contact enrichment — reducing manual research time from hours to minutes per campaign.

## End User Value

An SDR can import an entire Salesforce campaign, kick off automated research, and within minutes have a qualified list of decision-makers with their job titles, LinkedIn profiles, priority rankings, and personalised pitch angles — all without manually Googling each company. Once enriched through Clay, the SDR has direct contact details ready for outreach. This means SDRs spend less time researching and more time on the phone, directly increasing their productivity and pipeline generation.

## Metrics That Matter

- Time from campaign import to first outreach
- Number of qualified prospects generated per campaign
- SDR research time saved (hours per week)
- Clay enrichment success rate
- Prospect priority accuracy (High/Medium/Low vs actual engagement)
- Dial to conversation rate (prospects already pre-qualified)

---

## Examples of Prospect Research Output

**Cloud Infrastructure, IT Management, Digital Transformation**

Withers LLP is currently using mostly off-the-shelf software solutions and is in the process of transitioning to vendor-hosted applications. They have a small cloud infrastructure (AWS, low confidence) and are not heavily invested in AI. They have a small development team that handles financial system integrations and data ETLs. **Priority prospects identified**: CTO (High - decision maker for cloud strategy), Head of IT Operations (High - manages infrastructure migration), IT Director (Medium - influences vendor selection). Recommended pitch type: Technical — focus on migration support and managed services.

**Security, Vulnerability Scanning, Risk Management**

Lloyds Banking Group has multiple scanning tools aimed at specific technologies across several suppliers. They use a risk management framework in line with industry standards and are exploring new solutions. **Priority prospects identified**: CISO (High - owns security strategy and budget), VP of Security Engineering (High - evaluates tooling), Head of Risk & Compliance (Medium - influences buying through compliance requirements). Recommended pitch type: Executive — focus on consolidation and compliance.

---

## Product Overview

Aim for Leads generates research intelligence and qualified prospect lists by running AI-powered analysis against target company accounts. The platform connects to Salesforce to import campaign target accounts, uses n8n workflows with OpenAI (GPT) to research each company's status, cloud infrastructure, and key decision-makers, then hands off qualified prospects to Clay for email and phone enrichment.

The system runs a two-step research pipeline:

1. **Company Research** — Validates whether the company is still operating (or has been acquired/renamed/gone bankrupt), identifies their cloud provider and confidence level, and gathers a technical summary.
2. **Prospect Research** — Uses the campaign targeting criteria (job titles, personas, verticals, pain points) to identify 3-7 relevant decision-makers at the company, ranking them by priority with personalised pitch recommendations.

Results are stored in Supabase with real-time updates pushed to the frontend, so SDRs can see research completing live without refreshing. Qualified prospects are then sent to Clay for contact enrichment via webhook.

## Product Objectives

- Automate company validation and prospect identification for all target accounts in a Salesforce campaign
- Generate prioritised prospect lists with pitch angles tailored to the campaign's product and pain points
- Reduce manual SDR research time to near-zero for initial prospecting
- Maintain a clean data flow from Salesforce import through to Clay enrichment and back

## Project Hypothesis

Previously, SDRs would manually research each target account — visiting the company website, checking LinkedIn, trying to identify the right people to call, and figuring out what to say. This took significant time per account and the quality varied depending on the SDR's experience and effort. By automating the research step with AI and connecting it directly to the enrichment pipeline (Clay) and CRM (Salesforce), we can standardise the quality of research while dramatically reducing the time investment, allowing SDRs to focus on what they do best: having conversations.

---

## How Does It Work?

### Step 1: Campaign Setup

An SDR creates a campaign with targeting criteria that guides the AI research:

| Field | Purpose | Example |
|-------|---------|---------|
| Name | Campaign identifier | "AWS Migration - Benelux Q1" |
| Product | What's being sold | "Cloud Security Assessment" |
| Target Region | Geographic focus | "Benelux, DACH" |
| Technical Focus | Technology area | "Cloud Security, FinOps" |
| Job Titles | Who to find | "CTO, VP Engineering, IT Director" |
| Personas | Decision-maker profiles | "Budget holder for cloud infrastructure" |
| Target Verticals | Industries | "FinTech, Healthcare" |
| Pain Points | Problems to solve | "High cloud costs, security compliance gaps" |
| Primary Angle | Main value prop | "Reduce AWS spend by 30%" |

### Step 2: Company Import

Companies are imported from Salesforce using the campaign ID. The system queries Salesforce for all CampaignMembers with `Prospecting_Status__c = 'Target Account'`, deduplicates by Account ID, and imports them into the platform with their Salesforce Account ID, name, and website.

Companies can also be added manually (name + website + LinkedIn URL).

### Step 3: Company Research (AI)

For each selected company, the platform sends a request to the n8n company research webhook. The AI:

1. Validates the company status: **Operating**, **Acquired**, **Renamed**, **Bankrupt**, or **Not Found**
2. If acquired — checks whether it still operates independently
3. Identifies the cloud provider (AWS/Azure/GCP/Other) with a confidence score (0-100)
4. Generates a technical summary of the company

The result is saved to the `company_research` table and the frontend updates in real-time via Supabase Realtime subscriptions.

**If the company is Operating or Acquired (but independent)** — prospect research is automatically triggered.
**If the company is Bankrupt** — research stops and the SDR is notified.
**If Acquired and not independent** — the SDR gets a "Research Acquirer Instead" option.

### Step 4: Prospect Research (AI)

The prospect research webhook receives the campaign context plus the company research results. The AI:

1. Searches for 3-7 decision-makers matching the campaign's target job titles and personas
2. Assigns each prospect a **priority** (High/Medium/Low) with a reason
3. Recommends a **pitch type** per prospect (Technical/Business/Executive)
4. Extracts LinkedIn URLs where available

Each prospect is saved as a separate record in `prospect_research` with a unique `personal_id` (UUID) for Clay tracking.

### Step 5: Clay Enrichment

From the Contacts view, the SDR reviews the AI-generated prospects and sends them to Clay for enrichment. The Clay payload includes:

```json
{
  "personal_id": "unique-uuid-for-matching",
  "linkedin_url": "https://linkedin.com/in/prospect",
  "salesforce_account_id": "001XXXXXXX",
  "salesforce_campaign_id": "701XXXXXXX"
}
```

The system tracks which prospects have been sent (`sent_to_clay`, `sent_to_clay_at`) and prevents duplicate sends.

### Step 6: Export / Sync

Enriched prospects can be exported to CSV or synced back to Salesforce with all research data, contact details, and campaign context intact.

---

## Clay Integration - Current State & Next Steps

### What currently gets sent to Clay:

| Field | Description | Status |
|-------|-------------|--------|
| `personal_id` | Unique UUID per prospect for matching | Sending |
| `linkedin_url` | Prospect's LinkedIn profile URL | Sending |
| `salesforce_account_id` | Salesforce Account ID for the company | Sending |
| `salesforce_campaign_id` | Salesforce Campaign ID | Sending |

### What still needs to be built:

| Item | Description | Why It's Needed |
|------|-------------|-----------------|
| **Campaign ID carry-across** | Ensure campaign_id is reliably passed through the full pipeline to Clay | So Clay and downstream systems know which campaign generated the prospect |
| **Session ID** | Include a unique session/request ID in the HTTP POST to Clay | So we can match the outbound request to the inbound Clay response when it comes back |
| **Webhook back from Clay** | Build a `receive-clay-results` edge function to accept enriched data back from Clay | So enriched emails, phones, and statuses are written back to the database automatically instead of manually |

### Target Clay payload (once complete):

```json
{
  "personal_id": "uuid",
  "linkedin_url": "https://linkedin.com/in/prospect",
  "salesforce_account_id": "001XXXXXXX",
  "salesforce_campaign_id": "701XXXXXXX",
  "session_id": "unique-request-id-for-matching",
  "callback_webhook": "https://our-supabase.co/functions/v1/receive-clay-results"
}
```

---

## Technologies Used

- **Frontend**: React 18 with TypeScript, Vite, Tailwind CSS, shadcn/ui components, Zustand for state management, TanStack React Query for data fetching
- **Backend**: Supabase (PostgreSQL database, Edge Functions in Deno, Realtime subscriptions, Row Level Security)
- **AI Research**: n8n workflows with OpenAI GPT for company validation and prospect extraction
- **Enrichment**: Clay (webhook-based contact enrichment for email/phone)
- **CRM**: Salesforce (campaign import via SOQL, contact sync)
- **Hosting**: Lovable platform (click-to-deploy)

### Key Infrastructure

| Component | Location |
|-----------|----------|
| n8n Workflows | `engagetech12.app.n8n.cloud` |
| Supabase Project | Hosted Supabase instance |
| Edge Functions | 13 serverless functions (Deno-based) |
| Database | PostgreSQL with RLS and Realtime enabled |

---

## Definitions

### Campaign

A campaign represents a specific outbound prospecting effort with defined targeting criteria (product, region, personas, pain points). Companies and prospects are organised under campaigns.

### Company Research

The AI-powered validation of a target company — checking its operating status, identifying cloud infrastructure, and generating a technical summary. Stored in the `company_research` table.

### Prospect Research

The AI-powered identification of decision-makers at a validated company — finding 3-7 contacts matching the campaign's target titles and personas, with priority rankings and pitch recommendations. Each prospect is stored as a separate record in `prospect_research`.

### Priority (High / Medium / Low)

The AI-assigned ranking of a prospect's relevance to the campaign:
- **High**: Direct decision-maker for the product area, likely budget holder
- **Medium**: Influences the buying decision or manages the relevant team
- **Low**: Tangentially related, could be a useful internal champion

### Pitch Type (Technical / Business / Executive)

The recommended approach for the SDR when speaking to this prospect:
- **Technical**: Lead with product capabilities and technical fit
- **Business**: Lead with ROI, cost savings, and business outcomes
- **Executive**: Lead with strategic value and competitive advantage

### Sentiment / Company Status

- **Operating**: Company is active and a valid prospect
- **Acquired**: Company has been acquired (check if still independent)
- **Renamed**: Company has rebranded but is still operating
- **Bankrupt**: Company is no longer viable — skip
- **Not Found**: Insufficient information to verify

### Personal ID

A unique UUID generated for each prospect, used as the tracking identifier when sending to Clay and matching enrichment results back.

---

## FAQs

### Why is research split into two steps (Company + Prospect)?

Company research validates that the target is still a viable prospect before spending AI credits on finding decision-makers. If a company is bankrupt or has been fully absorbed by an acquirer, there's no point searching for prospects there. The two-step approach saves time and cost.

### Why do we use n8n instead of calling OpenAI directly?

n8n gives us a visual workflow builder with built-in retry logic, error handling, and the ability to chain multiple AI calls together. It also supports web search integration which improves research quality. The async webhook pattern means the frontend doesn't have to wait for potentially long-running AI tasks.

### How long does research take per company?

Typically 1-3 minutes for company research and 2-5 minutes for prospect research. The system processes companies sequentially but updates the UI in real-time as each one completes. A campaign of 20 companies usually completes in 30-60 minutes.

### Can the same company appear in multiple campaigns?

Yes, currently a company can be researched separately in different campaigns. Duplicate detection across campaigns is on the roadmap (see below).

### What happens if the AI research fails?

The SDR gets a clear error message and retry buttons. They can re-run company research, manually trigger prospect research, or skip the company entirely. All errors are logged for debugging.

### Why do we need a webhook back from Clay?

Currently the system sends prospects to Clay but doesn't automatically receive the enriched data back. The SDR has to manually check or export from Clay. Building the webhook callback will close this loop — enriched emails and phones will automatically appear in the platform.

### How is data isolated between SDRs?

Row Level Security (RLS) is enforced at the database level. Every table filters by `user_id`, so SDRs can only see their own campaigns, companies, and prospects. Realtime subscriptions are also filtered per user.

---

## Roadmap

### Near Term (Clay Loop)
1. **Campaign ID carry-across** — Ensure reliable campaign tracking through to Clay
2. **Session ID for request matching** — Match outbound POST to inbound Clay response
3. **Webhook back from Clay** — Auto-receive enriched contact data into the platform

### Medium Term (Usability)
4. **Duplicate company detection** — Flag companies already researched in other campaigns, option to reuse existing research
5. **Better research for smaller accounts** — Improved AI prompts and fallback strategies for lesser-known companies with limited public information
6. **Easier UI / less manual work** — Fewer clicks from import to Clay, auto-trigger prospect research after company research, batch actions, campaign templates
7. **Pilot group rollout** — Onboard 3-5 SDRs for end-to-end testing and feedback before wider rollout

### Long Term (Intelligence)
8. **Database AI to spot trends** — Analyse research data across campaigns to surface patterns (which industries convert, which job titles engage, cloud provider trends by region)
9. **Predictive prioritisation** — Use historical data to improve prospect priority scoring
10. **Full Salesforce round-trip** — Automated sync of enriched prospects back to Salesforce as Contacts with all research data attached
