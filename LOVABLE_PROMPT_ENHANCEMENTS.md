# Lovable Prompt: Three Key Enhancements

## Feature 1: "Add to List" Button (n8n Webhook Integration)

### Context
Add a small button in the ContactsView that sends prospects to a custom n8n webhook (stored in `user_integrations.n8n_webhook_url`). This allows users to add verified prospects to their own systems/lists.

### Requirements

1. **Button Placement**
   - Add to each prospect row in ContactsView (next to the existing "Wrong Contact" button)
   - Small, compact design: just an icon button with tooltip
   - Icon: `ListPlus` from lucide-react
   - Tooltip: "Add to List"
   - Only show if `user_integrations.n8n_webhook_url` is configured

2. **Payload to Send**
   ```typescript
   {
     personal_id: prospect.personal_id,           // UUID for tracking
     session_id: prospect.clay_session_id,        // Clay session UUID
     salesforce_campaign_id: campaign.salesforce_campaign_id, // SF campaign ID
     salesforce_contact_id: prospect.salesforce_url, // SF contact URL (from Clay enrichment)
     prospect_name: `${prospect.first_name} ${prospect.last_name}`,
     prospect_title: prospect.job_title,
     company_name: prospect.company_name,
     linkedin_url: prospect.linkedin_url,
     email: prospect.email,
     phone: prospect.phone
   }
   ```

3. **Webhook Call**
   ```typescript
   // Fetch n8n_webhook_url from user_integrations
   const { data: integration } = await supabase
     .from('user_integrations')
     .select('n8n_webhook_url')
     .eq('user_id', user.id)
     .single();

   if (!integration?.n8n_webhook_url) {
     toast.error('n8n webhook not configured. Go to Settings to add it.');
     return;
   }

   // POST to webhook
   const response = await fetch(integration.n8n_webhook_url, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload)
   });

   if (response.ok) {
     toast.success('Added to list successfully');
   } else {
     toast.error('Failed to add to list. Check webhook configuration.');
   }
   ```

4. **UI Behavior**
   - Button shows loading spinner while request is in flight
   - Success: Green toast "Added to list successfully"
   - Error: Red toast "Failed to add to list"
   - Disable button after successful add (prevent duplicates)

5. **Button Design**
   ```tsx
   <Button
     variant="ghost"
     size="sm"
     onClick={() => handleAddToList(prospect)}
     disabled={addingToList || addedToList[prospect.id]}
     className="h-8 px-2"
   >
     {addingToList ? (
       <Loader2 className="h-4 w-4 animate-spin" />
     ) : (
       <ListPlus className="h-4 w-4" />
     )}
   </Button>
   ```

---

## Feature 2: Campaign Creation Best Practices & Guidance

### Context
Help users fill in campaign fields correctly to improve AI research quality. Add tooltips, placeholders, and guidance throughout the campaign creation wizard.

### Field-by-Field Guidance

#### Step 1: Basics

**Campaign Name**
- Placeholder: `"Q1 2026 Cloud Migration - EMEA"`
- Tooltip: "Be specific: include product, region, and time period"

**Target Region**
- Placeholder: `"EMEA" or "North America" or "APAC"`
- Tooltip: "Specify geographic focus for better targeting"

**Product**
- Placeholder: `"Cloud Migration Services" or "Azure Consulting"`
- Tooltip: "Describe what you're selling clearly and specifically"

**Product Category**
- Help text: "Select the category that best matches your offering"

#### Step 2: Identity (Technical Focus)

**Technical Focus**
- Placeholder: `"Azure migration, hybrid cloud, data center consolidation"`
- Tooltip: "List key technical capabilities, separated by commas"
- Help text below field:
  ```
  💡 TIP: Be specific about technologies (e.g., "AWS Lambda, serverless architecture"
  vs just "cloud"). This helps AI find the right decision-makers.
  ```

#### Step 3: Audience

**Job Titles**
- Placeholder: `"CTO, VP Engineering, Head of Infrastructure, Cloud Architect"`
- Tooltip: "List exact titles, separated by commas"
- Help text:
  ```
  💡 TIP: Use actual job titles (not generic roles). The AI will search LinkedIn
  for these exact titles. Examples: "VP of Engineering" ✅ vs "Tech Leader" ❌
  ```

**Personas**
- Placeholder: `"Technical decision-maker struggling with cloud costs and complexity"`
- Tooltip: "Describe the person's role, challenges, and goals"
- Help text:
  ```
  💡 TIP: Include pain points and goals. Example: "Engineering leader managing
  legacy infrastructure, seeking to reduce cloud costs while improving scalability"
  ```

**Target Verticals**
- Placeholder: `"SaaS, FinTech, E-commerce, Healthcare"`
- Tooltip: "Industries you're targeting, separated by commas"
- Help text:
  ```
  💡 TIP: Be specific about verticals. This helps AI validate if prospects match
  your ideal customer profile.
  ```

#### Step 4: Strategy

**Primary Angle**
- Placeholder: `"Reduce cloud costs by 40% while improving performance"`
- Tooltip: "Your main value proposition"
- Help text:
  ```
  💡 TIP: Use specific, measurable outcomes. Include numbers when possible.
  This helps AI craft better pitch suggestions for each prospect.
  ```

**Secondary Angle**
- Placeholder: `"Accelerate migration timeline from 12 months to 6 months"`
- Tooltip: "Alternative value proposition or supporting benefit"
- Help text:
  ```
  💡 TIP: Provide a secondary benefit to appeal to different priorities within
  the same company.
  ```

**Pain Points**
- Placeholder: `"High cloud bills, slow deployments, vendor lock-in, lack of expertise"`
- Tooltip: "Problems your prospects are experiencing, separated by commas"
- Help text:
  ```
  💡 TIP: List specific, current pain points your product solves. The AI uses
  this to prioritize prospects and suggest relevant pitch angles.

  Examples:
  - "Struggling with AWS costs spiraling out of control" ✅
  - "Cloud problems" ❌
  ```

### Best Practices Banner

Add a collapsible info banner at the top of the campaign creation wizard:

```tsx
<Alert className="mb-6">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Campaign Best Practices</AlertTitle>
  <AlertDescription>
    <ul className="list-disc list-inside space-y-1 text-sm mt-2">
      <li><strong>Be specific</strong>: Use exact job titles, technologies, and metrics</li>
      <li><strong>Include numbers</strong>: "40% cost reduction" beats "save money"</li>
      <li><strong>Use real pain points</strong>: Describe actual problems your prospects face</li>
      <li><strong>Target narrowly</strong>: Better results come from focused campaigns</li>
    </ul>
  </AlertDescription>
</Alert>
```

---

## Feature 3: Duplicate Campaign

### Context
Allow users to clone an existing campaign to create a "clean" version with the same targeting info but no companies/prospects. Useful for creating seasonal campaigns or testing variations.

### Requirements

1. **Add "Duplicate" Option to Campaign Menu**
   - In `Campaigns.tsx`, add to the dropdown menu (next to Edit/Delete)
   - Icon: `Copy` from lucide-react
   - Label: "Duplicate Campaign"

2. **Duplicate Functionality**
   ```typescript
   const handleDuplicateCampaign = async (campaign: Campaign) => {
     try {
       setIsSaving(true);

       // Create new campaign with same targeting, but fresh name
       const newCampaignData = {
         user_id: user.id,
         name: `${campaign.name} (Copy)`,
         target_region: campaign.target_region,
         product: campaign.product,
         product_category: campaign.product_category,
         technical_focus: campaign.technical_focus,
         job_titles: campaign.job_titles,
         personas: campaign.personas,
         target_verticals: campaign.target_verticals,
         primary_angle: campaign.primary_angle,
         secondary_angle: campaign.secondary_angle,
         pain_points: campaign.pain_points,
         // Do NOT copy: salesforce_campaign_id, companies, prospects
         companies_count: 0,
         contacts_count: 0
       };

       const { data: newCampaign, error } = await supabase
         .from('campaigns')
         .insert(newCampaignData)
         .select()
         .single();

       if (error) throw error;

       toast.success(`Campaign duplicated: ${newCampaign.name}`);

       // Open the duplicated campaign for editing (optional)
       setDraft(newCampaign);
       setEditingId(newCampaign.id);
       setShowModal(true);

       // Refresh campaigns list
       await loadCampaigns();

     } catch (error) {
       console.error('Duplicate failed:', error);
       toast.error('Failed to duplicate campaign');
     } finally {
       setIsSaving(false);
     }
   };
   ```

3. **UI Flow**
   - User clicks "Duplicate" from campaign menu
   - New campaign created immediately with name "${original_name} (Copy)"
   - Toast notification: "Campaign duplicated: Q1 2026 Cloud Migration (Copy)"
   - Optional: Open edit modal automatically so user can rename/adjust settings
   - New campaign appears in campaigns list

4. **What Gets Copied**
   ✅ **Copied:**
   - Campaign name (with " (Copy)" appended)
   - All targeting fields (region, product, titles, personas, etc.)
   - All strategy fields (angles, pain points)

   ❌ **NOT Copied:**
   - Salesforce Campaign ID (each copy is a fresh campaign)
   - Companies (start with 0)
   - Prospects/Contacts (start with 0)
   - Company research results
   - Prospect research results

5. **Dropdown Menu Update**
   ```tsx
   <DropdownMenuContent align="end">
     <DropdownMenuItem onClick={(e) => openEdit(campaign, e)}>
       <Pencil className="mr-2 h-4 w-4" />
       Edit
     </DropdownMenuItem>
     <DropdownMenuItem onClick={(e) => {
       e.stopPropagation();
       handleDuplicateCampaign(campaign);
     }}>
       <Copy className="mr-2 h-4 w-4" />
       Duplicate
     </DropdownMenuItem>
     <DropdownMenuItem
       onClick={(e) => {
         e.stopPropagation();
         setCampaignToDelete(campaign.id);
       }}
       className="text-destructive focus:text-destructive"
     >
       <Trash2 className="mr-2 h-4 w-4" />
       Delete
     </DropdownMenuItem>
   </DropdownMenuContent>
   ```

---

## Implementation Checklist

### Feature 1: Add to List Button
- [ ] Add `ListPlus` icon import from lucide-react
- [ ] Create `handleAddToList` function in ContactsView
- [ ] Fetch `n8n_webhook_url` from user_integrations
- [ ] Build payload with all required fields
- [ ] POST to n8n webhook
- [ ] Handle success/error states with toasts
- [ ] Add loading state to button
- [ ] Disable button after successful add
- [ ] Add button to each prospect row

### Feature 2: Campaign Best Practices
- [ ] Add tooltips to all campaign form fields
- [ ] Add helpful placeholders with examples
- [ ] Add help text below each field
- [ ] Add best practices banner at top of wizard
- [ ] Use `AlertCircle` icon from lucide-react
- [ ] Make banner collapsible (optional)

### Feature 3: Duplicate Campaign
- [ ] Add `Copy` icon import from lucide-react
- [ ] Create `handleDuplicateCampaign` function
- [ ] Add "Duplicate" option to campaign dropdown menu
- [ ] Copy all targeting/strategy fields
- [ ] Reset companies_count and contacts_count to 0
- [ ] Append " (Copy)" to campaign name
- [ ] Show success toast
- [ ] Optionally open edit modal for immediate editing
- [ ] Refresh campaigns list

---

## Files to Modify

1. **ContactsView.tsx** - Add "Add to List" button
2. **Campaigns.tsx** - Add duplicate functionality + best practices guidance
3. **constants.ts** - (Optional) Add n8n webhook endpoint constant

---

## Example Code Snippets

### Add to List Function (ContactsView.tsx)

```typescript
const handleAddToList = async (prospect: ProspectRow) => {
  try {
    setAddingToList(true);

    // Fetch n8n webhook URL
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('n8n_webhook_url')
      .eq('user_id', user.id)
      .single();

    if (!integration?.n8n_webhook_url) {
      toast.error('n8n webhook not configured. Go to Settings to add it.');
      return;
    }

    // Build payload
    const payload = {
      personal_id: prospect.personal_id,
      session_id: prospect.clay_session_id,
      salesforce_campaign_id: selectedCampaign?.salesforce_campaign_id,
      salesforce_contact_id: prospect.salesforce_url,
      prospect_name: `${prospect.first_name} ${prospect.last_name}`,
      prospect_title: prospect.job_title,
      company_name: prospect.company_name,
      linkedin_url: prospect.linkedin_url,
      email: prospect.email,
      phone: prospect.phone,
    };

    // POST to n8n
    const response = await fetch(integration.n8n_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('Webhook request failed');

    toast.success('Added to list successfully');
    setAddedToList((prev) => ({ ...prev, [prospect.id]: true }));

  } catch (error) {
    console.error('Add to list failed:', error);
    toast.error('Failed to add to list. Check your webhook configuration.');
  } finally {
    setAddingToList(false);
  }
};
```

---

## Summary

This prompt will create three powerful enhancements:

1. ✅ **Add to List Button** - Seamlessly integrate prospects into external systems via n8n
2. ✅ **Best Practices Guidance** - Improve AI research quality with helpful tooltips and examples
3. ✅ **Duplicate Campaign** - Quickly create campaign variations without re-entering targeting info

All features follow existing patterns, use existing components, and require no backend changes!
