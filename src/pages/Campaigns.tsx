import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Folder,
  MoreVertical,
  Pencil,
  Trash2,
  Building2,
  Users,
  ArrowRight,
  Loader2,
  Target,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppStore, type CampaignDraft } from '@/stores/appStore';
import { fetchCampaigns, createCampaign, updateCampaign, deleteCampaign } from '@/services/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const productCategories = [
  'IT Infrastructure',
  'Cloud Services',
  'Security',
  'Data & Analytics',
  'Software Development',
  'Consulting',
  'Other',
];

const initialDraft: CampaignDraft = {
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

export default function Campaigns() {
  const navigate = useNavigate();
  const { campaigns, setCampaigns, user } = useAppStore();

  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(initialDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [step, setStep] = useState(0); // 0=basics, 1=identity, 2=audience, 3=strategy

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const data = await fetchCampaigns();
      setCampaigns(data);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setDraft(initialDraft);
    setEditingId(null);
    setStep(0);
    setShowModal(true);
  };

  const openEdit = (campaign: (typeof campaigns)[0], e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft({
      name: campaign.name || '',
      target_region: campaign.target_region || '',
      product: campaign.product || '',
      product_category: campaign.product_category || '',
      technical_focus: campaign.technical_focus || '',
      job_titles: campaign.job_titles || '',
      personas: campaign.personas || '',
      target_verticals: campaign.target_verticals || '',
      primary_angle: campaign.primary_angle || '',
      secondary_angle: campaign.secondary_angle || '',
      pain_points: campaign.pain_points || '',
    });
    setEditingId(campaign.id);
    setStep(0);
    setShowModal(true);
  };

  const updateDraft = (updates: Partial<CampaignDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (step === 0 && !draft.name.trim()) {
      toast.error('Please enter a campaign name');
      return;
    }
    if (step === 1 && (!draft.product.trim() || !draft.target_region.trim())) {
      toast.error('Please fill in product and target region');
      return;
    }
    if (step === 2 && !draft.job_titles.trim()) {
      toast.error('Please enter target job titles');
      return;
    }
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleSave();
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!draft.primary_angle.trim()) {
      toast.error('Please enter a primary angle');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const updated = await updateCampaign(editingId, draft as unknown as Record<string, unknown>);
        setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)));
        toast.success('Campaign updated');
      } else {
        const created = await createCampaign(user.id, draft as unknown as Record<string, unknown>);
        setCampaigns([created, ...campaigns]);
        toast.success('Campaign created');
        navigate(`/companies/${created.id}`);
      }
      setShowModal(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save campaign');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCampaign(campaignToDelete);
      setCampaigns(campaigns.filter((c) => c.id !== campaignToDelete));
      toast.success('Campaign deleted');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete campaign');
    } finally {
      setIsDeleting(false);
      setCampaignToDelete(null);
    }
  };

  const stepLabels = ['Basics', 'Identity', 'Audience', 'Strategy'];

  const campaignsWithContacts = campaigns.filter((c) => (c.contacts_count || 0) > 0);
  const campaignsWithoutContacts = campaigns.filter((c) => (c.contacts_count || 0) === 0);

  const renderCampaignMenu = (campaign: (typeof campaigns)[0]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={(e) => openEdit(campaign, e)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setCampaignToDelete(campaign.id);
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <PageHeader
          title="My Campaigns"
          actions={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          }
        />

        <div className="flex-1 overflow-auto p-6">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 rounded-xl border bg-card space-y-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                  <div className="flex gap-6">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && campaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Target className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Create your first campaign</h2>
              <p className="text-muted-foreground mb-6 max-w-md">
                Campaigns help you organize your B2B prospecting research by product, region, and target audience.
              </p>
              <Button onClick={openCreate} size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Create Campaign
              </Button>
            </div>
          )}

          {/* Campaign cards grid */}
          {!isLoading && campaigns.length > 0 && (
            <div className="space-y-8">
              {/* Campaigns with contacts */}
              {campaignsWithContacts.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Campaigns with Contacts
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {campaignsWithContacts.map((campaign) => (
                      <div
                        key={campaign.id}
                        onClick={() => navigate(`/companies/${campaign.id}`)}
                        className="group relative p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
                      >
                        {/* Menu */}
                        {renderCampaignMenu(campaign)}

                        {/* Content */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Folder className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 pr-8">
                            <h3 className="font-semibold text-foreground truncate">{campaign.name}</h3>
                            {campaign.product && (
                              <p className="text-sm text-muted-foreground truncate">{campaign.product}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4" />
                            {campaign.companies_count || 0} companies
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            {campaign.contacts_count || 0} contacts
                          </span>
                        </div>

                        {campaign.target_region && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Region: {campaign.target_region}
                          </p>
                        )}

                        <div className="mt-4 pt-3 border-t flex items-center text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          Manage companies
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All other campaigns (no contacts yet) */}
              {campaignsWithoutContacts.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                    <Folder className="w-5 h-5" />
                    Campaigns Awaiting Contacts
                    <span className="text-sm font-normal">({campaignsWithoutContacts.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {campaignsWithoutContacts.map((campaign) => (
                      <div
                        key={campaign.id}
                        onClick={() => navigate(`/companies/${campaign.id}`)}
                        className="group relative p-6 rounded-xl border border-dashed bg-card/50 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
                      >
                        {/* Menu */}
                        {renderCampaignMenu(campaign)}

                        {/* Content */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Folder className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0 pr-8">
                            <h3 className="font-semibold text-foreground truncate">{campaign.name}</h3>
                            {campaign.product && (
                              <p className="text-sm text-muted-foreground truncate">{campaign.product}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4" />
                            {campaign.companies_count || 0} companies
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground/60">
                            <Users className="w-4 h-4" />
                            No contacts yet
                          </span>
                        </div>

                        {campaign.target_region && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Region: {campaign.target_region}
                          </p>
                        )}

                        <div className="mt-4 pt-3 border-t flex items-center text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          Manage companies
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Campaign Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update your campaign details below.'
                : 'Set up your campaign to target the right prospects.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex gap-1 mb-2">
            {stepLabels.map((label, i) => (
              <button
                key={label}
                onClick={() => i < step && setStep(i)}
                className={cn(
                  'flex-1 h-1.5 rounded-full transition-colors',
                  i <= step ? 'bg-primary' : 'bg-muted',
                  i < step && 'cursor-pointer hover:bg-primary/80',
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Step {step + 1} of 4: {stepLabels[step]}
          </p>

          {/* Step 0: Basics */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  placeholder="e.g. AWS Migration - Benelux Q1"
                  className="h-11"
                />
              </div>
            </div>
          )}

          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Region *</Label>
                <Input
                  value={draft.target_region}
                  onChange={(e) => updateDraft({ target_region: e.target.value })}
                  placeholder="e.g. Benelux, DACH, Nordics"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Product *</Label>
                <Input
                  value={draft.product}
                  onChange={(e) => updateDraft({ product: e.target.value })}
                  placeholder="e.g. Cloud Security Assessment"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Product Category</Label>
                <Select
                  value={draft.product_category}
                  onValueChange={(v) => updateDraft({ product_category: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {productCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Technical Focus</Label>
                <Input
                  value={draft.technical_focus}
                  onChange={(e) => updateDraft({ technical_focus: e.target.value })}
                  placeholder="e.g. Network Monitoring, FinOps, Cloud Security"
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">Drives who the AI looks for</p>
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Job Titles *</Label>
                <Textarea
                  value={draft.job_titles}
                  onChange={(e) => updateDraft({ job_titles: e.target.value })}
                  placeholder={'CTO, VP Engineering\nNetwork Operations Manager\nDirector of IT'}
                  className="min-h-[100px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Personas</Label>
                <Textarea
                  value={draft.personas}
                  onChange={(e) => updateDraft({ personas: e.target.value })}
                  placeholder="Decision Maker focusing on cost reduction..."
                  className="min-h-[80px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Verticals</Label>
                <Input
                  value={draft.target_verticals}
                  onChange={(e) => updateDraft({ target_verticals: e.target.value })}
                  placeholder="FinTech, Healthcare, Manufacturing"
                  className="h-11"
                />
              </div>
            </div>
          )}

          {/* Step 3: Strategy */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Primary Angle *</Label>
                <Input
                  value={draft.primary_angle}
                  onChange={(e) => updateDraft({ primary_angle: e.target.value })}
                  placeholder="e.g. Reduce AWS Spend by 30%"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Secondary Angle</Label>
                <Input
                  value={draft.secondary_angle}
                  onChange={(e) => updateDraft({ secondary_angle: e.target.value })}
                  placeholder="e.g. Security Compliance"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Pain Points</Label>
                <Textarea
                  value={draft.pain_points}
                  onChange={(e) => updateDraft({ pain_points: e.target.value })}
                  placeholder={'High cloud bills\nSecurity incidents\nCompliance concerns'}
                  className="min-h-[100px] resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-4">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isSaving}>
                Back
              </Button>
            )}
            <Button onClick={handleNext} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {step < 3 ? 'Next' : editingId ? 'Update Campaign' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!campaignToDelete} onOpenChange={() => setCampaignToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the campaign and all associated companies, contacts, and
              research data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
