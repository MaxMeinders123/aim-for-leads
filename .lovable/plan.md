
# Accept Raw LLM Text in Edge Functions

## Overview
Update both `receive-company-results` and `receive-prospect-results` edge functions to accept a `text` field containing raw LLM output (potentially wrapped in markdown code fences), parse it server-side, and store the structured JSON in the database.

## Why This Approach
- **Simpler n8n configuration**: Just send strings, no need to fight with JSON validation in n8n
- **Consistent parsing**: Edge Functions handle all markdown stripping and JSON parsing
- **Error handling**: Better control over parsing errors at the server level

## Current vs New Payload Structure

### receive-company-results

**Current payload (expects pre-parsed JSON):**
```json
{
  "user_id": "abc123",
  "company_domain": "example.com",
  "company_data": { "name": "...", "industry": "..." },
  "status": "completed",
  "error_message": null
}
```

**New payload (accepts raw text):**
```json
{
  "user_id": "abc123",
  "company_domain": "example.com",
  "text": "```json\n{\"name\": \"Example Corp\", \"industry\": \"Tech\"}\n```",
  "status": "completed",
  "error_message": null
}
```

### receive-prospect-results

**Current payload:**
```json
{
  "user_id": "abc123",
  "company_domain": "example.com",
  "prospect_data": [{ "name": "...", "title": "..." }],
  "research_result_id": "uuid",
  "status": "completed"
}
```

**New payload:**
```json
{
  "user_id": "abc123",
  "company_domain": "example.com",
  "text": "```json\n[{\"name\": \"John Doe\", \"title\": \"CTO\"}]\n```",
  "research_result_id": "uuid",
  "status": "completed"
}
```

## Implementation Details

### Parsing Helper Function
Both edge functions will use the same parsing logic:

```text
+------------------+     +----------------------+     +------------------+
| Raw LLM text     | --> | Strip ```json fences | --> | Parse to JSON    |
| from n8n         |     | and trim whitespace  |     | (object or array)|
+------------------+     +----------------------+     +------------------+
```

```typescript
function parseTextToJson(text?: string): any {
  if (!text) return null;
  
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim();
  
  if (!cleaned) return null;
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse text as JSON:", e);
    return null;
  }
}
```

### Changes to receive-company-results

1. Update destructuring to extract `text` instead of `company_data`
2. Add parsing logic to convert `text` to `company_data`
3. Use parsed `company_data` in database operations
4. Continue passing parsed `company_data` to the people research webhook

### Changes to receive-prospect-results

1. Update destructuring to extract `text` instead of `prospect_data`
2. Add parsing logic to convert `text` to `prospect_data`
3. Use parsed `prospect_data` in database operations
4. Continue passing parsed `prospect_data` to Clay webhook

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/receive-company-results/index.ts` | Add text parsing, use parsed company_data |
| `supabase/functions/receive-prospect-results/index.ts` | Add text parsing, use parsed prospect_data |

## Summary
- Both endpoints will accept `text` (raw string) instead of pre-parsed JSON
- Parsing happens server-side with markdown fence stripping
- n8n can simply pass the LLM response as-is without JSON validation
- Failed parsing results in `null` data (graceful degradation)
