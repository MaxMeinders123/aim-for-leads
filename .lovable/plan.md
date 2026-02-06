

# Plan: Make Webhooks Configurable with Test Functionality

## Overview
Transform the currently hardcoded webhook URLs into user-configurable settings with the ability to test each webhook before saving. The webhooks will be stored in the `user_integrations` table and used throughout the application.

## Changes Summary

### 1. Update Settings Page UI
Transform the read-only webhook display into editable input fields with test buttons.

**New sections in Settings.tsx:**
- Salesforce Campaign Import Webhook (input + test button)
- Company Research Webhook (input + test button)
- Prospect Research Webhook (input + test button)
- Clay Webhook (input + test button)

Each webhook field will have:
- Text input with the webhook URL
- "Test" button that calls the `test-webhook` edge function
- Visual feedback (success/error) after testing
- "Save" button to persist to database

### 2. Create Webhook Service Functions
Add new functions in `src/services/api.ts`:

```text
fetchUserIntegrations(userId)
  - Fetches all webhook URLs from user_integrations

updateUserIntegrations(userId, updates)
  - Updates webhook URLs in user_integrations

testWebhook(url)
  - Calls the test-webhook edge function to validate URL
```

### 3. Update UserIntegrations Interface
Extend the interface in `src/stores/appStore.ts`:

```text
interface UserIntegrations {
  dark_mode: boolean;
  sound_effects: boolean;
  clay_webhook_url?: string;
  company_research_webhook_url?: string;
  people_research_webhook_url?: string;
  salesforce_import_webhook_url?: string;
}
```

### 4. Create Webhook URL Resolution Function
Add a helper function that:
- First checks `user_integrations` for user-configured webhook
- Falls back to hardcoded `WEBHOOKS` constant if not set
- Used by Research.tsx and api.ts

```text
async function getWebhookUrl(userId, webhookType):
  const integrations = await fetchUserIntegrations(userId)
  return integrations[webhookType] || WEBHOOKS[webhookType]
```

### 5. Update Research.tsx
Modify research flow to:
- Fetch user's webhook URLs on mount
- Use configured URLs or fall back to constants
- Pass resolved URLs to `callResearchProxy()`

### 6. Update Salesforce Import Flow
Modify `importSalesforceCompanies` in api.ts to:
- Check `user_integrations` for `salesforce_import_webhook_url`
- Fall back to `WEBHOOKS.SALESFORCE_IMPORT` if not configured

## File Changes

| File | Change |
|------|--------|
| `src/stores/appStore.ts` | Add webhook URL fields to UserIntegrations interface |
| `src/services/api.ts` | Add fetchUserIntegrations, updateUserIntegrations, testWebhook functions; update importSalesforceCompanies |
| `src/pages/Settings.tsx` | Replace read-only webhook display with editable inputs + test buttons |
| `src/pages/Research.tsx` | Fetch user webhooks and use them instead of constants |
| `src/lib/constants.ts` | Keep as fallback defaults (no changes needed) |

## Settings Page Webhook Section Design

```text
+----------------------------------------------------------+
| Webhook Configuration                                     |
+----------------------------------------------------------+
| Salesforce Campaign Import (n8n)                          |
| [https://your-n8n.cloud/webhook/...     ] [Test] [Save]  |
| Helper: Fetches accounts from a Salesforce Campaign       |
+----------------------------------------------------------+
| Company Research (n8n)                                    |
| [https://your-n8n.cloud/webhook/...     ] [Test] [Save]  |
| Helper: Validates company status (Operating/Acquired...)  |
+----------------------------------------------------------+
| Prospect Research (n8n)                                   |
| [https://your-n8n.cloud/webhook/...     ] [Test] [Save]  |
| Helper: Finds decision-makers at company                  |
+----------------------------------------------------------+
| Clay Integration                                          |
| [https://clay.com/...                   ] [Test] [Save]  |
| Helper: Enriches prospects with email/phone               |
+----------------------------------------------------------+
```

## Technical Details

### Settings.tsx Implementation

```text
State:
- webhooks: {
    salesforce_import_webhook_url: string
    company_research_webhook_url: string
    people_research_webhook_url: string
    clay_webhook_url: string
  }
- testingWebhook: string | null (which webhook is being tested)
- testResults: Record<string, 'success' | 'error' | null>
- saving: boolean

On mount:
- Load user_integrations from database
- Pre-fill inputs with existing values or empty

Test button handler:
- Call supabase.functions.invoke('test-webhook', { body: { url } })
- Show toast with result
- Update testResults state

Save button handler:
- Call updateUserIntegrations with changed values
- Show success toast
```

### Research.tsx Integration

```text
On component mount:
1. Fetch user's webhook config from user_integrations
2. Store in local state or use from zustand

When calling research:
- Use user's configured URL if available
- Fall back to WEBHOOKS.COMPANY_RESEARCH / WEBHOOKS.PROSPECT_RESEARCH
```

### Fallback Strategy
The hardcoded constants in `constants.ts` serve as defaults for:
- New users who haven't configured webhooks yet
- Quick testing without requiring configuration

This ensures the app works out-of-the-box while allowing customization.

