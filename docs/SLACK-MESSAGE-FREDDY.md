# Slack Message for Freddy (Salesforce Owner)

**Copy and customize this message to send to Freddy**

---

Hey Freddy!

I've built an SDR research tool that automates prospect discovery and is ready for Salesforce integration. Here's what's working and what I need from you.

## What's Working Now

1. **Campaign Management** - Create campaigns with product, region, target personas, pain points, and sales angles
2. **Salesforce Import** - Import companies from SF Campaigns by Campaign ID (filters by Prospecting_Status__c = 'Target Account')
3. **Manual Company Entry** - Add companies manually with name/website/LinkedIn
4. **AI Research** - GPT-5.2 with web search validates company status (Operating/Acquired/Bankrupt) and finds 3-7 decision-makers per company with titles, LinkedIn profiles, and priority rankings
5. **Clay Enrichment** - Send prospects to Clay for email + phone enrichment
6. **CSV Export** - Export all prospects with contact details

## What I Need From You

The last piece is syncing enriched prospects back to Salesforce as Contacts under the correct Account + Campaign.

### The Data Flow
```
My App -> Clay (enrichment) -> My App -> Salesforce
                                         |
                                         v
                                    Create Contact
                                    Add to Campaign
```

### What I'll Send to Salesforce

After Clay enrichment, each prospect has:
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "title": "VP of Engineering",
  "email": "john.smith@example.com",
  "phone": "+1-555-123-4567",
  "mobile": "+1-555-987-6543",
  "linkedin_url": "https://linkedin.com/in/johnsmith",
  "salesforce_account_id": "001abc123...",
  "salesforce_campaign_id": "701xyz789..."
}
```

### What Needs to Happen in Salesforce

**Step 1:** Check if Contact exists (by email + AccountId)
**Step 2:** Create Contact if new (with all fields above)
**Step 3:** Create CampaignMember to link Contact to Campaign (Status = "Added")
**Step 4:** Return the Salesforce Contact URL back to my app

### What I Need You To Do

**1. Create Connected App (15 min)**
- Setup > Apps > App Manager > New Connected App
- Name: "n8n Salesforce Sync"
- Enable OAuth, Scopes: `api`, `refresh_token`, `offline_access`
- Callback URL: I'll provide the exact n8n OAuth callback URL
- Share the Client ID + Client Secret with me

**2. Confirm Custom Field (5 min)**
- Does `Contact.LinkedIn__c` (Text, 255) exist?
- If not, can you create it? Or I'll store LinkedIn on a different field

**3. Test Account + Campaign in Sandbox (5 min)**
- Provide a test Sandbox URL
- Provide a test Account ID + Campaign ID for testing

**4. Verify Permissions (2 min)**
- Service account has Create Contact permission
- Service account has Create CampaignMember permission
- API access is enabled

## What I've Already Built for This

- n8n workflow JSON ready to import (checks duplicates, creates Contact, adds to Campaign)
- Edge function for calling the workflow from my app
- UI button for "Push to Salesforce" (will add once you provide credentials)
- Full error handling and status tracking

## Timeline

| Task | Who | Time |
|------|-----|------|
| Create Connected App | You | 15 min |
| Share OAuth credentials | You | 5 min |
| Confirm LinkedIn__c field | You | 5 min |
| Test in Sandbox | Me | 30 min |
| Deploy to Production | Me | 15 min |

**Total: ~1 hour spread over a few days**

## Security

- OAuth authentication (no plaintext credentials)
- All API calls through n8n (workflow automation tool)
- Duplicate detection before creating Contacts
- Can test in Sandbox first before Production

## Questions?

- The n8n workflow is pre-built, I just need your OAuth credentials to connect
- Everything can be tested in Sandbox first
- The tool doesn't modify existing Contacts, it only creates new ones
- CampaignMember status defaults to "Added" (can change if you prefer different)

Let me know when you have time to set up the Connected App! Happy to hop on a quick call if that helps.

---

## Follow-Up Checklist

- [ ] Freddy reviewed this message
- [ ] Connected App created in Salesforce
- [ ] Client ID + Client Secret shared
- [ ] LinkedIn__c field confirmed/created
- [ ] Test Sandbox credentials provided
- [ ] OAuth tested in n8n
- [ ] Contact creation tested in Sandbox
- [ ] CampaignMember creation tested
- [ ] Ready for Production deployment
