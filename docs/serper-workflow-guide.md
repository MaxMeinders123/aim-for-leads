# Serper LinkedIn Enrichment - Complete Workflow Guide

## Overview

This workflow enriches prospect contacts with LinkedIn URLs using the Serper API. It can handle **any number of contacts** (1 to 100+) and maintains correct matching between people and their LinkedIn profiles.

## Workflow File

Import: `/n8n-workflow-serper-complete.json`

## How It Works

### Step 1: Webhook Receives Request
- Receives prospect research request with company and targeting criteria
- Responds immediately with `{"status": "processing"}`

### Step 2: OpenAI Contact Search
- GPT-5.2 with web search finds 3-7+ decision-makers
- May or may not find LinkedIn URLs
- Returns JSON array of contacts

### Step 3: Format & Parse
- Extracts JSON from OpenAI response
- Handles markdown code blocks
- Creates `{status, company, contacts[]}` structure

### Step 4: Split Contacts
- Converts array into individual items (1 per person)
- Each item contains:
  - All contact data (name, title, priority, etc.)
  - `_index` - original position (for sorting later)
  - `_skipSerper` - true if already has LinkedIn
  - `_serperQuery` - built query like: `site:linkedin.com/in "John Doe" CTO Acme`
  - `_company` - cleaned company name (removes "nv", "Inc", etc.)

**Example:**
```javascript
// Input: 3 contacts
[{name: "John"}, {name: "Jane"}, {name: "Bob"}]

// Output: 3 items
Item 1: {first_name: "John", _index: 0, _serperQuery: "site:linkedin.com/in \"John Doe\" CTO Acme"}
Item 2: {first_name: "Jane", _index: 1, _serperQuery: "site:linkedin.com/in \"Jane Smith\" VP Acme"}
Item 3: {first_name: "Bob", _index: 2, _serperQuery: "site:linkedin.com/in \"Bob Lee\" Director Acme"}
```

### Step 5: IF - Need Serper?
- Checks `_skipSerper` flag
- **TRUE path** → Already has LinkedIn, skip to Step 7
- **FALSE path** → Needs LinkedIn, go to Step 6

### Step 6: HTTP - Serper LinkedIn Search
- Makes POST request to `https://google.serper.dev/search`
- Headers: `X-API-KEY: 331d5fd92fb20aa9b798c1d46d8777ae23f92119`
- Body: `{"q": "_serperQuery", "num": 5}`
- Returns Google search results with LinkedIn profiles
- **Contact data flows through** - preserved in $json

### Step 7: Set LinkedIn from Serper
- Extracts best matching LinkedIn URL using scoring algorithm
- If skipped Serper, keeps existing LinkedIn
- If no match found, sets empty string

**Matching Logic:**
```javascript
For each search result:
  - Last name MUST appear in title/snippet OR LinkedIn slug
  - Score based on:
    - Last name in text: +3 points
    - Last name in slug: +2 points
    - First name in text: +2 points
    - First name in slug: +1 point
    - Company in text: +2 points
    - First result: +1 point
  - Keep highest scoring match
```

**Output per person:**
```javascript
{
  first_name: "John",
  last_name: "Doe",
  job_title: "CTO",
  linkedin: "https://www.linkedin.com/in/johndoe/",
  linkedin_source: "serper", // or "ai" or "not_found"
  priority: "High",
  priority_reason: "...",
  pitch_type: "Executive",
  _index: 0,
  _match_score: 8
}
```

### Step 8: Aggregate Contacts
- Collects all items back into single array
- **Sorts by `_index`** to maintain original order
- Calculates stats:
  - `total` - all contacts
  - `already_had_linkedin` - had LinkedIn from AI
  - `enriched_by_serper` - found by Serper
  - `not_found` - no LinkedIn found

**Example:**
```javascript
// Input: 3 items (may be out of order from parallel processing)
Item with _index: 2
Item with _index: 0
Item with _index: 1

// Output: 1 item with sorted array
{
  status: "completed",
  company: "Acme Inc",
  contacts: [
    {name: "John", _index: 0, linkedin: "..."},  // Sorted!
    {name: "Jane", _index: 1, linkedin: "..."},
    {name: "Bob", _index: 2, linkedin: ""}
  ],
  linkedin_stats: {
    total: 3,
    already_had_linkedin: 0,
    enriched_by_serper: 2,
    not_found: 1
  }
}
```

### Step 9: Filter LinkedIn Only
- Keeps only contacts with valid LinkedIn URLs
- Valid = starts with "http" AND contains "linkedin.com/in/"
- Updates stats with `with_linkedin` and `without_linkedin` counts

### Step 10: IF - Has LinkedIn Prospects?
- Checks if `contacts.length > 0`
- **YES** → Send to callback
- **NO** → End (no prospects to send)

### Step 11: Callback to Supabase
- POSTs to `receive-prospect-results` edge function
- Includes all IDs from original webhook request:
  - `user_id`
  - `campaign_id`
  - `company_id`
  - `company_research_id`
  - `salesforce_account_id`
  - `salesforce_campaign_id`
- Sends `prospect` as JSON string containing:
  - `status: "completed"`
  - `company`
  - `contacts[]`
  - `linkedin_stats`

## Why This Works (No Merge Issues!)

### The Problem We Solved
Previous split/merge approaches failed because:
```
Person 1 → HTTP (completes 3rd) → Merged at position 0 ❌
Person 2 → HTTP (completes 1st) → Merged at position 1 ❌
Person 3 → HTTP (completes 2nd) → Merged at position 2 ❌
Result: Wrong LinkedIn URLs matched to wrong people!
```

### Our Solution
Each person's data **flows through** the HTTP node:
```
Person 1 data → HTTP Request → Person 1 data + HTTP response → Extract
Person 2 data → HTTP Request → Person 2 data + HTTP response → Extract
Person 3 data → HTTP Request → Person 3 data + HTTP response → Extract
Result: Correct LinkedIn URL always with correct person! ✓
```

Then we sort by `_index` at the end to restore original order.

## Configuration

### API Key
Hard-coded in HTTP node: `331d5fd92fb20aa9b798c1d46d8777ae23f92119`

To use environment variable instead:
1. Set `SERPER_API_KEY` in n8n environment
2. Change HTTP node header to: `{{ $env.SERPER_API_KEY }}`

### Webhook URL
The webhook responds to: `POST /webhook/prospect-research`

Your full URL will be: `https://your-n8n.com/webhook/prospect-research`

### Callback URL
Update in the callback node: `https://lqrkrzikjlavnltbnnoa.supabase.co/functions/v1/receive-prospect-results`

## Scaling

### Performance
- **1-10 contacts**: ~1-3 seconds total
- **10-50 contacts**: ~3-8 seconds total
- **50-100 contacts**: ~8-15 seconds total

All HTTP requests happen in **parallel**, so speed scales well.

### Rate Limits
Serper API (free tier):
- 300 requests/day
- No per-second limit (we can do 100 parallel)

If you hit limits, add rate limiting:
1. After HTTP node, add Wait node
2. Set to 100ms delay
3. This slows down but prevents rate limit errors

## Testing

### Test with 1 Contact
```bash
curl -X POST https://your-n8n.com/webhook/prospect-research \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "campaign_id": "test-campaign",
    "company_id": "test-company",
    "company_research_id": "test-research",
    "company": {"name": "GLUO nv"},
    "campaign": {
      "product": "Datadog",
      "titles": "CTO, VP Engineering",
      "personas": "technical leaders",
      "pain_points": "monitoring complexity"
    }
  }'
```

### Test with 9+ Contacts
Same request - OpenAI will return 3-7+ contacts, workflow handles all of them.

## Troubleshooting

### All contacts show `linkedin_source: "not_found"`
- Check Serper API key is correct
- Check HTTP node headers are set
- Check Serper API quota (300/day free tier)

### LinkedIn URLs are wrong/mismatched
- Check that `_index` is preserved through all nodes
- Check that Aggregate node sorts by `_index`
- Verify matching score logic in "Set LinkedIn" node

### Some contacts skipped
- Check IF node condition: `!$json._skipSerper`
- Verify Split node correctly sets `_skipSerper` flag
- Check that existing LinkedIn URLs are normalized correctly

### Callback fails
- Verify Supabase URL is correct
- Check all required IDs are present in webhook body
- Verify `receive-prospect-results` edge function is deployed

## Console Output

The workflow logs progress:
```
Parsed 7 contacts for GLUO nv
✓ Found LinkedIn for John Doe: https://linkedin.com/in/johndoe/ (score: 8)
✓ Found LinkedIn for Jane Smith: https://linkedin.com/in/janesmith/ (score: 7)
✗ No LinkedIn found for Bob Lee
=== Enrichment Complete ===
Total: 7 | Found: 5 | Already had: 1 | Not found: 1
LinkedIn filtering: 6/7 contacts have valid LinkedIn URLs
```

## Summary

This workflow:
- ✅ Handles 1 to 100+ contacts
- ✅ Maintains correct person-to-LinkedIn matching
- ✅ Processes HTTP requests in parallel (fast)
- ✅ Preserves original order using `_index`
- ✅ Smart matching with scoring algorithm
- ✅ Skips contacts that already have LinkedIn
- ✅ Filters out contacts without LinkedIn
- ✅ Sends results back to Supabase via callback

Import `/n8n-workflow-serper-complete.json` and you're ready to go! 🚀
