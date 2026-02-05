import { create } from 'zustand';

export interface Campaign {
  id: string;
  name: string;
  target_region?: string;
  product?: string;
  product_category?: string;
  technical_focus?: string;
  job_titles?: string;
  personas?: string;
  target_verticals?: string;
  primary_angle?: string;
  secondary_angle?: string;
  pain_points?: string;
  companies_count: number;
  contacts_count: number;
  created_at: string;
}

export interface Company {
  id: string;
  campaign_id: string;
  name: string;
  website?: string;
  linkedin_url?: string;
  selected?: boolean;
}

export interface Contact {
  id: string;
  campaign_id: string;
  company_id?: string;
  company_name?: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  priority: 'high' | 'medium' | 'low';
  selected?: boolean;
}

export interface UserIntegrations {
  company_research_webhook_url?: string;
  people_research_webhook_url?: string;
  clay_webhook_url?: string;
  salesforce_webhook_url?: string;
  salesforce_import_webhook_url?: string;
  // Keep legacy field for backwards compatibility
  n8n_webhook_url?: string;
  dark_mode: boolean;
  sound_effects: boolean;
}

export interface CampaignDraft {
  name: string;
  target_region: string;
  product: string;
  product_category: string;
  technical_focus: string;
  job_titles: string;
  personas: string;
  target_verticals: string;
  primary_angle: string;
  secondary_angle: string;
  pain_points: string;
}

// Company research result from first webhook
export interface CompanyResearchResult {
  status: string;
  company: string;
  company_status: 'Operating' | 'Acquired' | 'Renamed' | 'Bankrupt' | 'Not_Found';
  acquiredBy?: string;
  effectiveDate?: string;
  cloud_preference?: {
    provider: string;
    confidence: number;
    evidence_urls: string[];
  };
}

// Contact from people research webhook
export interface ResearchContact {
  first_name: string;
  last_name: string;
  job_title: string;
  title: string;
  pitch_type: string;
  linkedin: string;
  priority: 'High' | 'Medium' | 'Low';
  priority_reason: string;
}

// People research result from second webhook
export interface PeopleResearchResult {
  status: string;
  company: string;
  contacts: ResearchContact[];
}

export interface CompanyResearchProgress {
  companyId: string;
  companyName: string;
  step: 'company' | 'people' | 'awaiting_callback' | 'clay' | 'complete' | 'error';
  companyData?: CompanyResearchResult;
  peopleData?: PeopleResearchResult;
  error?: string;
  company_research_id?: string; // UUID from Supabase company_research table
}

export interface ResearchProgress {
  isRunning: boolean;
  currentCompanyIndex: number;
  totalCompanies: number;
  currentCompany: string;
  currentStep: 'company' | 'people' | 'clay';
  companiesProgress: CompanyResearchProgress[];
}

interface AppState {
  // User
  user: { id: string; name: string; email: string } | null;
  setUser: (user: { id: string; name: string; email: string } | null) => void;

  // Campaigns
  campaigns: Campaign[];
  setCampaigns: (campaigns: Campaign[]) => void;
  selectedCampaign: Campaign | null;
  setSelectedCampaign: (campaign: Campaign | null) => void;

  // Campaign Draft (for new campaign creation)
  campaignDraft: CampaignDraft;
  setCampaignDraft: (draft: Partial<CampaignDraft>) => void;
  resetCampaignDraft: () => void;

  // Campaign Setup Step
  campaignStep: number;
  setCampaignStep: (step: number) => void;

  // Companies
  companies: Company[];
  setCompanies: (companies: Company[]) => void;
  toggleCompanySelection: (id: string) => void;
  selectAllCompanies: () => void;
  deselectAllCompanies: () => void;

  // Contacts
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  addContacts: (contacts: Contact[]) => void;
  toggleContactSelection: (id: string) => void;
  selectAllContacts: () => void;
  deselectAllContacts: () => void;

  // Research Progress
  researchProgress: ResearchProgress;
  setResearchProgress: (progress: Partial<ResearchProgress>) => void;
  updateCompanyProgress: (companyId: string, update: Partial<CompanyResearchProgress>) => void;
  resetResearchProgress: () => void;

  // User Integrations
  integrations: UserIntegrations;
  setIntegrations: (integrations: Partial<UserIntegrations>) => void;

  // Salesforce search
  salesforceListId: string;
  setSalesforceListId: (id: string) => void;
  salesforceResult: { name: string; companyCount: number; lastUpdated?: string } | null;
  setSalesforceResult: (result: { name: string; companyCount: number; lastUpdated?: string } | null) => void;
}

const initialCampaignDraft: CampaignDraft = {
  name: '',
  target_region: '',
  product: '',
  product_category: '',
  technical_focus: '',
  job_titles: '',
  personas: '',
  target_verticals: '',
  primary_angle: '',
  secondary_angle: '',
  pain_points: '',
};

const initialResearchProgress: ResearchProgress = {
  isRunning: false,
  currentCompanyIndex: 0,
  totalCompanies: 0,
  currentCompany: '',
  currentStep: 'company',
  companiesProgress: [],
};

export const useAppStore = create<AppState>((set) => ({
  // User
  user: null,
  setUser: (user) => set({ user }),

  // Campaigns
  campaigns: [],
  setCampaigns: (campaigns) => set({ campaigns }),
  selectedCampaign: null,
  setSelectedCampaign: (campaign) => set({ selectedCampaign: campaign }),

  // Campaign Draft
  campaignDraft: initialCampaignDraft,
  setCampaignDraft: (draft) => set((state) => ({ 
    campaignDraft: { ...state.campaignDraft, ...draft } 
  })),
  resetCampaignDraft: () => set({ campaignDraft: initialCampaignDraft }),

  // Campaign Setup Step
  campaignStep: 0,
  setCampaignStep: (step) => set({ campaignStep: step }),

  // Companies
  companies: [],
  setCompanies: (companies) => set({ companies }),
  toggleCompanySelection: (id) => set((state) => ({
    companies: state.companies.map((c) =>
      c.id === id ? { ...c, selected: !c.selected } : c
    ),
  })),
  selectAllCompanies: () => set((state) => ({
    companies: state.companies.map((c) => ({ ...c, selected: true })),
  })),
  deselectAllCompanies: () => set((state) => ({
    companies: state.companies.map((c) => ({ ...c, selected: false })),
  })),

  // Contacts
  contacts: [],
  setContacts: (contacts) => set({ contacts }),
  addContacts: (newContacts) => set((state) => ({
    contacts: [...state.contacts, ...newContacts],
  })),
  toggleContactSelection: (id) => set((state) => ({
    contacts: state.contacts.map((c) =>
      c.id === id ? { ...c, selected: !c.selected } : c
    ),
  })),
  selectAllContacts: () => set((state) => ({
    contacts: state.contacts.map((c) => ({ ...c, selected: true })),
  })),
  deselectAllContacts: () => set((state) => ({
    contacts: state.contacts.map((c) => ({ ...c, selected: false })),
  })),

  // Research Progress
  researchProgress: initialResearchProgress,
  setResearchProgress: (progress) => set((state) => ({
    researchProgress: { ...state.researchProgress, ...progress },
  })),
  updateCompanyProgress: (companyId, update) => set((state) => ({
    researchProgress: {
      ...state.researchProgress,
      companiesProgress: state.researchProgress.companiesProgress.map((cp) =>
        cp.companyId === companyId ? { ...cp, ...update } : cp
      ),
    },
  })),
  resetResearchProgress: () => set({ researchProgress: initialResearchProgress }),

  // User Integrations
  integrations: {
    company_research_webhook_url: '',
    people_research_webhook_url: '',
    clay_webhook_url: '',
    salesforce_webhook_url: '',
    salesforce_import_webhook_url: '',
    n8n_webhook_url: '',
    dark_mode: false,
    sound_effects: true,
  },
  setIntegrations: (integrations) => set((state) => ({
    integrations: { ...state.integrations, ...integrations },
  })),

  // Salesforce search
  salesforceListId: '',
  setSalesforceListId: (id) => set({ salesforceListId: id }),
  salesforceResult: null,
  setSalesforceResult: (result) => set({ salesforceResult: result }),
}));
