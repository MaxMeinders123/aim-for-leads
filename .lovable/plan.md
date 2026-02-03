
# Restructure n8n Webhook Payload

## Overview
Transform the payload sent to the n8n webhook when starting research to match your specified format. This involves reorganizing campaign data into a flatter, more structured format with arrays for multi-value fields.

## Current Payload Structure
The current payload sends the raw campaign object:
```json
{
  "event": "research_start",
  "campaign_id": "...",
  "campaign": { /* full campaign object */ },
  "companies": [{ "id": "...", "name": "...", ... }]
}
```

## New Payload Structure
Transform to your requested format:
```json
{
  "campaignName": "Cloudar",
  "painPoints": ["Pain point 1", "Pain point 2", ...],
  "primaryAngle": "Cost optimization, Security assessment ai",
  "product": "Cloud consultancy",
  "productCategory": "Cloud Services",
  "secondaryAngle": "managed services, training",
  "targetPersonas": ["Decision maker or key influencer"],
  "targetRegion": "Benelux",
  "targetTitles": ["CIO / IT Director / Head of IT", ...],
  "targetVerticals": [],
  "techFocus": "AI, Security, FinOps, Devops",
  "qualify": true,
  "region": "Benelux",
  "primaryPitchTypes": ["Security", "AI", "FinOps", "Modernization"],
  "company": {
    "name": "klm",
    "website": "",
    "linkedin": ""
  }
}
```

## Implementation

### File to Modify
**`src/pages/CompanyPreview.tsx`** - Update the `handleStartResearch` function

### Changes
1. Create a helper function to parse multi-line/comma-separated text into arrays
2. Build the new payload structure with proper field mappings:
   - `campaignName` from `campaign.name`
   - `painPoints` - split pain_points string by newlines into array
   - `primaryAngle` from `campaign.primary_angle`
   - `product` from `campaign.product`
   - `productCategory` from `campaign.product_category`
   - `secondaryAngle` from `campaign.secondary_angle`
   - `targetPersonas` - split personas into array
   - `targetRegion` from `campaign.target_region`
   - `targetTitles` - split job_titles into array
   - `targetVerticals` - split target_verticals into array (empty if none)
   - `techFocus` from `campaign.technical_focus`
   - `qualify: true` (static value)
   - `region` from `campaign.target_region` (duplicate for compatibility)
   - `primaryPitchTypes` - derive from primary/secondary angles
   - `company` - send one company at a time with name, website, linkedin fields

3. Since you want one company per request, loop through selected companies and send individual requests (or send as array - will clarify)

---

## Technical Details

### String-to-Array Parsing Logic
```typescript
const parseToArray = (text?: string): string[] => {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
};
```

### Payload Transformation
```typescript
const payload = {
  campaignName: selectedCampaign?.name || '',
  painPoints: parseToArray(selectedCampaign?.pain_points),
  primaryAngle: selectedCampaign?.primary_angle || '',
  product: selectedCampaign?.product || '',
  productCategory: selectedCampaign?.product_category || '',
  secondaryAngle: selectedCampaign?.secondary_angle || '',
  targetPersonas: parseToArray(selectedCampaign?.personas),
  targetRegion: selectedCampaign?.target_region || '',
  targetTitles: parseToArray(selectedCampaign?.job_titles),
  targetVerticals: parseToArray(selectedCampaign?.target_verticals),
  techFocus: selectedCampaign?.technical_focus || '',
  qualify: true,
  region: selectedCampaign?.target_region || '',
  primaryPitchTypes: derivePitchTypes(selectedCampaign),
  company: {
    name: company.name,
    website: company.website || '',
    linkedin: company.linkedin_url || ''
  }
};
```

### Pitch Types Derivation
Extract keywords from primary/secondary angles for primaryPitchTypes array.

## Summary
This change restructures the webhook payload to be cleaner and more explicit for n8n processing, with arrays for multi-value fields and a flattened structure that's easier to work with in automation workflows.
