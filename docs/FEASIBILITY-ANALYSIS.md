# Feasibility Analysis: SDR Research + Salesforce Integration

**Date:** February 4, 2026
**Status:** ✅ **FEASIBLE - Proceed to Implementation**
**Overall Confidence:** 85-90%

---

## Executive Summary

This document validates the complete workflow for integrating an SDR research tool (Lovable frontend, Supabase, n8n, Clay) with Salesforce. The architecture is technically feasible and well-established in modern integration practices.

**Key Finding:** All phases are implementable. Main risk is Salesforce OAuth setup (external dependency on Freddy).

---

## 1. Salesforce API Feasibility ✅ HIGHLY FEASIBLE

### Can we query CampaignMember → Account data in one SOQL call?

**Answer: YES** ✅

```sql
SELECT Account.Name, Account.Website, Account.LinkedIn__c, Account.Id
FROM CampaignMember
WHERE CampaignId = '{id}'
```

This is standard SOQL and extremely common in Salesforce integration. No issues or workarounds needed.

### Do we need special permissions?

**Answer: Standard Salesforce permissions** ✅

- User/service account needs: `Read` on Campaign, CampaignMember, Account objects
- For Phase 4: `Create` on Contact and CampaignMember objects
- These are typically included in standard profiles (System Administrator, Sales Profile)

### Is Account.LinkedIn__c field standard or custom?

**Answer: Custom field** ⚠️

- `Account.LinkedIn__c` is NOT a standard Salesforce field
- Freddy likely created this as a custom field (Text, max 255 chars)
- **Action Required:** Confirm this field exists in his org
- **Fallback:** If it doesn't exist, store LinkedIn URL on Contact object instead

---

## 2. Duplicate Prevention Strategy ✅ WELL-DESIGNED

### Is Email + AccountId sufficient for deduplication?

**Answer: YES, this is the Salesforce standard** ✅

```sql
SELECT Id FROM Contact
WHERE Email = '{email}'
AND AccountId = '{salesforce_account_id}'
```

Why this works:
- Email is typically unique within an Account
- EmailMessageRelation prevents true duplicates at the org level
- AccountId prevents creating duplicate Contacts for the same person in different accounts (correct behavior)

### Should we also check LinkedIn or name?

**Answer: NO, keep it simple** ❌ (adding complexity)

Reasoning:
- LinkedIn URLs change and aren't standardized
- Names can be formatted differently (John vs. Jon)
- Email is the most reliable identifier in Salesforce
- Don't over-engineer; stick with proven patterns

### What if the Contact exists under a DIFFERENT Account?

**Answer: This is handled correctly** ✅

Your query naturally handles this edge case:
- Query searches: `Email = 'john@example.com' AND AccountId = '001abc123'`
- If John works at Account A and Account B, he'll have two separate Contacts (correct)
- If importing into Account B, a new Contact will be created (correct)

---

## 3. Data Flow Integrity ✅ VERY RELIABLE

### Is passing `salesforce_account_id` through 4 systems reliable?

**Answer: YES, when treated as immutable metadata** ✅

The key principle: `salesforce_account_id` should flow through the system like a UUID:
- Lovable (frontend) → n8n (import) → Supabase (store) → n8n (enrich) → Supabase (update) → n8n (sync) → Salesforce

### Recommended Data Storage

Only store `salesforce_account_id` in two places:
1. **`companies` table** - the source of truth
2. **`prospects` table** - needed for Contact creation

Don't store in:
- `company_research` table (bloat, not needed)
- `prospect_research` table (bloat, not needed)
- Intermediate transformation tables (unnecessary)

**Table Schema:**

```sql
-- companies
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  salesforce_account_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- prospects
CREATE TABLE prospects (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT,
  linkedin_url TEXT,
  phone TEXT,
  salesforce_account_id TEXT NOT NULL,  -- Denormalized for n8n workflow
  clay_enriched BOOLEAN DEFAULT false,
  salesforce_contact_id TEXT,           -- Result of sync
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## 4. n8n Salesforce Integration ✅ VERY FEASIBLE

### Does n8n have native Salesforce nodes?

**Answer: YES** ✅

n8n has:
- **Salesforce Node** (native, official)
- Operations: Query, Create, Update, Delete, Lookup
- Built-in OAuth 2.0 support
- Automatic token refresh
- No custom HTTP requests needed

### How to handle Salesforce authentication?

**Answer: Store OAuth credentials in n8n** ✅

**Recommended Setup:**

1. Freddy creates a **Connected App** in Salesforce:
   - Org Setup → Apps → App Manager → New Connected App
   - Enable OAuth
   - Set Callback URL: `https://n8n.your-domain.com/oauth2/callback`
   - Generate Client ID and Client Secret

2. You add Salesforce credentials in n8n:
   - Credentials → New → Salesforce
   - Paste Client ID and Secret
   - n8n handles OAuth flow automatically
   - Tokens refresh automatically before expiry

**Why this is better than API tokens:**
- ✅ Tokens auto-refresh
- ✅ No manual token rotation needed
- ✅ Secure (no plaintext auth tokens in code)
- ✅ User consent flow (more secure)

---

## 5. Clay Integration ⚠️ IMPLEMENTATION DEPENDS ON USE CASE

### Does Clay return data synchronously or async?

**Answer: Depends on your implementation**

**Option A: Manual Enrichment (Recommended for v1)** ✅
- User clicks [Enrich with Clay] button
- Opens Clay modal or browser window
- User manually enriches prospects
- Pastes results back into Lovable
- ✅ No webhook needed
- ✅ No async handling needed
- ✅ Simple, reliable

**Option B: Automated via Clay API** ⚠️ (Future enhancement)
- You call Clay API via n8n workflow
- Clay returns data asynchronously via webhook
- n8n receives callback and updates prospects
- ⚠️ Requires webhook setup
- ⚠️ Requires handling potential failures
- Recommended for later iterations

### Does Clay need the `salesforce_account_id`?

**Answer: NO, it's your internal metadata** ❌ (not needed)

Clay only needs:
- Company name
- Person name / email

You preserve `salesforce_account_id` internally; Clay doesn't care about it.

---

## 6. Error Handling & Resilience ✅ IMPLEMENTATION GUIDE

### Critical Failure Scenarios

| Scenario | Severity | n8n Solution |
|----------|----------|--------------|
| **Salesforce API rate limit** | Medium | Retry with exponential backoff (1s, 2s, 4s) |
| **OAuth token expired** | Low | n8n auto-refreshes before expiry |
| **Contact creation fails** (invalid AccountId) | High | Return error; let user investigate AccountId |
| **CampaignMember creation fails** | Medium | Return success for Contact but warning for Campaign |
| **Network timeout** | Low | Implement client-side "Try Again" button |
| **Email validation fails** | High | Validate email format in Lovable before sending |

### Recommended n8n Error Handling

```
Workflow Structure:
├─ Webhook (receive prospect data)
├─ Validate email format
├─ Query existing Contact
├─ Create Contact (if new) - WITH ERROR HANDLING
│  └─ If fails: Catch error, log to Supabase, return error response
├─ Create CampaignMember (if new) - WITH ERROR HANDLING
│  └─ If fails: Log warning, still return Contact info
└─ Return success/error/partial-success response
```

### UI/UX Error Display

In Lovable, show user:
- ✅ **Success:** "Contact created and added to Campaign" + clickable link
- ⚠️ **Partial:** "Contact created but couldn't add to Campaign (Campaign archived?)" + warning badge
- ❌ **Failure:** "Sync failed: [Error message]" + "Try Again" button

---

## 7. Permissions & Access Control ✅ ACTIONABLE CHECKLIST

### What Freddy needs to provide

1. **Salesforce Sandbox org** (for testing)
   - URL: `https://[org].sandbox.salesforce.com`
   - Any test Account + Campaign to validate workflow

2. **Connected App credentials**
   - Client ID (e.g., `3MVG9...`)
   - Client Secret (e.g., `89234...`)
   - Callback URL: `https://n8n.your-domain.com/oauth2/callback`

3. **Org confirmation**
   - Edition: Professional, Business, Enterprise, or Unlimited?
   - Org can use APIs? (API not included in Free/Group editions)
   - `Account.LinkedIn__c` field exists? If not, can he create it?

4. **Permission verification**
   - User/service account has Create Contact permission
   - User/service account has Create CampaignMember permission
   - User/service account can access Campaigns and Accounts

### Timeline
- Freddy creates Connected App: ~15 minutes
- You configure OAuth in n8n: ~5 minutes
- Test Contact creation in Sandbox: ~10 minutes

---

## 8. UI/UX Considerations ✅ DESIGN RECOMMENDATIONS

| Feature | Recommendation | Details |
|---------|-----------------|---------|
| **[SF] Button State** | Disable until enriched | Enable only when: `clay_enriched === true AND email IS NOT NULL` |
| **Loading State** | Show spinner for 2-3s | Disable button, show "Syncing..." text |
| **Success Display** | Icon + clickable text | Click opens Salesforce Contact in new tab |
| **Error Display** | Toast notification | Red bg, "Sync failed: [error]", "Try Again" button |
| **Partial Failure** | Warning badge + tooltip | Yellow bg, ⚠️ icon, hover shows "Added to Campaign failed" |
| **URL Column** | Optional, show in detail view | Can add "Salesforce" column or hide in list (show in detail) |

---

## Phase-by-Phase Feasibility Assessment

| Phase | Rating | Risk | Comments |
|-------|--------|------|----------|
| **Phase 1: Campaign Import** | 5/5 | ✅ Low | SOQL query is bulletproof; standard Salesforce operation |
| **Phase 2: AI Research** | 5/5 | ✅ Low | Assuming your AI logic works; no Salesforce dependency |
| **Phase 3: Clay Enrichment** | 4/5 | ⚠️ Medium | Works great manually; async automation optional for v2 |
| **Phase 4: Salesforce Sync** | 5/5 | ⚠️ Medium | n8n + APIs work perfectly; depends on Freddy's setup |
| **Data Integrity** | 5/5 | ✅ Low | UUID + AccountId tracking is proven pattern |
| **Error Handling** | 4/5 | ⚠️ Medium | Straightforward if you implement all scenarios |
| **Overall** | **4.5/5** | ⚠️ Medium | **Proceed with confidence; external dependency is Freddy** |

---

## Top 3 Technical Risks

### 🔴 Risk #1: Salesforce OAuth Setup (HIGH)
**Impact:** If OAuth fails, entire sync workflow breaks
**Likelihood:** Medium (depends on Freddy's execution)
**Mitigation:**
- Provide Freddy a detailed setup guide
- Test in Sandbox first (low-risk environment)
- Have Freddy share Screenshot of Connected App settings
- Run test Contact creation before prod rollout

### 🟠 Risk #2: Missing Custom Fields (MEDIUM)
**Impact:** Workflow runs but Account.LinkedIn__c field is missing
**Likelihood:** Low (likely exists, but confirm)
**Mitigation:**
- Confirm field exists before building workflow
- Have fallback: store LinkedIn on Contact instead
- Field creation takes <2 minutes if missing

### 🟠 Risk #3: Archived Campaign (MEDIUM)
**Impact:** Contact creation succeeds but CampaignMember creation fails
**Likelihood:** Low (but possible if user picks wrong campaign)
**Mitigation:**
- Query Campaign.Status before sync
- Show warning if archived: "Campaign is archived, contact will be created but not added to campaign"
- Implement "Try Again" button for manual sync

---

## Salesforce API Requirements

### SOQL Queries

**Query 1: Import Campaign Accounts**
```sql
SELECT Account.Name, Account.Website, Account.LinkedIn__c, Account.Id
FROM CampaignMember
WHERE CampaignId = '701xyz789...'
```

**Query 2: Check if Contact Exists**
```sql
SELECT Id, Email
FROM Contact
WHERE Email = 'john.smith@example.com'
AND AccountId = '001abc123...'
```

**Query 3: Validate Campaign (Optional)**
```sql
SELECT Id, Status
FROM Campaign
WHERE Id = '701xyz789...'
```

### REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/services/data/v60.0/query?q=SELECT...` | GET | SOQL queries |
| `/services/data/v60.0/sobjects/Contact` | POST | Create Contact |
| `/services/data/v60.0/sobjects/CampaignMember` | POST | Create CampaignMember |
| `/services/data/v60.0/sobjects/Contact/{id}` | GET | Lookup Contact |

### API Versions

- Recommended: **v60.0** (Spring 2024) or latest
- n8n supports all recent versions
- Freddy can specify version in Connected App or use latest

---

## Edge Cases & Solutions

| Edge Case | Scenario | Solution |
|-----------|----------|----------|
| **Duplicate Email in Different Account** | John works at Acme (001) and TechCorp (002) | ✅ Creates separate Contacts (correct) |
| **Campaign Already Has Contact** | Syncing same contact twice | ⚠️ CampaignMember fails (duplicate); handle gracefully |
| **Account Deleted After Import** | User imports from campaign, then Freddy deletes account | ❌ Contact creation fails; show error "Account no longer exists" |
| **Archived Campaign** | User picks archived campaign to add to | ⚠️ CampaignMember creation fails; show warning |
| **Email Has Typo** | Clay enrichment has typo (john.smit@example.com) | ❌ Validate email format in Lovable before send |
| **OAuth Token Expires** | User is idle for 60+ days | ✅ n8n auto-refreshes; no issue |
| **Contact Already in Different Campaign** | Same contact in Campaign A, try to add to Campaign B | ✅ Allowed; CampaignMember is per-campaign |

---

## Freddy Handoff Checklist

### Pre-Implementation
- [ ] Confirm Salesforce Edition (Professional+)
- [ ] Confirm `Account.LinkedIn__c` custom field exists (if not, create it)
- [ ] Confirm API access is enabled
- [ ] Create Sandbox org for testing

### OAuth Setup
- [ ] Create Connected App in Salesforce
- [ ] Generate Client ID and Secret
- [ ] Set Callback URL: `https://n8n.your-domain.com/oauth2/callback`
- [ ] Share Client ID and Secret with you securely

### Permission Configuration
- [ ] Create service account user (or identify existing)
- [ ] Assign Profile/Permission Set with:
  - Read: Campaign, CampaignMember, Account, Contact
  - Create: Contact, CampaignMember
- [ ] Verify API access for this user

### Testing
- [ ] Create test Account in Sandbox
- [ ] Create test Campaign in Sandbox
- [ ] Provide test Account ID and Campaign ID to you
- [ ] Test Contact creation workflow
- [ ] Verify Contact appears in Campaign

### Documentation
- [ ] Provide org setup documentation (your internal guide)
- [ ] Provide API rate limits and SLA
- [ ] Define error handling SLA (if sync fails, when should we retry?)

---

## Implementation Roadmap

### Phase 1: Preparation (1-2 days)
1. ✅ Validate this feasibility doc with Freddy
2. ✅ Freddy creates Connected App
3. ✅ You configure OAuth in n8n

### Phase 2: Development (2-3 days)
1. ✅ Build n8n workflow in Sandbox
2. ✅ Build Lovable UI for [SF] button
3. ✅ Connect Lovable → n8n webhook

### Phase 3: Testing (1-2 days)
1. ✅ Test Contact creation in Sandbox
2. ✅ Test CampaignMember creation
3. ✅ Test error handling (bad AccountId, archived campaign, etc.)

### Phase 4: Production Rollout (1 day)
1. ✅ Promote workflow to prod
2. ✅ Final testing with real Account + Campaign
3. ✅ Enable [SF] button in Lovable

---

## Conclusion

**This workflow is FEASIBLE and RECOMMENDED.** ✅

**Go ahead with implementation.** The architecture is proven, APIs are stable, and integration is straightforward.

**Main dependency:** Freddy's Salesforce setup (OAuth, permissions, field confirmation). Get his buy-in and provide the checklist above.

**Next Step:** Share this document with Freddy + send him the Slack message template.

---

## Questions to Clarify

Before you start building, confirm these with Freddy:

1. ✅ Which Salesforce org (Prod or Sandbox)? Can I test in Sandbox first?
2. ✅ Does `Account.LinkedIn__c` custom field exist? If not, can you create it?
3. ✅ What's your OAuth preference (Connected App vs. API token)?
4. ✅ What should happen if Contact creation fails? (Auto-retry, alert you, pause flow?)
5. ✅ Can you provide test Account ID + Campaign ID for Sandbox testing?

---

**Document Version:** 1.0
**Last Updated:** February 4, 2026
**Status:** Ready for Freddy review
