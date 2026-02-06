# Aim for Leads - Updates & Roadmap

**Date**: February 6, 2026

---

## What We've Done Today

### UI Updates
- Cleaned up the research flow UI for a smoother experience
- Improved prospect table with **"Show unsent only"** filter toggle
- Added **sent-to-Clay timestamps** so you can see exactly when each prospect was pushed
- Added **unsent count badges** in the header for quick visibility
- Better empty states and loading indicators throughout
- Toast notifications for async research progress ("Research started... results incoming")

### Backend & Data Flow
- Fixed **ID flow consistency** across the entire pipeline: `user_id -> company_domain -> company_research_id -> prospect_id`
- Fixed **critical RLS security policies** — users now only see their own data (was wide open before)
- Added **performance indexes** on key columns (user_id, status, sent_to_clay) for speed at scale
- Realtime subscriptions now properly filtered per user

### Clay Integration
- **Account ID** now passes through to Clay via `salesforce_account_id` in the payload
- **Personal ID** generated and tracked per prospect for matching
- Duplicate send prevention — can't accidentally send the same prospect twice
- Clay response stored back in the database for debugging
- Supports both single and bulk sending

---

## Clay - Next Steps (Coming Soon)

These don't have to happen today but are needed to close the loop:

| Item | What It Does | Status |
|------|-------------|--------|
| **Campaign ID** | Carry across the `salesforce_campaign_id` alongside the account ID so Clay knows which campaign the prospect belongs to | Ready to wire up |
| **Session ID** | Include a session/request ID in the HTTP POST so we can match the outbound request to the inbound Clay response | To build |
| **Webhook back** | Set up a webhook endpoint to receive enriched data back from Clay (email, phone, etc.) and write it back to the database | To build |

### What the Clay payload currently sends:
```json
{
  "personal_id": "uuid",
  "linkedin_url": "https://linkedin.com/in/...",
  "salesforce_account_id": "001XXXXXXX",
  "salesforce_campaign_id": "701XXXXXXX"
}
```

### What we still need to add:
```json
{
  "session_id": "unique-request-id-for-matching",
  "callback_webhook": "https://our-supabase.co/functions/v1/receive-clay-results"
}
```

---

## Roadmap - Making It Better for Users

These are the features we're planning to make the experience easier, less manual, and smarter over time.

### 1. Duplicate Company Detection
- Automatically flag when a company has already been researched in another campaign
- Show a warning: "This company was already researched on [date] in [campaign]"
- Option to skip or re-use existing research instead of running it again
- Saves time and avoids wasting Clay credits on duplicates

### 2. Better Answers for Smaller Accounts
- Current AI research is tuned for larger, well-known companies
- Improve prompts and research logic to handle smaller/lesser-known accounts where public info is limited
- Fallback strategies when standard research comes back thin
- Smarter prospect extraction for companies with less online presence

### 3. Easier UI / Less Manual Work
- Reduce the number of clicks to go from import to Clay
- Auto-start prospect research after company research completes (no manual trigger)
- Batch actions — select all qualified prospects and send to Clay in one click
- Better defaults so users don't have to configure everything from scratch
- Streamlined campaign creation with templates

### 4. Database AI to Spot Trends
- Analyse research results across all campaigns to surface patterns
- Which industries convert best? Which job titles respond most?
- Spot trends in cloud provider usage, company growth signals
- Dashboard with insights: "Companies using AWS in EMEA have 40% higher engagement"
- Help SDRs prioritize based on data, not gut feeling

### 5. Starting Up with a Few People
- Onboard a small pilot group (3-5 SDRs) to test the full workflow end-to-end
- Gather real feedback on pain points and friction
- Iterate fast based on actual usage before scaling wider
- Focus on making the core loop solid: Import -> Research -> Enrich -> Outreach
- Build confidence in the tool before rolling out to the full team

---

## Priority Order

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 1 | Clay webhook back + session ID | Closes the enrichment loop | Medium |
| 2 | Duplicate company detection | Saves time and credits | Low |
| 3 | Easier UI / less manual | Faster daily workflow | Medium |
| 4 | Better answers for smaller accounts | More coverage | Medium |
| 5 | Database AI trends | Strategic insights | High |
| 6 | Pilot group rollout | Real-world validation | Low |

---

## Tech Stack (for reference)

- **Frontend**: React + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres + Edge Functions + Realtime)
- **AI Research**: n8n workflows + OpenAI
- **Enrichment**: Clay
- **CRM**: Salesforce
- **Hosting**: Lovable
