# Serper LinkedIn Enrichment Workflow

## Overview

This workflow uses Serper (Google Search API) to find LinkedIn profiles for prospects. It searches using **name + job title + company** to improve match accuracy.

## Key Improvements

### 1. **Enhanced Query Construction**
```javascript
// OLD: Only name + company
site:linkedin.com/in "John Doe" ("gluo" OR "gluo.be")

// NEW: Name + title keywords + company
site:linkedin.com/in "John Doe" DevOps Engineer gluo
```

**Benefits:**
- Job title helps narrow results to the right person
- Extracts key words from title (removes filler like "Senior", "Lead")
- Simpler query = better Serper results

### 2. **Improved LinkedIn Matching**

The workflow now uses a **scoring system** to find the best match:

```javascript
// Match scoring:
- Last name in text/snippet: +3 points
- Last name in LinkedIn slug: +2 points
- First name in text: +2 points
- First name in slug: +1 point
- Company name in text: +2 points
- First result: +1 point
```

**Requirements:**
- Last name MUST appear in either:
  - Search result title/snippet, OR
  - LinkedIn profile slug
- Best scoring result wins

### 3. **Better Company Name Extraction**

```javascript
// Handles domains and company names
"gluo.be" → extracts "gluo"
"TestCorp Demo BV" → extracts "testcorp"
```

### 4. **Correct Output Format**

Matches what `receive-prospect-results` edge function expects:

```javascript
{
  user_id,
  campaign_id,
  company_id,
  company_research_id,
  company_domain,
  salesforce_account_id,
  salesforce_campaign_id,
  prospect: JSON.stringify({
    status: "completed",
    company: "Company Name",
    contacts: [...],
    linkedin_stats: { total: 9, with_linkedin: 7, without_linkedin: 2 }
  }),
  status: "completed"
}
```

## Workflow Steps

1. **Webhook** - Receives prospect research request
2. **Contact Search** - OpenAI GPT-5.2 finds prospects (may or may not have LinkedIn)
3. **Format Result** - Parses OpenAI JSON response
4. **Serper LinkedIn Enrichment** - Sequential processing of all contacts:
   - For each contact without LinkedIn
   - Builds Serper query with name + title + company
   - Calls Serper API
   - Finds best matching LinkedIn URL using scoring system
   - Processes sequentially to avoid merge issues
5. **Filter** - Keeps only contacts with valid LinkedIn URLs
6. **IF Check** - Verifies at least one contact has LinkedIn
7. **Callback** - Sends results to Supabase edge function

## Why Sequential Processing?

**Previous approach (split/merge):**
- Split 9 contacts into 9 items
- Run 9 HTTP requests in parallel
- Merge results by position
- **Problem**: HTTP requests complete in different order, causing position mismatches
- Result: Wrong LinkedIn URLs matched to wrong people

**Example of the bug:**
```
Josephus de Wit (position 0) → Serper search completes 9th
Jan Bosmans (position 8) → Serper search completes 1st
Merge by position → Josephus gets Jan's LinkedIn URL ❌
```

**Current approach (sequential):**
- Process all contacts in one Code node
- For each contact: query → fetch → match → next contact
- Maintains perfect order
- **Benefit**: Correct LinkedIn URL always matches the right person ✓

**Trade-offs:**
- Sequential is slower (~300ms × 9 contacts = ~2.7s)
- Parallel would be ~300ms total if it worked correctly
- **But sequential is reliable** and 2.7s is still fast enough

## Configuration

### Environment Variables

Set in n8n **Settings > Environment Variables**:

```bash
SERPER_API_KEY=your_serper_api_key_here
```

If not set, it falls back to the hardcoded key (not recommended for production).

### API Key

Get a Serper API key at: https://serper.dev

### Webhook URL

The webhook ID is: `845a71b9-f7fd-4466-9599-3cb79e34d3a4`

Full webhook URL:
```
https://your-n8n-instance.app.n8n.cloud/webhook/845a71b9-f7fd-4466-9599-3cb79e34d3a4
```

## Example Query Transformation

### Input Contact:
```json
{
  "first_name": "Tom",
  "last_name": "Van Humbeeck",
  "job_title": "Senior DevOps Engineer (Kubernetes/Cloud)",
  "linkedin": ""
}
```

### Generated Serper Query:
```
site:linkedin.com/in "Tom Van Humbeeck" DevOps Engineer gluo
```

### Serper Results Processing:
```javascript
// Result 1: "Tom Van Humbeeck - DevOps Engineer at GLUO"
// URL: https://be.linkedin.com/in/thumbeeck
// Score: 3 (last in text) + 2 (first in text) + 2 (company in text) = 7 ✓ BEST MATCH

// Result 2: "Thomas Van Humbeeck - Software Engineer"
// URL: https://linkedin.com/in/thomas-van-humbeeck
// Score: 3 (last in text) = 3 (not enough)
```

### Output:
```json
{
  "first_name": "Tom",
  "last_name": "Van Humbeeck",
  "job_title": "Senior DevOps Engineer (Kubernetes/Cloud)",
  "linkedin": "https://www.linkedin.com/in/thumbeeck/",
  "linkedin_source": "serper",
  "priority": "High",
  "priority_reason": "...",
  "pitch_type": "Technical"
}
```

## Comparison: SerpAPI vs Serper

| Feature | SerpAPI (current) | Serper (this workflow) |
|---------|------------------|----------------------|
| API | serpapi.com | serper.dev |
| Query | Name + company only | Name + title + company |
| Matching | Basic name check | Scoring system |
| Rate Limit | 500ms delay | Per API limits |
| Format | serpapi.com/search.json | google.serper.dev/search |

## Integration with Main Workflow

To use this in your main workflow, replace the "Prospect Research Webhook" branch with these nodes from `n8n-workflow-serper-linkedin.json`.

**OR** run it as a standalone workflow and update the webhook URL in `research-proxy` edge function:

```typescript
// In supabase/functions/research-proxy/index.ts
const PROSPECT_RESEARCH_WEBHOOK =
  'https://your-n8n.app.n8n.cloud/webhook/845a71b9-f7fd-4466-9599-3cb79e34d3a4'
```

## Troubleshooting

### No LinkedIn URLs found
- Check Serper API key is valid
- Verify Serper credits remaining
- Review `_serperQuery` field in split step to ensure query is well-formed

### Wrong person matched
- Increase match score threshold (currently accepts any score > 0 with last name)
- Add more specific title keywords
- Verify company name extraction is correct

### Too slow
- Reduce `num: 5` to `num: 3` in Serper request (fewer results)
- Run multiple contacts in parallel (already optimized with split/merge)

## Cost Estimates

- Serper: ~$0.001 per search (1,000 searches = $1)
- For 10 prospects per company: ~$0.01 per company
- Much cheaper than SerpAPI for high volume

## Testing

Use the pinData from your example to test:

1. Import workflow into n8n
2. Set Serper API key
3. Use the "Test Webhook" feature with the GLUO example
4. Verify it finds Tom Van Humbeeck's LinkedIn: `https://be.linkedin.com/in/thumbeeck`
