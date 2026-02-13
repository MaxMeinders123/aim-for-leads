# Lovable Prompt: Research Quality Analytics Dashboard

## Context

We have a `research_feedback` table in Supabase that logs when users mark prospects as "wrong contact" or "confirmed working". We need a UI to view these statistics and track AI research quality.

## Database Schema

```sql
CREATE TABLE public.research_feedback (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  prospect_research_id UUID, -- links to prospect
  company_research_id UUID,  -- links to company
  campaign_id UUID,           -- links to campaign
  feedback_type TEXT NOT NULL, -- 'not_working' or 'confirmed_working'
  prospect_name TEXT,
  prospect_title TEXT,
  company_name TEXT,
  company_domain TEXT,
  linkedin_url TEXT,
  notes TEXT,
  created_at TIMESTAMP
);
```

## Statistics to Display

### Overall Metrics
```typescript
// Query all feedback for current user
const { data: allFeedback } = await supabase
  .from('research_feedback')
  .select('*')
  .eq('user_id', userId);

// Calculate:
const totalVerified = allFeedback.length;
const wrongContacts = allFeedback.filter(f => f.feedback_type === 'not_working').length;
const correctContacts = allFeedback.filter(f => f.feedback_type === 'confirmed_working').length;
const accuracyRate = (correctContacts / totalVerified * 100).toFixed(1);
```

### Campaign-Level Breakdown
```typescript
// Group by campaign
const campaignStats = allFeedback.reduce((acc, f) => {
  const campaignId = f.campaign_id || 'unknown';
  if (!acc[campaignId]) {
    acc[campaignId] = { correct: 0, wrong: 0 };
  }
  if (f.feedback_type === 'confirmed_working') acc[campaignId].correct++;
  if (f.feedback_type === 'not_working') acc[campaignId].wrong++;
  return acc;
}, {});
```

### Recent Feedback (Last 7 Days)
```typescript
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const { data: recentFeedback } = await supabase
  .from('research_feedback')
  .select('*')
  .eq('user_id', userId)
  .gte('created_at', sevenDaysAgo.toISOString())
  .order('created_at', { ascending: false });
```

---

## LOVABLE PROMPT

Create a new page at `/analytics` (route: `/analytics`) that displays research quality statistics.

**Requirements:**

1. **Page Header:**
   - Title: "Research Quality Analytics"
   - Subtitle: "Track AI research accuracy and feedback"
   - Back button to `/campaigns`

2. **Overall Stats Cards (4 cards in a row):**
   - **Total Verified**: Count of all feedback entries (blue icon)
   - **Accuracy Rate**: Percentage of confirmed_working vs total (green icon, show as "X%")
   - **Wrong Contacts**: Count of 'not_working' feedback (red icon)
   - **Correct Contacts**: Count of 'confirmed_working' feedback (green icon)

3. **Campaign Breakdown Section:**
   - Title: "Accuracy by Campaign"
   - For each campaign with feedback, show:
     - Campaign name
     - Progress bar showing correct (green) vs wrong (red) ratio
     - Numbers: "X correct / Y wrong (Z% accuracy)"
   - Sort by most recent feedback first

4. **Recent Feedback Table:**
   - Title: "Recent Feedback (Last 7 Days)"
   - Columns:
     - Date (formatted as "Feb 13, 2026 2:30 PM")
     - Prospect Name
     - Title
     - Company
     - Feedback Type (badge: green for "Correct" / red for "Wrong")
     - LinkedIn URL (link with external icon)
   - Show latest 20 entries
   - Empty state: "No feedback yet — verify prospects in the Contacts page to see data here"

5. **Query Pattern:**
   ```typescript
   // Fetch all feedback for current user
   const { data: feedback } = await supabase
     .from('research_feedback')
     .select('*, campaigns(name)')
     .eq('user_id', user.id)
     .order('created_at', { ascending: false });
   ```

6. **Tech Stack:**
   - Use existing components: `AppLayout`, `PageHeader`, `Badge`, `Skeleton`
   - Use Lucide icons: `BarChart3`, `CheckCircle2`, `XCircle`, `TrendingUp`
   - Use shadcn/ui components (Card, Table, Progress)
   - Use Supabase realtime subscription for live updates
   - Use the same styling patterns as ContactsView.tsx

7. **Navigation:**
   - Add "Analytics" link to the main navigation menu

8. **Error Handling:**
   - Wrap page in `PageErrorBoundary`
   - Show loading skeletons while fetching
   - Handle empty states gracefully

**Style Notes:**
- Use the same color scheme as the rest of the app
- Cards should have hover effects
- Progress bars should be animated
- Make it responsive (mobile-friendly)

**Additional Features (Nice to Have):**
- Filter by date range (Last 7 days / Last 30 days / All time)
- Export feedback to CSV
- Chart showing accuracy trend over time (use recharts library)

---

## Example Code Structure

```tsx
// /src/pages/Analytics.tsx
import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';

interface FeedbackStats {
  totalVerified: number;
  wrongContacts: number;
  correctContacts: number;
  accuracyRate: number;
}

export function Analytics() {
  const { user } = useAppStore();
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, [user?.id]);

  const loadFeedback = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('research_feedback')
      .select('*, campaigns(name)')
      .eq('user_id', user.id);

    // Calculate stats...
    setStats({
      totalVerified: data?.length || 0,
      wrongContacts: data?.filter(f => f.feedback_type === 'not_working').length || 0,
      correctContacts: data?.filter(f => f.feedback_type === 'confirmed_working').length || 0,
      accuracyRate: // calculate percentage
    });

    setIsLoading(false);
  };

  return (
    <AppLayout>
      <PageHeader title="Research Quality Analytics" />
      {/* Stats cards, campaign breakdown, recent feedback table */}
    </AppLayout>
  );
}
```

---

## File Locations to Reference

- **Similar page structure**: `/src/pages/ContactsView.tsx`
- **API patterns**: `/src/services/api.ts`
- **Store**: `/src/stores/appStore.ts`
- **Supabase client**: `/src/integrations/supabase/client.ts`

---

## Summary

This prompt will create a comprehensive analytics dashboard that:
✅ Shows overall AI research accuracy
✅ Breaks down performance by campaign
✅ Displays recent feedback for review
✅ Uses existing Supabase data (no backend changes needed)
✅ Follows the app's design patterns
✅ Provides actionable insights for improving AI research quality
