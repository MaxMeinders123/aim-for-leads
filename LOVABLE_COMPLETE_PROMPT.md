# COMPLETE LOVABLE PROMPT: Add to Salesforce Campaign Feature

## Overview
Add a feature that allows users to send enriched prospects directly to their Salesforce campaign with one click. This integrates with an n8n webhook that handles the Salesforce API call.

---

## Feature Requirements

### 1. UI: Add to Campaign Button

**Location:** ContactsView.tsx - in each prospect row

**Button Design:**
- Small button next to the "Wrong Contact" button
- Icon: `UserPlus` from lucide-react
- Tooltip: "Add to Salesforce Campaign"
- Only show if:
  - `prospect.salesforce_url` exists (contact was enriched by Clay)
  - `campaign.salesforce_account_id` AND `campaign.salesforce_campaign_id` exist (campaign is linked to Salesforce)
  - `user_integrations.n8n_webhook_url` is configured

**Button States:**
- Default: `UserPlus` icon, blue color
- Loading: `Loader2` spinning icon
- Success: Disabled, green checkmark icon
- Error: Red `AlertCircle` icon (clickable to retry)

### 2. Database: No Changes Needed

**Existing fields we'll use:**
- `user_integrations.n8n_webhook_url` - where to send the webhook
- `prospect_research.salesforce_url` - the Salesforce contact URL (from Clay enrichment)
- `campaigns.salesforce_account_id` - the Salesforce account ID (required)
- `campaigns.salesforce_campaign_id` - the Salesforce campaign ID (required)
- `prospect_research.personal_id` - unique prospect identifier

### 3. Frontend Logic

**Create new service function in `/src/services/api.ts`:**

```typescript
/**
 * Add prospect to Salesforce campaign via n8n webhook
 */
export async function addProspectToSalesforceCampaign(
  webhookUrl: string,
  payload: {
    personal_id: string;
    session_id: string | null;
    salesforce_contact_id: string; // Full URL or just ID
    salesforce_campaign_id: string;
    prospect_name: string;
    prospect_title: string | null;
    company_name: string | null;
    linkedin_url: string | null;
    email: string | null;
    phone: string | null;
  }
) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to add to Salesforce campaign');
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error('Add to Salesforce campaign failed', { error, payload });
    throw error;
  }
}
```

**Update ContactsView.tsx:**

```typescript
// Add state
const [addingToCampaign, setAddingToCampaign] = useState<Record<string, boolean>>({});
const [addedToCampaign, setAddedToCampaign] = useState<Record<string, boolean>>({});

// Add handler
const handleAddToSalesforceCampaign = async (prospect: ProspectRow) => {
  try {
    setAddingToCampaign(prev => ({ ...prev, [prospect.id]: true }));

    // Fetch n8n webhook URL
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('n8n_webhook_url')
      .eq('user_id', user.id)
      .single();

    if (!integration?.n8n_webhook_url) {
      toast.error('n8n webhook not configured. Go to Settings to add your n8n webhook URL.');
      return;
    }

    if (!prospect.salesforce_url) {
      toast.error('No Salesforce contact URL found. Enrich this prospect with Clay first.');
      return;
    }

    if (!selectedCampaign?.salesforce_account_id || !selectedCampaign?.salesforce_campaign_id) {
      toast.error('This campaign is missing Salesforce Account ID or Campaign ID. Update campaign settings.');
      return;
    }

    // Build payload
    const payload = {
      personal_id: prospect.personal_id || prospect.id,
      session_id: prospect.clay_session_id || null,
      salesforce_contact_id: prospect.salesforce_url,
      salesforce_campaign_id: selectedCampaign.salesforce_campaign_id,
      prospect_name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
      prospect_title: prospect.job_title,
      company_name: prospect.company_name,
      linkedin_url: prospect.linkedin_url,
      email: prospect.email,
      phone: prospect.phone,
    };

    // Call n8n webhook
    await addProspectToSalesforceCampaign(integration.n8n_webhook_url, payload);

    // Success
    toast.success(`Added ${payload.prospect_name} to Salesforce campaign`);
    setAddedToCampaign(prev => ({ ...prev, [prospect.id]: true }));

  } catch (error: any) {
    console.error('Failed to add to Salesforce campaign:', error);
    toast.error(error.message || 'Failed to add to Salesforce campaign');
  } finally {
    setAddingToCampaign(prev => ({ ...prev, [prospect.id]: false }));
  }
};
```

**Add button to prospect row UI:**

```tsx
{/* Add to Salesforce Campaign Button */}
{prospect.salesforce_url &&
 selectedCampaign?.salesforce_account_id &&
 selectedCampaign?.salesforce_campaign_id &&
 userIntegrations?.n8n_webhook_url && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => handleAddToSalesforceCampaign(prospect)}
    disabled={addingToCampaign[prospect.id] || addedToCampaign[prospect.id]}
    className={cn(
      "h-8 px-2",
      addedToCampaign[prospect.id] && "text-green-600"
    )}
    title={
      addedToCampaign[prospect.id]
        ? "Added to Salesforce campaign"
        : "Add to Salesforce campaign"
    }
  >
    {addingToCampaign[prospect.id] ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : addedToCampaign[prospect.id] ? (
      <Check className="h-4 w-4" />
    ) : (
      <UserPlus className="h-4 w-4" />
    )}
  </Button>
)}
```

### 4. Settings Page Update

**Add n8n webhook URL configuration:**

In your Settings page, add a field to configure the n8n webhook URL:

```tsx
<div className="space-y-2">
  <Label htmlFor="n8n_webhook_url">n8n Webhook URL (Add to Campaign)</Label>
  <Input
    id="n8n_webhook_url"
    type="url"
    placeholder="https://your-n8n.app.n8n.cloud/webhook/add-to-salesforce-campaign"
    value={n8nWebhookUrl}
    onChange={(e) => setN8nWebhookUrl(e.target.value)}
  />
  <p className="text-sm text-muted-foreground">
    Your n8n webhook URL for adding prospects to Salesforce campaigns.
    This is required for the "Add to Campaign" button to work.
  </p>
</div>
```

---

## n8n Workflow Setup

### How to Set Up the n8n Workflow

1. **Import the workflow:**
   - Go to your n8n instance
   - Click "Add Workflow" → "Import from File"
   - Copy the JSON below and paste it, or upload `N8N_WORKFLOW_ADD_TO_CAMPAIGN.json`

2. **Configure Salesforce credentials:**
   - Click on the "Add Contact to Campaign" node
   - Add your Salesforce OAuth2 credentials
   - Test the connection

3. **Get the webhook URL:**
   - Click on the "Webhook - Receive Prospect" node
   - Copy the "Production URL" (e.g., `https://your-n8n.app.n8n.cloud/webhook/add-to-salesforce-campaign`)
   - Save this URL in your Aim for Leads Settings page

4. **Activate the workflow:**
   - Click "Active" toggle in top-right corner

### What the Workflow Does

1. **Receives webhook** with prospect data
2. **Extracts Salesforce IDs** from the payload (handles full URLs)
3. **Validates required fields** (contact ID and campaign ID)
4. **Adds contact to campaign** using Salesforce API
5. **Responds with success/error** JSON

### Expected Payload (Input)

```json
{
  "personal_id": "123e4567-e89b-12d3-a456-426614174000",
  "session_id": "987fcdeb-51a2-43f1-b789-123456789abc",
  "salesforce_contact_id": "https://yourinstance.salesforce.com/003XXXXXXXXXXXXXXX",
  "salesforce_campaign_id": "701XXXXXXXXXXXXXXX",
  "prospect_name": "John Doe",
  "prospect_title": "VP of Engineering",
  "company_name": "Acme Corp",
  "linkedin_url": "https://linkedin.com/in/johndoe",
  "email": "john.doe@acme.com",
  "phone": "+1-555-0100"
}
```

### Response (Output)

**Success (200):**
```json
{
  "success": true,
  "message": "Contact added to campaign successfully",
  "salesforce_contact_id": "003XXXXXXXXXXXXXXX",
  "salesforce_campaign_id": "701XXXXXXXXXXXXXXX",
  "personal_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Error - Missing Fields (400):**
```json
{
  "success": false,
  "message": "Missing required fields: salesforce_contact_id or salesforce_campaign_id",
  "received_data": { ... }
}
```

**Error - Salesforce Failure (500):**
```json
{
  "success": false,
  "message": "Failed to add contact to campaign",
  "error": "Salesforce error details",
  "salesforce_contact_id": "003XXXXXXXXXXXXXXX",
  "salesforce_campaign_id": "701XXXXXXXXXXXXXXX"
}
```

---

## Implementation Checklist

### Frontend (Lovable)
- [ ] Add `UserPlus` icon import to ContactsView
- [ ] Add state for `addingToCampaign` and `addedToCampaign`
- [ ] Create `addProspectToSalesforceCampaign` function in `api.ts`
- [ ] Create `handleAddToSalesforceCampaign` handler in ContactsView
- [ ] Add button to prospect row UI with conditional rendering
- [ ] Add n8n webhook URL field to Settings page
- [ ] Update `user_integrations` save logic in Settings

### Backend (n8n)
- [ ] Import workflow JSON into n8n
- [ ] Configure Salesforce OAuth2 credentials
- [ ] Test workflow with sample data
- [ ] Activate workflow
- [ ] Copy webhook URL to Aim for Leads Settings

### Testing
- [ ] Verify button only shows when all conditions are met
- [ ] Test successful add to campaign
- [ ] Test error handling (missing webhook URL, Salesforce errors)
- [ ] Verify contact appears in Salesforce campaign
- [ ] Test loading and success states

---

## User Flow

1. **User enriches prospects with Clay** (gets Salesforce contact URL)
2. **User links campaign to Salesforce campaign** (sets salesforce_campaign_id)
3. **User configures n8n webhook in Settings**
4. **User clicks "Add to Campaign" button** on enriched prospect
5. **Frontend sends data to n8n webhook**
6. **n8n adds contact to Salesforce campaign**
7. **User sees success toast** "Added John Doe to Salesforce campaign"
8. **Button shows green checkmark** (disabled, can't re-add)

---

## Error Handling

| Error | Message | Solution |
|-------|---------|----------|
| No webhook URL | "n8n webhook not configured" | Go to Settings, add webhook URL |
| No Salesforce contact URL | "No Salesforce contact URL found" | Enrich prospect with Clay first |
| No Salesforce IDs | "Campaign missing Salesforce Account ID or Campaign ID" | Edit campaign, add both salesforce_account_id and salesforce_campaign_id |
| Salesforce API error | "Failed to add to campaign" | Check n8n logs, verify Salesforce credentials |
| Network error | "Failed to add to campaign" | Check n8n webhook URL, verify it's active |

---

## Files to Create/Modify

### Create:
- `N8N_WORKFLOW_ADD_TO_CAMPAIGN.json` - n8n workflow (already created)

### Modify:
- `src/services/api.ts` - Add `addProspectToSalesforceCampaign` function
- `src/pages/ContactsView.tsx` - Add button and handler
- `src/pages/Settings.tsx` (or wherever settings are) - Add n8n webhook URL field

---

## Complete n8n Workflow JSON

See `N8N_WORKFLOW_ADD_TO_CAMPAIGN.json` in this repository.

---

## Summary

This feature enables one-click addition of enriched prospects to Salesforce campaigns:

✅ **Frontend:** Small button with loading/success states
✅ **Backend:** n8n workflow handles Salesforce API
✅ **User-friendly:** Clear error messages and success feedback
✅ **Safe:** Only shows when all requirements are met
✅ **Trackable:** Uses personal_id for audit trail
✅ **No Supabase changes:** Uses existing fields and tables

**Result:** SDRs can verify a prospect in Aim for Leads, click one button, and instantly add them to their active Salesforce campaign!
