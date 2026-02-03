import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Folder } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { CampaignSteps } from '@/components/CampaignSteps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const productCategories = [
  'IT Infrastructure',
  'Cloud Services',
  'Security',
  'Data & Analytics',
  'Software Development',
  'Consulting',
];

export default function CampaignSetup() {
  const navigate = useNavigate();
  const {
    campaigns,
    setCampaigns,
    selectedCampaign,
    setSelectedCampaign,
    campaignDraft,
    setCampaignDraft,
    resetCampaignDraft,
    campaignStep,
    setCampaignStep,
    user,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);

  // Load campaigns on mount
  useEffect(() => {
    const loadCampaigns = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load campaigns');
        return;
      }

      setCampaigns(data || []);
    };

    loadCampaigns();
  }, [setCampaigns]);

  const handleCampaignSelect = (campaign: typeof campaigns[0]) => {
    setSelectedCampaign(campaign);
    resetCampaignDraft();
  };

  const handleNewCampaignName = (name: string) => {
    setCampaignDraft({ name });
    setSelectedCampaign(null);
  };

  const handleBack = () => {
    if (campaignStep === 0) {
      navigate('/');
    } else {
      setCampaignStep(campaignStep - 1);
    }
  };

  const handleNext = async () => {
    if (campaignStep === 0) {
      if (selectedCampaign) {
        // Continue with existing campaign
        navigate('/add-companies');
        return;
      }
      if (!campaignDraft.name.trim()) {
        toast.error('Please enter a campaign name');
        return;
      }
      setCampaignStep(1);
    } else if (campaignStep === 1) {
      if (!campaignDraft.product.trim() || !campaignDraft.target_region.trim()) {
        toast.error('Please fill in required fields');
        return;
      }
      setCampaignStep(2);
    } else if (campaignStep === 2) {
      if (!campaignDraft.job_titles.trim()) {
        toast.error('Please enter job titles');
        return;
      }
      setCampaignStep(3);
    } else if (campaignStep === 3) {
      if (!campaignDraft.primary_angle.trim()) {
        toast.error('Please enter a primary angle');
        return;
      }
      // Create campaign
      await createCampaign();
    }
  };

  const createCampaign = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: campaignDraft.name,
          target_region: campaignDraft.target_region,
          product: campaignDraft.product,
          product_category: campaignDraft.product_category,
          technical_focus: campaignDraft.technical_focus,
          job_titles: campaignDraft.job_titles,
          personas: campaignDraft.personas,
          target_verticals: campaignDraft.target_verticals,
          primary_angle: campaignDraft.primary_angle,
          secondary_angle: campaignDraft.secondary_angle,
          pain_points: campaignDraft.pain_points,
        })
        .select()
        .single();

      if (error) throw error;

      setSelectedCampaign(data);
      setCampaigns([data, ...campaigns]);
      toast.success('Campaign created!');
      navigate('/add-companies');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create campaign');
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (campaignStep === 0) {
      return selectedCampaign ? 'Continue with Campaign' : 'Next';
    }
    if (campaignStep === 3) {
      return 'Create Campaign';
    }
    return 'Next';
  };

  const getCompletedSteps = () => {
    const completed: number[] = [];
    if (campaignStep > 0) completed.push(0);
    if (campaignStep > 1) completed.push(1);
    if (campaignStep > 2) completed.push(2);
    return completed;
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader title="Campaign Setup" onBack={handleBack} />
        <CampaignSteps
          currentStep={campaignStep}
          completedSteps={getCompletedSteps()}
          onStepClick={(step) => step < campaignStep && setCampaignStep(step)}
        />

        <div className="flex-1 overflow-auto px-6 py-4">
          {/* Step 0: Select */}
          {campaignStep === 0 && (
            <div className="space-y-6 max-w-2xl">
              {/* Existing Campaigns */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Folder className="w-5 h-5" />
                  <span className="text-sm font-semibold uppercase tracking-wide">Existing Campaigns</span>
                </div>
                <div className="space-y-2">
                  {campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      onClick={() => handleCampaignSelect(campaign)}
                      className={cn(
                        'w-full p-4 rounded-xl border-2 text-left transition-all',
                        selectedCampaign?.id === campaign.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <p className="font-medium text-foreground">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.companies_count} companies · {campaign.contacts_count} contacts
                      </p>
                    </button>
                  ))}
                  {campaigns.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4">No campaigns yet</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-sm text-muted-foreground uppercase tracking-wide">Or Create New</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* New Campaign Name */}
              <div className="space-y-2">
                <Label htmlFor="campaignName">Campaign Name</Label>
                <Input
                  id="campaignName"
                  value={campaignDraft.name}
                  onChange={(e) => handleNewCampaignName(e.target.value)}
                  placeholder="e.g. AWS Migration - Benelux"
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Step 1: Identity */}
          {campaignStep === 1 && (
            <div className="space-y-5 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="targetRegion">Target Region</Label>
                <Input
                  id="targetRegion"
                  value={campaignDraft.target_region}
                  onChange={(e) => setCampaignDraft({ target_region: e.target.value })}
                  placeholder="e.g. Benelux, Finland"
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product">What are we selling? (Product)</Label>
                <Input
                  id="product"
                  value={campaignDraft.product}
                  onChange={(e) => setCampaignDraft({ product: e.target.value })}
                  placeholder="e.g. Cloud Security Assessment"
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="productCategory">Product Category</Label>
                <Select
                  value={campaignDraft.product_category}
                  onValueChange={(value) => setCampaignDraft({ product_category: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {productCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="technicalFocus">Specific Technical Focus</Label>
                <Input
                  id="technicalFocus"
                  value={campaignDraft.technical_focus}
                  onChange={(e) => setCampaignDraft({ technical_focus: e.target.value })}
                  placeholder="e.g. IT Monitoring, Network Monitoring, Cloud Security, FinOps"
                  className="h-12 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Drives who the AI looks for</p>
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {campaignStep === 2 && (
            <div className="space-y-5 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="jobTitles">Job Titles (one per line or comma-separated)</Label>
                <Textarea
                  id="jobTitles"
                  value={campaignDraft.job_titles}
                  onChange={(e) => setCampaignDraft({ job_titles: e.target.value })}
                  placeholder={`CTO, VP Engineering\nNetwork Operations Manager\nDirector of IT`}
                  className="min-h-[100px] rounded-xl resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="personas">Personas (Internal Context)</Label>
                <Textarea
                  id="personas"
                  value={campaignDraft.personas}
                  onChange={(e) => setCampaignDraft({ personas: e.target.value })}
                  placeholder="Decision Maker focusing on cost reduction..."
                  className="min-h-[80px] rounded-xl resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetVerticals">Target Verticals</Label>
                <Input
                  id="targetVerticals"
                  value={campaignDraft.target_verticals}
                  onChange={(e) => setCampaignDraft({ target_verticals: e.target.value })}
                  placeholder="FinTech, HealthCare, Manufacturing"
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Step 3: Strategy */}
          {campaignStep === 3 && (
            <div className="space-y-5 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="primaryAngle">Primary Angle</Label>
                <Input
                  id="primaryAngle"
                  value={campaignDraft.primary_angle}
                  onChange={(e) => setCampaignDraft({ primary_angle: e.target.value })}
                  placeholder="e.g. Reduce AWS Spend"
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryAngle">Secondary Angle</Label>
                <Input
                  id="secondaryAngle"
                  value={campaignDraft.secondary_angle}
                  onChange={(e) => setCampaignDraft({ secondary_angle: e.target.value })}
                  placeholder="e.g. Security Compliance"
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="painPoints">Pain Points (one per line)</Label>
                <Textarea
                  id="painPoints"
                  value={campaignDraft.pain_points}
                  onChange={(e) => setCampaignDraft({ pain_points: e.target.value })}
                  placeholder={`High cloud bills\nSecurity incidents\nCompliance concerns`}
                  className="min-h-[100px] rounded-xl resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <Button
            onClick={handleNext}
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-medium"
          >
            {isLoading ? 'Creating...' : getButtonText()}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
