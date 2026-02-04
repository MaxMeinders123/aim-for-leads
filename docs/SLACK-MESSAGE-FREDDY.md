# Slack Message Template for Freddy

**Copy and customize this message to send to Freddy (Salesforce owner)**

---

Hey Freddy! 👋

I've been building an SDR research tool that automates prospect research and Clay enrichment, and now I need to integrate it with our Salesforce instance. Since you own our Salesforce setup, I need your help to implement the final piece.

## What I've Built So Far

1. ✅ Import accounts from Salesforce Campaigns (by Campaign ID)
2. ✅ AI research to find prospects for each account
3. ✅ Clay enrichment to get email + phone numbers
4. ❌ **Need your help:** Add enriched prospects back into Salesforce as Contacts under the correct Account + Campaign

## What I Need You to Do

I'll send you enriched prospect data in this format:

```json
{
  "first_name": "John",
  "last_name": "Smith",
  "title": "VP of Engineering",
  "email": "john.smith@example.com",
  "phone": "+1-555-123-4567",
  "mobile": "+1-555-987-6543",
  "linkedin_url": "https://linkedin.com/in/johnsmith",
  "company_name": "Example Inc",
  "salesforce_account_id": "001abc123...",
  "salesforce_campaign_id": "701xyz789..."
}
```

**Your task:** Create a Salesforce Contact and add them to the Campaign

## Salesforce Workflow (What Needs to Happen)

**Step 1: Check if Contact Already Exists**
```sql
SELECT Id FROM Contact
WHERE Email = 'john.smith@example.com'
AND AccountId = '001abc123...'
```

**Step 2A: If Contact Exists**
- Use that Contact ID
- Skip to Step 3

**Step 2B: If Contact Doesn't Exist**
- Create new Contact:
```json
POST /services/data/v60.0/sobjects/Contact
{
  "AccountId": "001abc123...",
  "FirstName": "John",
  "LastName": "Smith",
  "Title": "VP of Engineering",
  "Email": "john.smith@example.com",
  "Phone": "+1-555-123-4567",
  "MobilePhone": "+1-555-987-6543",
  "LinkedIn__c": "https://linkedin.com/in/johnsmith"
}
```

**Step 3: Add Contact to Campaign**
```json
POST /services/data/v60.0/sobjects/CampaignMember
{
  "CampaignId": "701xyz789...",
  "ContactId": "003...",
  "Status": "Added"
}
```

**Step 4: Return URLs**
```json
{
  "contact_id": "003...",
  "contact_url": "https://engagetech.salesforce.com/003...",
  "campaign_member_id": "00v...",
  "status": "success"
}
```

## Why This Matters

The key is the **`salesforce_account_id`** - this ensures:
- ✅ No duplicate Accounts are created
- ✅ Contacts are always linked to the correct Account
- ✅ We can track which prospects came from which Campaign
- ✅ Sales team can immediately follow up with enriched contact info

## Questions for You

1. **Does `Account.LinkedIn__c` custom field exist?** If not, can you create it as a Text field? (Or I can store it on Contact instead)
2. **What should CampaignMember `Status` be?** ("Added", "Sent", "Responded"? I'll use "Added" by default)
3. **Can I test in Sandbox first?** Or do you prefer I go straight to Production?
4. **What permissions do I need?** Create Contact + CampaignMember via API
5. **Authentication preference?** I can use OAuth (cleaner) or API token if you prefer

## How We'll Integrate

I'm building an n8n workflow that will:
1. **Listen for enriched prospects** from my Lovable app
2. **Check if Contact exists** in Salesforce (by email + account)
3. **Create Contact** (if new) with all enriched data
4. **Add to Campaign** with CampaignMember record
5. **Return Contact URL** back to my app (so users can click to view in Salesforce)

This requires **OAuth authentication** from Salesforce so n8n can create Contacts securely.

## What I'll Need from You

### Pre-Integration Setup (15-20 minutes)
1. **Create Connected App in Salesforce:**
   - Org Setup → Apps → App Manager → New Connected App
   - Name: "n8n Salesforce Sync"
   - Enable OAuth Flows
   - Callback URL: `https://n8n.your-domain.com/oauth2/callback` *(I'll provide exact URL)*
   - Scopes: `api`, `refresh_token`, `offline_access`
   - Generate Client ID and Client Secret

2. **Confirm field exists or create it:**
   - Setup → Objects and Fields → Contacts → Fields
   - Confirm custom field `LinkedIn__c` exists (Text, max 255)
   - If not, I can create it using Email field instead

3. **Create test Account + Campaign in Sandbox:**
   - Sandbox Org: [you provide URL]
   - Test Account ID: [you provide]
   - Test Campaign ID: [you provide]
   - This lets me test before production

4. **Verify API permissions:**
   - User/service account has Create Contact permission
   - User/service account has Create CampaignMember permission
   - API access is enabled in org

### Integration Support (I'll handle this)
- Build n8n workflow with your OAuth credentials
- Test Contact creation in Sandbox
- Deploy to Production when approved
- Monitor for any errors

---

## Timeline

| Task | Owner | Time |
|------|-------|------|
| Create Connected App | Freddy | 15 min |
| Provide OAuth credentials | Freddy | 5 min |
| Test in Sandbox | Me | 30 min |
| Confirm field setup | Freddy | 5 min |
| Deploy to Production | Me | 15 min |

**Total: ~1.5 hours of work spread over a few days**

---

## Questions?

- **What is n8n?** It's a workflow automation tool that connects Salesforce, Supabase, Clay, and my app
- **Is this secure?** Yes - uses OAuth, no plaintext credentials stored anywhere
- **Can we test first?** Yes! Sandbox is perfect for this
- **What if something breaks?** I can troubleshoot and fix; Salesforce APIs are very stable
- **How do users create Contacts?** They enrich prospects in my Lovable app, then click [SF] button to sync

---

## Files I'm Sending You

1. **Feasibility Analysis** - Technical deep-dive on how this works
2. **n8n Workflow JSON** - The exact workflow configuration
3. **API Specifications** - Exact SOQL queries and Salesforce API calls needed

These are purely reference - you just need to set up the Connected App and confirm the field.

---

Let me know when you have time to discuss! I'm happy to hop on a quick call to walk through this if it helps. 🚀

---

**P.S.** If you want to understand the full context, I've written a detailed feasibility doc that answers most technical questions. Happy to discuss specifics!

---

## Follow-Up Checklist

Send Freddy this after he reads the message:

- [ ] Has Freddy reviewed the message?
- [ ] Has Freddy created the Connected App?
- [ ] Has Freddy shared Client ID + Client Secret?
- [ ] Has Freddy confirmed `Account.LinkedIn__c` field exists?
- [ ] Has Freddy provided test Sandbox account + campaign?
- [ ] Have you tested OAuth in n8n?
- [ ] Have you tested Contact creation in Sandbox?
- [ ] Have you tested CampaignMember creation?
- [ ] Ready to deploy to Production?
