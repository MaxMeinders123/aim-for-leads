# Lovable Prompt: Research Persistence & Push to Contacts

## Overview

This document provides instructions for Lovable to implement research state persistence and a "Push to Contacts" feature. This allows users to:

1. **Persist Research State** - Research progress is automatically saved when navigating away and restored when returning
2. **Display Researched People** - All prospects from the `prospect_research` table are loaded and displayed in research cards
3. **Push to Contacts** - Users can push researched prospects directly to the main contacts page with one click

## Problem Statement

Previously, when users navigated away from the research page, their research state would be lost. Additionally, prospects stored in the database were not being displayed on the frontend, and there was no way to move researched prospects to the main contacts list.

## Solution Architecture

### 1. Research State Persistence (localStorage)

**File**: `src/pages/ResearchProgress.tsx`

Add a `useEffect` hook that persists research progress to localStorage:

```typescript
// Persist research progress to localStorage
useEffect(() => {
  const RESEARCH_STATE_KEY = `research_progress_${selectedCampaign?.id}`;
  localStorage.setItem(RESEARCH_STATE_KEY, JSON.stringify(researchProgress));
}, [researchProgress, selectedCampaign?.id]);
```

**Implementation Details**:
- Key format: `research_progress_[campaignId]`
- Persists on every `researchProgress` change
- Allows restoration of full research state (company list, current step, progress for each company)

### 2. Load Researched Prospects from Database

**File**: `src/pages/ResearchProgress.tsx`

Add a `useEffect` that loads existing prospects when component mounts:

```typescript
useEffect(() => {
  const loadExistingProspects = async () => {
    if (!user?.id || companiesProgress.length === 0) return;

    for (const progress of companiesProgress) {
      // Skip if already has people data
      if (progress.peopleData?.contacts && progress.peopleData.contacts.length > 0) {
        continue;
      }

      // Skip if no company_research_id
      if (!progress.company_research_id) {
        continue;
      }

      try {
        const { data: prospects } = await supabase
          .from('prospect_research')
          .select('*')
          .eq('company_research_id', progress.company_research_id)
          .order('created_at', { ascending: false });

        if (prospects && prospects.length > 0) {
          // Convert to ResearchContact format and update company progress
          const contacts = prospects.map(p => ({
            first_name: p.first_name || '',
            last_name: p.last_name || '',
            job_title: p.job_title || '',
            title: p.job_title || '',
            pitch_type: p.pitch_type || '',
            linkedin: p.linkedin_url || '',
            priority: (p.priority || 'Medium') as 'High' | 'Medium' | 'Low',
            priority_reason: p.priority_reason || '',
          }));

          updateCompanyProgress(progress.companyId, {
            step: progress.step === 'people' ? 'complete' : progress.step,
            peopleData: {
              status: 'completed',
              company: progress.companyName,
              contacts,
            },
          });
        }
      } catch (error) {
        console.error(`Failed to load prospects for ${progress.companyName}:`, error);
      }
    }
  };

  loadExistingProspects();
}, [user?.id, updateCompanyProgress, companiesProgress]);
```

**Key Features**:
- Loads prospects from `prospect_research` table using `company_research_id`
- Converts database records to `ResearchContact` format
- Displays prospects in research cards
- Skips loading if data already exists (prevents redundant queries)

### 3. Push to Contacts Button

**File**: `src/components/research/ResearchCompanyCard.tsx`

Update component interface and add button:

```typescript
interface ResearchCompanyCardProps {
  companyProgress: CompanyResearchProgress;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getStepStatus: (stepId: string, companyStep: string) => string;
  onRetryStep?: (companyId: string, step: 'company' | 'people') => void;
  onPushToContacts?: (companyId: string, companyName: string) => void;
}
```

Add button in expanded section:

```typescript
{onPushToContacts && (step === 'complete' || (peopleData?.contacts && peopleData.contacts.length > 0)) && (
  <Button
    size="sm"
    onClick={(e) => { e.stopPropagation(); onPushToContacts(companyId, companyName); }}
    className="text-xs"
  >
    <Upload className="w-3 h-3 mr-1" />
    Push to Contacts
  </Button>
)}
```

**Button Behavior**:
- Shows when research is complete OR prospects are found
- Pushes all prospects for that company to main contacts list
- Shows success toast with count of added contacts

### 4. Push Prospects Implementation

**File**: `src/pages/ResearchProgress.tsx`

Implement the `pushProspectsToContacts` function:

```typescript
const pushProspectsToContacts = async (
  companyId: string,
  companyName: string,
  userId: string,
  selectedCampaignId: string | undefined,
  companiesProgress: any[],
  addContacts: (contacts: Contact[]) => void
) => {
  try {
    // Find company's research data
    const companyProgress = companiesProgress.find(p => p.companyId === companyId);
    if (!companyProgress || !companyProgress.company_research_id) {
      toast.error('Company research data not found');
      return;
    }

    // Fetch prospects from database
    const { data: prospects, error } = await supabase
      .from('prospect_research')
      .select('*')
      .eq('company_research_id', companyProgress.company_research_id)
      .eq('user_id', userId);

    if (error) throw error;

    if (!prospects || prospects.length === 0) {
      toast.info('No prospects found for this company');
      return;
    }

    // Transform to Contact format
    const newContacts: Contact[] = prospects.map(p => ({
      id: p.id,
      campaign_id: selectedCampaignId || '',
      company_id: companyId,
      company_name: companyName,
      name: `${p.first_name} ${p.last_name}`.trim(),
      title: p.job_title || undefined,
      email: p.email || undefined,
      phone: p.phone || undefined,
      linkedin_url: p.linkedin_url || undefined,
      priority: (p.priority || 'low') as 'high' | 'medium' | 'low',
      selected: false,
    }));

    // Add to contacts store
    addContacts(newContacts);
    toast.success(`Added ${newContacts.length} contacts from ${companyName}`);
  } catch (error: any) {
    console.error('Error pushing prospects to contacts:', error);
    toast.error(`Failed to push contacts: ${error.message}`);
  }
};
```

**Process**:
1. Find company research record by `company_research_id`
2. Fetch all prospects linked to that company from `prospect_research` table
3. Transform database records to Contact format
4. Add to main contacts list via `addContacts()` store method

### 5. Store Enhancement

**File**: `src/stores/appStore.ts`

Add `addContacts` method to Zustand store:

```typescript
// In AppState interface:
addContacts: (contacts: Contact[]) => void;

// In store implementation:
addContacts: (newContacts) => set((state) => ({
  contacts: [...state.contacts, ...newContacts],
})),
```

**Purpose**:
- Allows appending new contacts without replacing existing ones
- Used by push to contacts functionality

## User Flow

1. **Start Research** → User selects companies and starts research
2. **Research Completes** → Prospects are saved to `prospect_research` table
3. **Navigate Away** → Research state is persisted to localStorage
4. **Return to Page** → Research state is restored, prospects are loaded from database and displayed
5. **Push to Contacts** → User clicks button, prospects are added to main contacts list
6. **View Results** → Navigate to Results page to see all researched prospects

## Database Tables Used

- `prospect_research`: Stores individual prospects with fields:
  - `id`: UUID
  - `company_research_id`: Links to company research
  - `user_id`: User who owns the research
  - `first_name`, `last_name`: Contact name
  - `job_title`: Title at company
  - `email`, `phone`, `linkedin_url`: Contact info
  - `priority`: High/Medium/Low
  - `priority_reason`: Why this contact is prioritized
  - `pitch_type`: Type of pitch
  - `created_at`: Timestamp

- `company_research`: Stores company research data
  - `id`: UUID
  - `user_id`: User who owns the research
  - `company_domain`: Company domain
  - `company_name`: Company name
  - `company_status`: Operating/Acquired/Bankrupt/Not_Found
  - `created_at`: Timestamp

## Testing Checklist

- [ ] Research state is saved to localStorage when navigating away
- [ ] Research state is restored when returning to the page
- [ ] Prospects from database appear in research cards
- [ ] Prospect details display correctly (name, title, priority, etc.)
- [ ] "Push to Contacts" button appears when research is complete
- [ ] Clicking button adds prospects to main contacts list
- [ ] Success toast shows correct count
- [ ] Prospects appear on Results page after pushing

## Files Modified

1. `src/pages/ResearchProgress.tsx` - Added persistence, loading, and push to contacts
2. `src/components/research/ResearchCompanyCard.tsx` - Added push button
3. `src/stores/appStore.ts` - Added `addContacts` method

## Future Enhancements

- Bulk push all companies' contacts at once
- Ability to select specific prospects before pushing
- Deduplicate contacts before adding to main list
- Show enrichment status (email found, etc.) in research cards
