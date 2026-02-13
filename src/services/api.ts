import { supabase } from '@/integrations/supabase/client';
import type { Campaign, Company, UserIntegrations } from '@/stores/appStore';

// =============================================================================
// Supabase API helpers
// =============================================================================

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// =============================================================================
// Campaign CRUD
// =============================================================================

export async function fetchCampaigns() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCampaign(userId: string, draft: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...draft, user_id: userId, name: draft.name as string })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCampaign(campaignId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', campaignId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCampaign(campaignId: string) {
  const { data, error } = await supabase.functions.invoke('delete-campaign', {
    body: { campaign_id: campaignId },
  });
  if (error) throw error;
  return data;
}

// =============================================================================
// Company CRUD
// =============================================================================

export async function fetchCompanies(campaignId: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addManualCompany(
  userId: string,
  campaignId: string,
  company: { name: string; website?: string; linkedin_url?: string },
) {
  const { data, error } = await supabase
    .from('companies')
    .insert({
      user_id: userId,
      campaign_id: campaignId,
      name: company.name,
      website: company.website || null,
      linkedin_url: company.linkedin_url || null,
      status: 'imported',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompany(companyId: string) {
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', companyId);
  if (error) throw error;
}

export async function deleteMultipleCompanies(companyIds: string[]) {
  const { error } = await supabase
    .from('companies')
    .delete()
    .in('id', companyIds);
  if (error) throw error;
}

export async function importSalesforceCompanies(
  userId: string,
  campaignId: string,
  salesforceCampaignId: string,
) {
  const { data, error } = await supabase.functions.invoke('import-salesforce-campaign', {
    body: {
      salesforce_campaign_id: salesforceCampaignId,
      campaign_id: campaignId,
      user_id: userId,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// =============================================================================
// User Integrations (webhook URLs)
// =============================================================================

export async function fetchUserIntegrations(userId: string): Promise<Partial<UserIntegrations>> {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('dark_mode, sound_effects, clay_webhook_url, company_research_webhook_url, people_research_webhook_url, salesforce_import_webhook_url')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return {
    dark_mode: data?.dark_mode ?? false,
    sound_effects: data?.sound_effects ?? true,
    clay_webhook_url: data?.clay_webhook_url ?? undefined,
    company_research_webhook_url: data?.company_research_webhook_url ?? undefined,
    people_research_webhook_url: data?.people_research_webhook_url ?? undefined,
    salesforce_import_webhook_url: data?.salesforce_import_webhook_url ?? undefined,
  };
}

export async function updateUserIntegrations(
  userId: string,
  updates: Partial<Pick<UserIntegrations, 'clay_webhook_url' | 'company_research_webhook_url' | 'people_research_webhook_url' | 'salesforce_import_webhook_url'>>,
) {
  const { data, error } = await supabase
    .from('user_integrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function testWebhook(url: string): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('test-webhook', {
    body: { url },
  });
  if (error) {
    return { success: false, message: error.message || 'Test failed' };
  }
  return { success: data?.success ?? false, message: data?.message ?? 'Unknown result' };
}

// =============================================================================
// Research proxy (calls n8n via edge function — webhook resolved server-side)
// =============================================================================

export async function callResearchProxy(webhookType: string, payload: unknown) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 min

  try {
    const accessToken = await getAuthToken();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/research-proxy`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          Authorization: `Bearer ${accessToken ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ webhook_type: webhookType, payload }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out (20 min limit)');
    }
    throw error;
  }
}

// =============================================================================
// Research payload builders
// =============================================================================

function parseToArray(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildCampaignContext(campaign: Campaign | null) {
  return {
    campaignName: campaign?.name ?? '',
    product: campaign?.product ?? '',
    productCategory: campaign?.product_category ?? '',
    primaryAngle: campaign?.primary_angle ?? '',
    secondaryAngle: campaign?.secondary_angle ?? '',
    targetRegion: campaign?.target_region ?? '',
    painPoints: parseToArray(campaign?.pain_points),
    targetPersonas: parseToArray(campaign?.personas),
    targetTitles: parseToArray(campaign?.job_titles),
    targetVerticals: parseToArray(campaign?.target_verticals),
    techFocus: campaign?.technical_focus ?? '',
  };
}

export function buildCompanyResearchPayload(campaign: Campaign | null, company: Company, userId: string) {
  return {
    user_id: userId,
    campaign_id: campaign?.id ?? null,
    salesforce_account_id: company.salesforce_account_id ?? null,
    company_domain:
      company.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
      company.name.toLowerCase().replace(/\s+/g, ''),
    campaign: buildCampaignContext(campaign),
    company: {
      name: company.name,
      website: company.website ?? '',
      linkedin: company.linkedin_url ?? '',
    },
  };
}

export function buildProspectResearchPayload(
  campaign: Campaign | null,
  company: Company,
  companyData: unknown,
  userId: string,
  companyResearchId?: string,
) {
  return {
    user_id: userId,
    campaign_id: campaign?.id ?? null,
    salesforce_account_id: company.salesforce_account_id ?? null,
    company_domain:
      company.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
      company.name.toLowerCase().replace(/\s+/g, ''),
    company_research_id: companyResearchId,
    campaign: buildCampaignContext(campaign),
    company: {
      name: company.name,
      website: company.website ?? '',
      linkedin: company.linkedin_url ?? '',
    },
    companyResearch: companyData ?? null,
    qualify: true,
  };
}

// =============================================================================
// Parse AI response from n8n
// =============================================================================

export function parseAIResponse(responseData: unknown): unknown {
  try {
    const data = responseData as Record<string, unknown>;

    if (
      data?.output &&
      Array.isArray(data.output) &&
      (data.output[0] as Record<string, unknown>)?.content
    ) {
      const content = (data.output[0] as Record<string, unknown>).content as Array<Record<string, unknown>>;
      if (content?.[0]?.text) {
        let text = content[0].text as string;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) text = jsonMatch[1].trim();
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }
    }

    if (Array.isArray(responseData) && responseData.length > 0) {
      if ((responseData[0] as Record<string, unknown>)?.output) {
        return parseAIResponse(responseData[0]);
      }
      return parseAIResponse(responseData[0]);
    }

    if (typeof data === 'object' && data !== null) {
      if (data.status || data.company_status || data.contacts) return data;
    }

    if (typeof responseData === 'string') {
      const jsonMatch = (responseData as string).match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
      return JSON.parse(responseData as string);
    }

    return responseData;
  } catch {
    return null;
  }
}

// =============================================================================
// Clay integration
// =============================================================================

export async function sendProspectToClay(prospectId: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('send-prospect-to-clay', {
    body: { prospect_ids: [prospectId], user_id: userId },
  });
  if (error) throw error;
  return data;
}

export async function sendBulkToClay(prospectIds: string[], userId: string) {
  const { data, error } = await supabase.functions.invoke('send-prospect-to-clay', {
    body: { prospect_ids: prospectIds, user_id: userId },
  });
  if (error) throw error;
  return data;
}

// =============================================================================
// Clay payload preview (for testing)
// =============================================================================

export async function testClayPayload(userId: string, prospectId?: string) {
  const { data, error } = await supabase.functions.invoke('test-clay-payload', {
    body: { user_id: userId, prospect_id: prospectId },
  });
  if (error) throw error;
  return data;
}

// =============================================================================
// Company research results
// =============================================================================

export async function fetchCompanyResearch(campaignId: string, userId: string) {
  const { data, error } = await supabase
    .from('company_research')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchProspectResearch(companyResearchIds: string[]) {
  if (companyResearchIds.length === 0) return [];
  const { data, error } = await supabase
    .from('prospect_research')
    .select('*')
    .in('company_research_id', companyResearchIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// =============================================================================
// CSV Export
// =============================================================================

// =============================================================================
// Add prospect to Salesforce Campaign via n8n webhook
// =============================================================================

export async function addProspectToSalesforceCampaign(
  webhookUrl: string,
  payload: {
    personal_id: string;
    session_id: string | null;
    salesforce_contact_id: string;
    salesforce_campaign_id: string;
    prospect_name: string;
    prospect_title: string | null;
    company_name: string | null;
    linkedin_url: string | null;
    email: string | null;
    phone: string | null;
  }
) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Failed to add to Salesforce campaign');
  }

  return { success: true, data: result };
}

// =============================================================================
// CSV Export
// =============================================================================

export function exportProspectsToCSV(
  prospects: Array<{
    first_name?: string | null;
    last_name?: string | null;
    job_title?: string | null;
    linkedin_url?: string | null;
    email?: string | null;
    phone?: string | null;
    priority?: string | null;
    company_name?: string;
  }>,
  filename: string,
) {
  const headers = ['First Name', 'Last Name', 'Job Title', 'Company', 'LinkedIn', 'Email', 'Phone', 'Priority'];
  const rows = prospects.map((p) => [
    p.first_name ?? '',
    p.last_name ?? '',
    p.job_title ?? '',
    p.company_name ?? '',
    p.linkedin_url ?? '',
    p.email ?? '',
    p.phone ?? '',
    p.priority ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))].join(
    '\n',
  );

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
