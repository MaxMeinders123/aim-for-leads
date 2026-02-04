
# Fix Edge Function to Handle Actual n8n Payloads

## Problem Summary
The `receive-research-results` edge function expects `text` and `type` fields, but n8n is sending:
- Company data in a `" company"` field (with leading space) or `"company"` field
- Prospect data in a `"prospect"` field

Both are being processed as "company" type because the edge function defaults to "company" when no `type` field is present.

## Solution
Update the edge function to:
1. Auto-detect the research type based on which field is present (`company`, ` company`, or `prospect`)
2. Extract the raw text from whichever field is found
3. Parse and save to the correct database column (`company_data` or `prospect_data`)
4. Update the UI to properly display the structured data

## Changes Required

### 1. Edge Function (`supabase/functions/receive-research-results/index.ts`)

Update the payload extraction logic to auto-detect fields:

```text
+---------------------+     +------------------------+     +------------------+
| Incoming Payload    | --> | Detect field name      | --> | Extract & Parse  |
| company/prospect/?  |     | (company, prospect,    |     | raw text to JSON |
+---------------------+     | or text + type)        |     +------------------+
```

**New detection logic:**
- Check for `prospect` field → treat as prospect research
- Check for `company` or ` company` (with space) field → treat as company research  
- Fall back to `text` + `type` for explicit control

**Key changes:**
- Add field detection at the start of processing
- Normalize field names (trim spaces)
- Auto-determine type based on field presence
- Continue using the same database update logic

### 2. UI Updates (`src/pages/ResearchSystem.tsx`)

Improve the company and prospect data display cards:

**Company Information Card:**
- Show Company Status (Operating/Acquired)
- Show Cloud Provider preference with confidence
- Show Website and LinkedIn links
- Show evidence URLs

**Prospects Card:**
- Show Name (first_name + last_name)
- Show Job Title
- Show LinkedIn link
- Show Priority badge (High/Medium/Low)
- Show Priority Reason

## Updated Payload Formats Supported

After this change, the edge function will accept ANY of these formats:

**Format 1: Current n8n company payload**
```json
{
  "user_id": "...",
  "company_domain": "klm",
  "company": "```json\n{...}\n```"
}
```

**Format 2: Current n8n prospect payload**
```json
{
  "user_id": "...",
  "company_domain": "klm",
  "prospect": "```json\n{...}\n```"
}
```

**Format 3: Explicit type (still supported)**
```json
{
  "user_id": "...",
  "company_domain": "klm",
  "type": "company",
  "text": "```json\n{...}\n```"
}
```

## Research Flow Diagram

```text
    Frontend                    n8n                     Edge Function              Database
       |                         |                            |                       |
       |---[Start Research]----->|                            |                       |
       |                         |                            |                       |
       |                   [Company Research]                 |                       |
       |                         |                            |                       |
       |                         |---{ company: "..." }------>|                       |
       |                         |                            |---[company_data]----->|
       |                         |                            |   status: company_complete
       |<---[realtime update: company_data]---------------------------------------|
       |                         |                            |                       |
       |                         |<---[Trigger People]--------|                       |
       |                         |                            |                       |
       |                   [Prospect Research]                |                       |
       |                         |                            |                       |
       |                         |---{ prospect: "..." }----->|                       |
       |                         |                            |---[prospect_data]--->|
       |                         |                            |   status: completed   |
       |<---[realtime update: prospect_data]--------------------------------------|
       |                         |                            |                       |
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/receive-research-results/index.ts` | Auto-detect `company`/`prospect` fields, extract text from correct field |
| `src/pages/ResearchSystem.tsx` | Improve company and prospect card displays with structured data |

## Technical Details

### Edge Function Field Detection
```typescript
// Detect which field contains the raw text and determine type
const rawText = body.prospect || body.company || body[" company"] || body.text;
const detectedType = body.prospect ? "prospect" 
  : (body.company || body[" company"]) ? "company" 
  : (body.type || "company");
```

### UI Company Card Display
- Status badge: Operating (green) / Acquired (yellow)
- Cloud preference with confidence percentage
- Links to LinkedIn and website
- Evidence URLs as clickable list

### UI Prospect Card Display
- Full name with job title
- Priority badge with color coding (High=red, Medium=yellow, Low=gray)
- LinkedIn profile link
- Expandable priority reason text
