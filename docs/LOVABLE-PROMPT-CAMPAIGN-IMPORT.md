# Lovable Prompt: Salesforce Campaign Import Feature

## Overview
Add a new feature to import companies from a Salesforce Campaign, let the user select which companies to research, and then trigger bulk research for selected companies.

---

## 1. New Database Tables (Already Created via Migration)

### campaign_imports
```sql
- id (UUID)
- user_id (UUID)
- salesforce_campaign_id (TEXT) -- e.g., "701Q400000S45dlIAB"
- total_companies (INTEGER)
- selected_companies (INTEGER)
- status (TEXT) -- 'pending_selection' | 'in_progress' | 'completed' | 'failed'
- imported_at (TIMESTAMP)
- completed_at (TIMESTAMP)
```

### campaign_companies
```sql
- id (UUID)
- campaign_import_id (UUID)
- user_id (UUID)
- salesforce_account_id (TEXT) -- Salesforce Account ID
- company_name (TEXT)
- website (TEXT)
- linkedin (TEXT)
- selected (BOOLEAN) -- User selection checkbox
- status (TEXT) -- 'pending' | 'researching' | 'completed' | 'skipped'
- company_research_id (UUID) -- Links to company_research table after research
```

---

## 2. New UI Pages

### Page 1: Import Campaign (New Route: /import-campaign)

**Purpose:** Allow user to import companies from a Salesforce Campaign

**UI Components:**

```tsx
<div className="max-w-2xl mx-auto p-6">
  <h1 className="text-2xl font-bold mb-6">Import Salesforce Campaign</h1>

  <div className="bg-white rounded-lg shadow p-6">
    <label className="block mb-4">
      <span className="text-gray-700 font-medium">Salesforce Campaign ID</span>
      <input
        type="text"
        placeholder="e.g., 701Q400000S45dlIAB"
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        value={campaignId}
        onChange={(e) => setCampaignId(e.target.value)}
      />
      <p className="mt-2 text-sm text-gray-500">
        Find this in your Salesforce Campaign URL:
        https://engagetech.lightning.force.com/lightning/r/Campaign/<strong>701Q400000S45dlIAB</strong>/view
      </p>
    </label>

    <button
      onClick={handleImportCampaign}
      disabled={!campaignId || isImporting}
      className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {isImporting ? 'Importing...' : 'Import Campaign Companies'}
    </button>
  </div>

  {/* Recent Imports List */}
  <div className="mt-8">
    <h2 className="text-xl font-semibold mb-4">Recent Imports</h2>
    <div className="space-y-3">
      {recentImports.map(import => (
        <div key={import.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
          <div>
            <p className="font-medium">{import.salesforce_campaign_id}</p>
            <p className="text-sm text-gray-500">
              {import.total_companies} companies • {import.status}
            </p>
          </div>
          <button
            onClick={() => router.push(`/campaign-selection/${import.id}`)}
            className="text-blue-600 hover:text-blue-800"
          >
            {import.status === 'pending_selection' ? 'Select Companies' : 'View'}
          </button>
        </div>
      ))}
    </div>
  </div>
</div>
```

**Logic:**

```typescript
const handleImportCampaign = async () => {
  setIsImporting(true);

  try {
    // Get user from Supabase auth
    const { data: { user } } = await supabase.auth.getUser();

    // Call n8n webhook to import campaign
    const response = await fetch('https://your-n8n-instance.com/webhook/salesforce-campaign-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaignId,
        user_id: user.id
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      toast.success(`Imported ${result.total_companies} companies!`);

      // Navigate to selection page
      router.push(`/campaign-selection/${result.campaign_import_id}`);
    } else {
      toast.error('Failed to import campaign');
    }
  } catch (error) {
    console.error('Import error:', error);
    toast.error('Failed to import campaign');
  } finally {
    setIsImporting(false);
  }
};
```

---

### Page 2: Company Selection (New Route: /campaign-selection/[importId])

**Purpose:** Show list of companies from campaign and let user select which ones to research

**UI Components:**

```tsx
<div className="max-w-6xl mx-auto p-6">
  <div className="flex justify-between items-center mb-6">
    <div>
      <h1 className="text-2xl font-bold">Select Companies to Research</h1>
      <p className="text-gray-600">Campaign: {campaignImport?.salesforce_campaign_id}</p>
    </div>

    <div className="text-right">
      <p className="text-sm text-gray-600">
        {selectedCount} of {companies.length} selected
      </p>
      <button
        onClick={handleStartResearch}
        disabled={selectedCount === 0 || isResearching}
        className="mt-2 bg-green-600 text-white py-2 px-6 rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {isResearching ? 'Starting Research...' : `Start Research (${selectedCount})`}
      </button>
    </div>
  </div>

  {/* Select All Checkbox */}
  <div className="bg-white rounded-lg shadow p-4 mb-4">
    <label className="flex items-center">
      <input
        type="checkbox"
        checked={selectAll}
        onChange={handleSelectAll}
        className="mr-3 h-5 w-5"
      />
      <span className="font-medium">Select All Companies</span>
    </label>
  </div>

  {/* Companies Table */}
  <div className="bg-white rounded-lg shadow overflow-hidden">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="w-12 px-4 py-3"></th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company Name</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Website</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">LinkedIn</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {companies.map(company => (
          <tr key={company.id} className="hover:bg-gray-50">
            <td className="px-4 py-4">
              <input
                type="checkbox"
                checked={company.selected}
                onChange={() => handleToggleCompany(company.id)}
                disabled={company.status !== 'pending'}
                className="h-5 w-5"
              />
            </td>
            <td className="px-6 py-4 font-medium text-gray-900">
              {company.company_name || 'Unknown'}
            </td>
            <td className="px-6 py-4 text-sm text-gray-500">
              {company.website ? (
                <a href={company.website} target="_blank" className="text-blue-600 hover:underline">
                  {company.website}
                </a>
              ) : (
                <span className="text-gray-400">No website</span>
              )}
            </td>
            <td className="px-6 py-4 text-sm text-gray-500">
              {company.linkedin ? (
                <a href={company.linkedin} target="_blank" className="text-blue-600 hover:underline">
                  LinkedIn
                </a>
              ) : (
                <span className="text-gray-400">No LinkedIn</span>
              )}
            </td>
            <td className="px-6 py-4 text-sm">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                company.status === 'pending' ? 'bg-gray-100 text-gray-800' :
                company.status === 'researching' ? 'bg-blue-100 text-blue-800' :
                company.status === 'completed' ? 'bg-green-100 text-green-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {company.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

**Logic:**

```typescript
const handleToggleCompany = async (companyId: string) => {
  const company = companies.find(c => c.id === companyId);

  // Update in database
  const { error } = await supabase
    .from('campaign_companies')
    .update({ selected: !company.selected })
    .eq('id', companyId);

  if (!error) {
    // Update local state
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? { ...c, selected: !c.selected } : c
    ));
  }
};

const handleStartResearch = async () => {
  setIsResearching(true);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const selectedCompanies = companies.filter(c => c.selected);

    // Update campaign import status
    await supabase
      .from('campaign_imports')
      .update({
        status: 'in_progress',
        selected_companies: selectedCompanies.length
      })
      .eq('id', importId);

    // Trigger research for each selected company
    for (const company of selectedCompanies) {
      // Update company status
      await supabase
        .from('campaign_companies')
        .update({ status: 'researching' })
        .eq('id', company.id);

      // Trigger n8n research workflow
      await fetch('https://your-n8n-instance.com/webhook/f545849d-1d19-43e7-9dfb-11e34166907f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          company_domain: company.website,
          company: {
            name: company.company_name,
            website: company.website,
            linkedin: company.linkedin,
            id: company.salesforce_account_id
          },
          campaign: {
            campaignName: 'Salesforce Import',
            salesforce_campaign_id: campaignImport.salesforce_campaign_id,
            product: 'Your Product',
            targetRegion: 'Global',
            painPoints: ['Pain 1', 'Pain 2', 'Pain 3']
          },
          salesforce_account_id: company.salesforce_account_id,
          campaign_company_id: company.id
        })
      });

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    toast.success(`Started research for ${selectedCompanies.length} companies!`);
    router.push('/research-progress');

  } catch (error) {
    console.error('Research start error:', error);
    toast.error('Failed to start research');
  } finally {
    setIsResearching(false);
  }
};
```

---

## 3. Update Existing Research Workflow

### Modify `receive-company-results` Edge Function

Add logic to link back to campaign_companies:

```typescript
// After inserting company_research record
if (body.campaign_company_id) {
  await supabase
    .from('campaign_companies')
    .update({
      status: 'completed',
      company_research_id: insertedRecord.id
    })
    .eq('id', body.campaign_company_id);
}
```

### Modify `receive-prospect-results` Edge Function

Add campaign tracking:

```typescript
// When inserting prospects
const prospectInsert = {
  // ... existing fields
  salesforce_account_id: body.salesforce_account_id,
  salesforce_campaign_id: body.campaign?.salesforce_campaign_id,
  // ... rest of fields
};
```

---

## 4. Navigation Updates

Add new menu item to navigation:

```tsx
<nav>
  <NavLink to="/">Dashboard</NavLink>
  <NavLink to="/import-campaign">Import Campaign</NavLink> {/* NEW */}
  <NavLink to="/research-progress">Research Progress</NavLink>
  <NavLink to="/settings">Settings</NavLink>
</nav>
```

---

## 5. Complete User Flow

1. **User goes to /import-campaign**
   - Enters Salesforce Campaign ID (e.g., `701Q400000S45dlIAB`)
   - Clicks "Import Campaign Companies"

2. **n8n workflow runs:**
   - Queries Salesforce CampaignMembers with Status = "Prospecting"
   - Extracts unique Account records (company name, website, LinkedIn)
   - Calls `save-campaign-companies` edge function
   - Saves to `campaign_imports` and `campaign_companies` tables

3. **User is redirected to /campaign-selection/[importId]**
   - Sees table of all companies from campaign
   - Checks boxes to select which companies to research
   - Clicks "Start Research (N)"

4. **Bulk research starts:**
   - For each selected company, trigger n8n research workflow
   - n8n uses GPT-5.2 to research company and find prospects
   - Results saved to `company_research` and `prospect_research` tables
   - `campaign_companies` table updated with status and links

5. **User views progress in /research-progress**
   - Sees companies being researched
   - Sees prospects being found
   - Can send prospects to Clay when ready

---

## 6. Key Integration Points

### n8n Webhook URL for Campaign Import:
```
https://your-n8n-instance.com/webhook/061fb742-74a4-47eb-8dd7-12bd6fade787
```

### n8n Webhook URL for Company Research:
```
https://your-n8n-instance.com/webhook/f545849d-1d19-43e7-9dfb-11e34166907f
```

### Supabase Edge Function:
```
https://lqrkrzikjlavnltbnnoa.supabase.co/functions/v1/save-campaign-companies
```

---

## 7. Data Flow Diagram

```
Salesforce Campaign (Prospecting Status)
  ↓
[Import Button] → n8n Campaign Import Workflow
  ↓
Salesforce API Query (CampaignMembers)
  ↓
Extract Accounts (deduplicate)
  ↓
save-campaign-companies edge function
  ↓
campaign_imports + campaign_companies tables
  ↓
[User Selection UI] → Select companies
  ↓
[Start Research Button] → n8n Research Workflow (for each)
  ↓
GPT-5.2 Research
  ↓
company_research + prospect_research tables
  ↓
[Research Progress UI] → View results
  ↓
[Send to Clay] → Clay enrichment → Salesforce sync
```

---

## 8. Error Handling

- Show toast notifications for import success/failure
- Disable checkboxes for companies already being researched
- Show loading states during import and research
- Handle case where Campaign ID doesn't exist
- Handle case where no companies have "Prospecting" status

---

## Implementation Checklist

- [ ] Create /import-campaign page with campaign ID input
- [ ] Create /campaign-selection/[importId] page with company selection table
- [ ] Add navigation link to Import Campaign
- [ ] Implement import button that calls n8n webhook
- [ ] Implement company selection checkboxes with Supabase updates
- [ ] Implement "Start Research" button that triggers bulk research
- [ ] Add realtime subscriptions for status updates
- [ ] Update receive-company-results to link back to campaign_companies
- [ ] Update receive-prospect-results to save salesforce_campaign_id
- [ ] Test full flow end-to-end

---

## Example Payload Formats

### Import Campaign Request:
```json
{
  "campaign_id": "701Q400000S45dlIAB",
  "user_id": "uuid-here"
}
```

### Import Campaign Response:
```json
{
  "status": "success",
  "campaign_id": "701Q400000S45dlIAB",
  "total_companies": 47,
  "message": "Campaign companies imported. Ready for selection."
}
```

### Company Research Request:
```json
{
  "user_id": "uuid",
  "company_domain": "example.com",
  "company": {
    "name": "Example Corp",
    "website": "https://example.com",
    "linkedin": "https://linkedin.com/company/example",
    "id": "001Q000001AbCdEFG"
  },
  "campaign": {
    "campaignName": "Q1 Outbound",
    "salesforce_campaign_id": "701Q400000S45dlIAB",
    "product": "Your Product",
    "targetRegion": "North America",
    "painPoints": ["Cost", "Complexity", "Scale"]
  },
  "salesforce_account_id": "001Q000001AbCdEFG",
  "salesforce_campaign_id": "701Q400000S45dlIAB",
  "campaign_company_id": "uuid-from-campaign-companies-table"
}
```

**CRITICAL:** The `salesforce_campaign_id` and `salesforce_account_id` must be included at the top level of the payload. These IDs will be:
1. Saved to `company_research` table
2. Passed through to `receive-prospect-results`
3. Saved to each `prospect_research` record
4. Sent to Clay with each prospect
5. Used by Clay to create the Contact and add to the correct Campaign

---

## 9. Critical: ID Flow Through System

To ensure prospects are added to the **correct Salesforce Campaign**, these IDs must flow through every step:

### Salesforce Campaign ID Flow:
```
Campaign Import (n8n)
  ↓ salesforce_campaign_id: "701Q400000S45dlIAB"
campaign_companies table
  ↓
User selects companies → Start Research button
  ↓ Include salesforce_campaign_id in research request
n8n Research Workflow (GPT-5.2)
  ↓ original_payload contains salesforce_campaign_id
receive-company-results edge function
  ↓ Saves to company_research.salesforce_campaign_id
  ↓ Passes to prospect webhook
receive-prospect-results edge function
  ↓ Saves to each prospect_research.salesforce_campaign_id
User clicks "Send to Clay"
  ↓
send-prospect-to-clay edge function
  ↓ Includes salesforce_campaign_id in Clay payload
Clay enriches prospect
  ↓ Uses salesforce_campaign_id
Clay creates Salesforce Contact
  ↓
Clay creates CampaignMember
  ↓ CampaignId = salesforce_campaign_id (701Q400000S45dlIAB)
  ↓ ContactId = newly created contact
  ↓ Status = "Added"
Prospect added to CORRECT campaign!
```

### Salesforce Account ID Flow:
```
Campaign Import (n8n)
  ↓ salesforce_account_id: "001Q000001AbCdEFG"
campaign_companies table
  ↓
Research request includes salesforce_account_id
  ↓
company_research.salesforce_account_id
  ↓
prospect_research.salesforce_account_id
  ↓
Clay payload includes salesforce_account_id
  ↓
Clay creates Contact with AccountId = salesforce_account_id
```

### Key Implementation Points:

**In Lovable App:**
```typescript
// When triggering research for selected companies
for (const company of selectedCompanies) {
  await fetch(n8nResearchWebhook, {
    method: 'POST',
    body: JSON.stringify({
      user_id: user.id,
      company_domain: company.website,
      // CRITICAL: Include these IDs
      salesforce_campaign_id: campaignImport.salesforce_campaign_id,
      salesforce_account_id: company.salesforce_account_id,
      campaign_company_id: company.id,
      // ... rest of payload
    })
  });
}
```

**Database Schema:**
- `campaign_companies.salesforce_account_id` (TEXT) - Source
- `company_research.salesforce_campaign_id` (TEXT) - Saved here
- `company_research.salesforce_account_id` (TEXT) - Saved here
- `prospect_research.salesforce_campaign_id` (TEXT) - Saved to each prospect
- `prospect_research.salesforce_account_id` (TEXT) - Saved to each prospect

**Clay Configuration:**
Clay must be configured to:
1. Create Salesforce Contact with `AccountId = salesforce_account_id`
2. Create Salesforce CampaignMember with:
   - `CampaignId = salesforce_campaign_id`
   - `ContactId = newly_created_contact_id`
   - `Status = "Added"`

---

**This completes the Salesforce Campaign Import feature! The user can now:**
1. Import companies from Salesforce campaigns
2. Select which companies to research
3. Trigger bulk research with campaign tracking
4. Track progress with campaign linkage
5. Send results back to Salesforce via Clay (to the correct campaign!)
