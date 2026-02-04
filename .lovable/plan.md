

# Plan: Unified Contacts Page with Company-Based Research Display

## Overview

This plan consolidates the research workflow and contacts view into a single, unified "Contacts" page. Companies become the primary organizational unit, with their prospects (research results) displayed inline. Users can view all companies, see their research status, view prospects, and send them to Clay - all from one screen.

## Current State Analysis

**Problem Areas:**
1. Companies from `company_research` table are not being loaded/displayed in the main contacts view
2. The "Contacts" page (`Results.tsx`) only shows manually pushed contacts from the in-memory store
3. Research data lives in the database (`company_research` + `prospect_research`) but the UI doesn't fetch it
4. Multiple pages for research progress, results, and contacts create confusion

**Existing Assets:**
- `CompanyProspectCard` component - already groups prospects by company with Send to Clay functionality
- `ProspectTable` component - displays prospects with status badges and Clay integration
- `StatusBadge` component - shows prospect status (Pending, Sent, Inputted, Duplicate)
- Database tables have all necessary columns (`company_research`, `prospect_research`)

## Solution Architecture

```text
+------------------+
|   Contacts Page  |
+------------------+
        |
        v
+------------------+      +-----------------------+
|  Load companies  | ---> | company_research      |
|  from database   |      | (grouped by user)     |
+------------------+      +-----------------------+
        |
        v
+------------------+      +-----------------------+
|  For each        | ---> | prospect_research     |
|  company, load   |      | (linked via           |
|  its prospects   |      |  company_research_id) |
+------------------+      +-----------------------+
        |
        v
+------------------+
|  Display using   |
|  CompanyProspect |
|  Card component  |
+------------------+
```

## Implementation Steps

### Step 1: Create New Unified Contacts Page

**File:** `src/pages/Contacts.tsx` (new file)

This page will:
- Fetch all `company_research` records for the logged-in user from Supabase
- For each company, fetch associated `prospect_research` records
- Display companies using the existing `CompanyProspectCard` component
- Include real-time subscriptions to update when new research completes
- Add filters (by status, by date, search by company name)

Key features:
- Header with stats (total companies, total prospects, pending count)
- Search/filter bar
- List of company cards, each expandable to show prospects
- "Start Research" button to add new companies (links to existing flow)

### Step 2: Update App Router

**File:** `src/App.tsx`

Changes:
- Import the new `Contacts` page
- Update the `/contacts` route to use the new unified component
- Keep `/results` as an alias or remove it

### Step 3: Adapt CompanyProspectCard for Database-First Display

**File:** `src/components/research/CompanyProspectCard.tsx`

Minor updates:
- Ensure it handles the data shape from `company_research` table
- Add company research status indicator (completed, processing, failed)
- Show "Add Company" button in empty state

### Step 4: Update Navigation Sidebar

**File:** `src/components/AppSidebar.tsx`

Changes:
- Ensure "Contacts" links to the new unified page
- Consider renaming to "Companies & Contacts" or keeping as "Contacts"
- Update active state detection

### Step 5: Add Real-time Subscriptions

The new Contacts page will subscribe to:
- `company_research` table for the current user
- `prospect_research` table linked to user's companies

This ensures live updates when research completes in the background.

## Technical Details

### Database Queries

**Load Companies with Research:**
```typescript
const { data: companies } = await supabase
  .from('company_research')
  .select('*')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false });
```

**Load Prospects for a Company:**
```typescript
const { data: prospects } = await supabase
  .from('prospect_research')
  .select('*')
  .eq('company_research_id', companyId)
  .order('created_at', { ascending: false });
```

### Component Structure

```text
Contacts.tsx
├── Header (title, stats, actions)
├── Filters (search, status dropdown)
├── Company List
│   └── CompanyProspectCard (for each company)
│       ├── Company header (name, domain, status, prospect count)
│       └── Expandable prospect list
│           └── ProspectRow (name, title, status, Clay button)
└── Empty State (when no companies researched)
```

### Real-time Setup

```typescript
useEffect(() => {
  const channel = supabase
    .channel('contacts-realtime')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'company_research',
      filter: `user_id=eq.${user.id}`,
    }, handleCompanyUpdate)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'prospect_research',
      filter: `user_id=eq.${user.id}`,
    }, handleProspectUpdate)
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [user?.id]);
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/Contacts.tsx` | Create | New unified contacts page |
| `src/App.tsx` | Modify | Update routes |
| `src/components/AppSidebar.tsx` | Modify | Update navigation (optional) |
| `src/components/research/CompanyProspectCard.tsx` | Modify | Adapt for database-first use |

## Migration Notes

- The existing `Results.tsx` can be kept for backward compatibility or removed
- Research progress page (`ResearchProgress.tsx`) remains for active research sessions
- Data in `company_research` and `prospect_research` will be the source of truth
- No database schema changes required - existing tables support this design

## User Experience Flow

1. User navigates to **Contacts** in sidebar
2. Sees all researched companies in a list, most recent first
3. Each company card shows:
   - Company name and domain
   - Research status (completed/processing/failed)
   - Number of prospects found
   - Expandable arrow
4. Clicking a company expands to show prospects
5. Each prospect shows:
   - Name and job title
   - Status badge (Pending, Sent to Clay, Inputted, Duplicate)
   - LinkedIn link
   - "Send to Clay" button (if pending)
   - Salesforce link (if inputted)
6. User can filter by search term or status
7. "Start New Research" button leads to the research flow

