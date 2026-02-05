# Scalability Recommendations for Aim for Leads

This document outlines recommendations for improving the scalability of the Aim for Leads application to handle larger amounts of campaign and contact data more efficiently.

## Current Architecture Overview

The application uses:
- **Frontend**: React with Zustand for state management
- **Backend**: Supabase (PostgreSQL database + Edge Functions)
- **External Services**: n8n webhooks for AI-powered research, Clay for contact enrichment, Salesforce integration

## Identified Scalability Concerns

### 1. Database Query Performance

**Current Issues:**
- Contacts page loads ALL company research and prospect data for a user in a single query
- No pagination implemented for large datasets
- Real-time subscriptions reload entire datasets on any change

**Recommendations:**
```typescript
// Implement cursor-based pagination
interface PaginationParams {
  limit: number;
  cursor?: string;
}

// Add indexes to frequently queried fields
CREATE INDEX idx_company_research_user_campaign ON company_research(user_id, campaign_id);
CREATE INDEX idx_prospect_research_company ON prospect_research(company_research_id);
CREATE INDEX idx_company_research_created ON company_research(created_at DESC);

// Use incremental loading instead of loading all data at once
const loadCompaniesPage = async (cursor?: string, limit = 20) => {
  let query = supabase
    .from('company_research')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  return query;
};
```

### 2. Real-time Subscriptions

**Current Issues:**
- Subscriptions reload entire datasets on ANY change (INSERT, UPDATE, DELETE)
- No filtering to only refresh affected records

**Recommendations:**
```typescript
// Use more granular subscriptions that only update affected records
const channel = supabase
  .channel('contacts-realtime')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'company_research',
      filter: `user_id=eq.${user.id}`,
    },
    (payload) => {
      // Add new record to state instead of reloading everything
      setCompanies(prev => [payload.new, ...prev]);
    }
  )
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'prospect_research',
      filter: `user_id=eq.${user.id}`,
    },
    (payload) => {
      // Update specific record in state
      updateProspectInState(payload.new);
    }
  )
  .subscribe();
```

### 3. Webhook Timeout Handling

**Current Issues:**
- 20-minute timeout for research webhooks may not scale well for large batches
- No retry mechanism for failed webhook calls
- Silent failures in async webhook triggers

**Recommendations:**
```typescript
// Implement a job queue system for long-running research tasks
// Consider using:
// - Supabase pg_cron for scheduled retries
// - Redis/Bull for job queuing
// - n8n's built-in retry mechanisms

// Add exponential backoff for webhook retries
const retryWithBackoff = async (fn: () => Promise<any>, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
};

// Add status tracking table for research jobs
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  campaign_id UUID REFERENCES campaigns(id),
  company_domain TEXT NOT NULL,
  status TEXT NOT NULL, -- 'queued', 'processing', 'completed', 'failed'
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Data Denormalization

**Current Issues:**
- Campaign metrics (companies_count, contacts_count) may become stale
- No automated triggers to update counts

**Recommendations:**
```sql
-- Add database triggers to automatically update campaign counts
CREATE OR REPLACE FUNCTION update_campaign_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE campaigns
    SET companies_count = (
      SELECT COUNT(DISTINCT company_id)
      FROM companies
      WHERE campaign_id = NEW.campaign_id
    ),
    contacts_count = (
      SELECT COUNT(*)
      FROM contacts
      WHERE campaign_id = NEW.campaign_id
    )
    WHERE id = NEW.campaign_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE campaigns
    SET companies_count = (
      SELECT COUNT(DISTINCT company_id)
      FROM companies
      WHERE campaign_id = OLD.campaign_id
    ),
    contacts_count = (
      SELECT COUNT(*)
      FROM contacts
      WHERE campaign_id = OLD.campaign_id
    )
    WHERE id = OLD.campaign_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_count_trigger
AFTER INSERT OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION update_campaign_counts();

CREATE TRIGGER contacts_count_trigger
AFTER INSERT OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_campaign_counts();
```

### 5. Caching Strategy

**Current Issues:**
- No caching layer for frequently accessed data
- Campaign list reloaded on every page visit

**Recommendations:**
```typescript
// Implement React Query for automatic caching and invalidation
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const useCampaigns = () => {
  return useQuery({
    queryKey: ['campaigns', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Or use SWR for automatic revalidation
import useSWR from 'swr';

const useCampaigns = () => {
  return useSWR(
    ['campaigns', user?.id],
    async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      return data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  );
};
```

### 6. Batch Operations

**Current Issues:**
- Individual API calls for each company research
- No batching for multiple companies in same campaign

**Recommendations:**
```typescript
// Implement batch processing for research jobs
interface BatchResearchRequest {
  campaign_id: string;
  companies: Company[];
}

// Create a new edge function: batch-research
const batchResearch = async (request: BatchResearchRequest) => {
  const batchSize = 10; // Process 10 companies at a time
  const batches = chunk(request.companies, batchSize);

  for (const batch of batches) {
    const promises = batch.map(company =>
      triggerCompanyResearch(company, request.campaign_id)
    );

    // Wait for batch to complete before starting next batch
    await Promise.allSettled(promises);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};
```

### 7. Search and Filtering Optimization

**Current Issues:**
- Client-side filtering for all data
- No full-text search capabilities

**Recommendations:**
```sql
-- Add full-text search indexes
ALTER TABLE company_research ADD COLUMN search_vector tsvector;

CREATE INDEX idx_company_research_search ON company_research USING GIN(search_vector);

-- Create trigger to update search vector
CREATE OR REPLACE FUNCTION update_company_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.company_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.company_domain, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER company_search_vector_trigger
BEFORE INSERT OR UPDATE ON company_research
FOR EACH ROW EXECUTE FUNCTION update_company_search_vector();
```

```typescript
// Use server-side search instead of client-side filtering
const searchCompanies = async (searchTerm: string) => {
  const { data } = await supabase
    .from('company_research')
    .select('*')
    .textSearch('search_vector', searchTerm)
    .limit(50);
  return data;
};
```

### 8. Archive Strategy

**Current Issues:**
- No data archival for old campaigns
- All historical data loaded every time

**Recommendations:**
```sql
-- Add archival status to campaigns
ALTER TABLE campaigns ADD COLUMN archived BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN archived_at TIMESTAMPTZ;

-- Create archived data table for long-term storage
CREATE TABLE archived_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_data JSONB NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

-- Add index for active campaigns query
CREATE INDEX idx_campaigns_active ON campaigns(user_id, archived) WHERE archived = FALSE;
```

```typescript
// Only load active campaigns by default
const loadActiveCampaigns = async () => {
  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: false });
  return data;
};
```

## Implementation Priority

1. **High Priority** (Immediate Impact):
   - Add database indexes for common queries
   - Implement pagination for Contacts page
   - Add proper error logging for webhook failures

2. **Medium Priority** (Within 2-4 weeks):
   - Implement React Query or SWR for caching
   - Add full-text search capabilities
   - Implement batch operations for research

3. **Low Priority** (Long-term):
   - Implement job queue system
   - Add campaign archival functionality
   - Set up monitoring and performance tracking

## Monitoring Recommendations

```typescript
// Add performance monitoring
import { performance } from 'perf_hooks';

const measureQueryPerformance = async (queryName: string, queryFn: () => Promise<any>) => {
  const start = performance.now();
  try {
    const result = await queryFn();
    const duration = performance.now() - start;

    // Log slow queries (>1 second)
    if (duration > 1000) {
      console.warn(`Slow query detected: ${queryName} took ${duration}ms`);
    }

    return result;
  } catch (error) {
    console.error(`Query failed: ${queryName}`, error);
    throw error;
  }
};
```

## Database Connection Pooling

For high-scale usage, consider:
- Supabase's connection pooler (PgBouncer)
- Optimizing connection pool settings
- Using prepared statements for frequently executed queries

## Conclusion

These recommendations should be implemented gradually, starting with high-priority items. Regular performance testing and monitoring should be conducted to measure the impact of each optimization.

**Code Impact**: Most of these recommendations involve:
- Database schema changes (indexes, triggers)
- Query optimization (pagination, filtering)
- Architecture improvements (caching, batching)

**No immediate code implementation** is required for this document - it serves as a guide for future development iterations.
