# LOVABLE PROMPT: Fix Data Flow, Edge Functions, Database, and UI

## CONTEXT
The SDR research tool is partially working but data isn't displaying because:
1. Companies table is empty
2. Clay webhook updates wrong table (contacts instead of prospect_research)
3. Prospect_research is missing critical columns (email, phone, status)
4. UI doesn't show prospects grouped by company
5. Salesforce import is missing

## PHASE 1: DATABASE SCHEMA FIXES

### 1.1 Create Supabase Migration for prospect_research table

**Current columns:** id, company_user_id, first_name, last_name, job_title, linkedin_url, priority, priority_reason, pitch_type, raw_data, sent_to_clay, sent_to_clay_resp, created_at

**Add these columns:**
```sql
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent_to_clay', 'inputted', 'duplicate'));
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_url TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS salesforce_account_id TEXT;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS personal_id UUID;
ALTER TABLE prospect_research ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Update existing rows: company_id should match the company they belong to
-- For now, companies table is empty, so this will be fixed when companies are imported
```

### 1.2 Create Supabase Migration for companies table

**Ensure companies table has:**
```sql
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  campaign_id UUID REFERENCES campaigns(id),
  name TEXT NOT NULL,
  website TEXT,
  linkedin_url TEXT,
  salesforce_account_id TEXT,
  salesforce_campaign_id TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 1.3 Delete or Disable "contacts" table

The `contacts` table is not being used. Either:
- ❌ Delete it (if no important data)
- ⚠️ Keep it but don't use it

All prospect data should go into `prospect_research` table.

---

## PHASE 2: EDGE FUNCTIONS - COMPLETE REWRITE

### 2.1 FIX: send-prospect-to-clay

**Purpose:** Send individual prospects to Clay for enrichment

**Input:** POST /send-prospect-to-clay
```json
{
  "prospect_id": "UUID of the prospect",
  "user_id": "UUID of user"
}
```

**Logic:**
1. Query prospect_research by prospect_id
2. Extract: personal_id, first_name, last_name, title, linkedin_url, salesforce_account_id, company_id
3. Send to Clay webhook with:
```json
{
  "personal_id": "{{prospect.personal_id}}",
  "first_name": "{{prospect.first_name}}",
  "last_name": "{{prospect.last_name}}",
  "title": "{{prospect.job_title}}",
  "linkedin_url": "{{prospect.linkedin_url}}",
  "salesforce_account_id": "{{prospect.salesforce_account_id}}",
  "company_id": "{{prospect.company_id}}"
}
```
4. Update prospect_research: sent_to_clay = true, status = 'sent_to_clay'
5. Return { success: true, prospect_id }

**Clay webhook URL:** (from user_integrations table or settings)

---

### 2.2 FIX: clay-webhook

**Purpose:** Receive enrichment results from Clay

**Input:** POST /clay-webhook
Clay sends:
```json
{
  "personal_id": "UUID",
  "email": "john@example.com",
  "phone": "+1-555-123-4567",
  "mobile": "+1-555-987-6543",
  "is_duplicate": false,
  "salesforce_url": "https://engagetech.salesforce.com/003...",
  "salesforce_account_id": "001abc123",
  "company_id": "UUID"
}
```

**Logic:**
1. Lookup prospect_research by personal_id (NOT by id)
2. If is_duplicate = true:
   - Update prospect: email, phone, mobile, status = 'duplicate', salesforce_url
3. If is_duplicate = false:
   - Update prospect: email, phone, mobile, status = 'inputted', salesforce_url
4. Return { success: true, prospect_id }

**Update logic (TypeScript):**
```typescript
const { data, error } = await supabase
  .from('prospect_research')
  .update({
    email: body.email,
    phone: body.phone,
    mobile: body.mobile,
    status: body.is_duplicate ? 'duplicate' : 'inputted',
    salesforce_url: body.salesforce_url,
    updated_at: new Date().toISOString()
  })
  .eq('personal_id', body.personal_id)
  .select()
  .single();
```

---

### 2.3 CREATE: import-salesforce-campaign

**Purpose:** Import companies from Salesforce Campaign

**Input:** POST /import-salesforce-campaign
```json
{
  "salesforce_campaign_id": "701xyz789",
  "campaign_id": "UUID of campaign in Lovable",
  "user_id": "UUID of user"
}
```

**Logic:**
1. Call n8n webhook (from user_integrations.salesforce_import_webhook_url)
2. n8n returns: array of accounts from Salesforce
```json
{
  "accounts": [
    {
      "id": "001abc123",
      "name": "Example Inc",
      "website": "example.com",
      "linkedin_url": "https://linkedin.com/company/example"
    }
  ]
}
```
3. For each account, insert into companies:
```typescript
const companiesToInsert = accounts.map(acc => ({
  user_id,
  campaign_id,
  name: acc.name,
  website: acc.website,
  linkedin_url: acc.linkedin_url,
  salesforce_account_id: acc.id,
  salesforce_campaign_id: salesforce_campaign_id
}));

const { data, error } = await supabase
  .from('companies')
  .insert(companiesToInsert)
  .select();
```
4. Return { success: true, imported_count: data.length }

---

### 2.4 UPDATE: receive-prospect-results

**Problem:** When AI research creates prospects, they have no company_id

**Fix:** When creating prospects, include company_id

**Input:** (from n8n research callback)
```json
{
  "user_id": "UUID",
  "company_id": "UUID", // MUST be included
  "prospects": [
    {
      "first_name": "John",
      "last_name": "Smith",
      "title": "VP of Engineering",
      "linkedin_url": "https://linkedin.com/in/johnsmith"
    }
  ],
  "salesforce_account_id": "001abc123"
}
```

**Logic:**
```typescript
const { data: company } = await supabase
  .from('companies')
  .select('id, salesforce_account_id')
  .eq('id', body.company_id)
  .single();

const prospectsToInsert = body.prospects.map(p => ({
  company_id: company.id,
  company_user_id: body.user_id,
  first_name: p.first_name,
  last_name: p.last_name,
  job_title: p.title,
  linkedin_url: p.linkedin_url,
  personal_id: crypto.randomUUID(),
  salesforce_account_id: company.salesforce_account_id,
  status: 'pending'
}));

const { data, error } = await supabase
  .from('prospect_research')
  .insert(prospectsToInsert)
  .select();
```

---

## PHASE 3: FRONTEND UI FIXES

### 3.1 Add Salesforce Campaign Import Form

**Location:** Campaign Setup page (or new section)

**Component: SalesforceImportForm**
```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function SalesforceImportForm({ campaignId, onImportSuccess }) {
  const [campaignIdInput, setCampaignIdInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    if (!campaignIdInput.trim()) {
      toast.error('Please enter a Salesforce Campaign ID');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'import-salesforce-campaign',
        {
          body: {
            salesforce_campaign_id: campaignIdInput,
            campaign_id: campaignId,
            user_id: user.id
          }
        }
      );

      if (error) throw error;

      toast.success(`✅ Imported ${data.imported_count} companies`);
      onImportSuccess();
      setCampaignIdInput('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
      <h3 className="font-semibold">Import from Salesforce Campaign</h3>
      <div className="flex gap-2">
        <Input
          placeholder="701xyz789..."
          value={campaignIdInput}
          onChange={(e) => setCampaignIdInput(e.target.value)}
        />
        <Button onClick={handleImport} disabled={isLoading}>
          {isLoading ? 'Importing...' : 'Import'}
        </Button>
      </div>
    </div>
  );
}
```

---

### 3.2 Show Prospects Grouped by Company

**Location:** Research Progress page

**Component: CompanyProspectCard**
```tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Building2 } from 'lucide-react';

export function CompanyProspectCard({
  company,
  prospects,
  onSendToClay
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusCounts = {
    pending: prospects.filter(p => p.status === 'pending').length,
    inputted: prospects.filter(p => p.status === 'inputted').length,
    duplicate: prospects.filter(p => p.status === 'duplicate').length,
    sent_to_clay: prospects.filter(p => p.status === 'sent_to_clay').length
  };

  return (
    <Card className="mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-semibold">{company.name}</h3>
            <p className="text-sm text-gray-500">{company.website}</p>
            {company.salesforce_account_id && (
              <Badge variant="outline" className="mt-2">
                <Building2 className="w-3 h-3 mr-1" />
                SF Account
              </Badge>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">{prospects.length}</div>
            <div className="text-xs text-gray-500">prospects</div>
            {isExpanded ? <ChevronUp /> : <ChevronDown />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          <ProspectTable
            prospects={prospects}
            company={company}
            onSendToClay={onSendToClay}
          />
        </CardContent>
      )}
    </Card>
  );
}
```

---

### 3.3 Prospect Table with Status & Clay Button

**Component: ProspectTable**
```tsx
export function ProspectTable({ prospects, company, onSendToClay }) {
  return (
    <div className="space-y-2">
      {prospects.map(prospect => (
        <div
          key={prospect.id}
          className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
        >
          <div className="flex-1">
            <div className="font-medium">
              {prospect.first_name} {prospect.last_name}
            </div>
            <div className="text-sm text-gray-500">{prospect.job_title}</div>
            {prospect.linkedin_url && (
              <a
                href={prospect.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                LinkedIn
              </a>
            )}
          </div>

          <div className="flex gap-2 items-center">
            {/* Status Badge */}
            <StatusBadge status={prospect.status} />

            {/* Clay Button - show if pending */}
            {prospect.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSendToClay(prospect.id)}
              >
                Send to Clay
              </Button>
            )}

            {/* Salesforce Link - show if inputted or duplicate */}
            {prospect.salesforce_url && (
              <a
                href={prospect.salesforce_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View in SF ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

### 3.4 Status Badge Component

```tsx
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, AlertCircle, Send } from 'lucide-react';

export function StatusBadge({ status }) {
  const statusConfig = {
    pending: { label: 'Pending', icon: Clock, variant: 'outline' },
    sent_to_clay: { label: 'Sent to Clay', icon: Send, variant: 'secondary' },
    inputted: { label: 'Inputted', icon: CheckCircle, variant: 'default' },
    duplicate: { label: 'Duplicate', icon: AlertCircle, variant: 'destructive' }
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
```

---

### 3.5 Handler: Send Prospect to Clay

```tsx
const handleSendToClay = async (prospectId) => {
  try {
    const { data, error } = await supabase.functions.invoke(
      'send-prospect-to-clay',
      {
        body: {
          prospect_id: prospectId,
          user_id: user.id
        }
      }
    );

    if (error) throw error;

    toast.success('Prospect sent to Clay');
    refetch(); // Refresh prospects list
  } catch (err) {
    toast.error(err.message);
  }
};
```

---

## PHASE 4: TESTING & VERIFICATION

### Step 1: Test Database
- [ ] Run Supabase migrations (Phase 1)
- [ ] Verify companies table structure
- [ ] Verify prospect_research table has all columns

### Step 2: Test Edge Functions
- [ ] Import a Salesforce campaign
  - Check: companies table now has X rows
  - Check: Each company has salesforce_account_id
- [ ] Send a prospect to Clay
  - Check: sent_to_clay = true, status = 'sent_to_clay'
- [ ] Simulate Clay webhook response
  - POST to /clay-webhook with test data
  - Check: prospect has email, phone, status = 'inputted'

### Step 3: Test UI
- [ ] See companies in dropdown/list
- [ ] Click expand company → see prospects
- [ ] Click [Send to Clay] → status changes to "Sent to Clay"
- [ ] Simulate Clay webhook → see status change to "Inputted"
- [ ] See Salesforce link (if status = inputted)

### Step 4: Full Flow Test
1. Import Salesforce campaign → see companies appear
2. Run AI research on company → see prospects appear (pending status)
3. Send prospect to Clay → see status change to "sent_to_clay"
4. Clay enriches → webhook updates to "inputted" or "duplicate"
5. UI shows final status + Salesforce link

---

## SECURITY CHECKLIST

### Row Level Security (RLS)
- [ ] users can only see their own campaigns
- [ ] users can only see their own companies (user_id match)
- [ ] users can only see their own prospects (via company.user_id)

**RLS Policy Example:**
```sql
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_companies"
ON companies FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "users_create_own_companies"
ON companies FOR INSERT
WITH CHECK (user_id = auth.uid());
```

### Webhook Security
- [ ] Clay webhook validates source (IP whitelist or signed header)
- [ ] Salesforce webhook validates source
- [ ] Never log sensitive data (email, phone) to console

---

## SUMMARY

**After all phases:**
- ✅ Companies import from Salesforce with ID + LinkedIn
- ✅ Prospects created during research with company_id
- ✅ Prospects sent individually to Clay
- ✅ Clay enriches and returns email/phone
- ✅ Clay checks Salesforce duplicates (external)
- ✅ UI shows companies (accordion) → prospects (table)
- ✅ Prospect status: pending → sent_to_clay → inputted/duplicate
- ✅ Salesforce link shown if status = inputted

**You can then:**
- 🔄 Let Freddy create his n8n workflow for duplicate detection
- 🔄 Build the actual Salesforce Contact creation workflow
- 🔄 Scale to bulk operations
