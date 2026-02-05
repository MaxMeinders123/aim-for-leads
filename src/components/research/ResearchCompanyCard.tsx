import { Building2, Users, Check, Loader2, AlertCircle, Cloud, ChevronDown, ChevronUp, ExternalLink, RotateCcw, Upload } from 'lucide-react';
import { CompanyResearchProgress, ResearchContact } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface ResearchCompanyCardProps {
  companyProgress: CompanyResearchProgress;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getStepStatus: (stepId: string, companyStep: string) => string;
  onRetryStep?: (companyId: string, step: 'company' | 'people') => void;
  onPushToContacts?: (companyId: string, companyName: string) => void;
}

const researchSteps = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'people', label: 'People', icon: Users },
];

// Loading skeleton for company data
function CompanyDataSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
          Researching company
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </h4>
      </div>
      <div className="bg-background rounded-xl p-4 shadow-sm space-y-3 border">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-48" />
      </div>
    </div>
  );
}

// Loading skeleton for people data
function PeopleDataSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-primary" />
        </div>
        <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
          Finding contacts
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </h4>
      </div>
      <div className="grid gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-background rounded-xl p-4 border shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}


export function ResearchCompanyCard({
  companyProgress,
  isExpanded,
  onToggleExpand,
  getStepStatus,
  onRetryStep,
  onPushToContacts
}: ResearchCompanyCardProps) {
  const { companyId, companyName, step, companyData, peopleData, error } = companyProgress;

  // Determine if we're currently loading each section
  const isLoadingCompany = step === 'company';
  const isLoadingPeople = step === 'people';
  const isAwaitingCallback = step === 'awaiting_callback';
  const isProcessing = isLoadingCompany || isLoadingPeople || isAwaitingCallback;

  const getStatusColor = () => {
    if (step === 'error') return 'border-destructive bg-destructive/5';
    if (step === 'complete') return 'border-green-500 bg-green-50 dark:bg-green-950/20';
    return 'border-primary bg-primary/5';
  };

  const getCompanyStatusBadge = () => {
    if (!companyData?.company_status) return null;

    const statusColors: Record<string, string> = {
      'Operating': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'Acquired': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'Renamed': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'Bankrupt': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      'Not_Found': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
    };

    return (
      <Badge className={cn('text-xs', statusColors[companyData.company_status] || 'bg-muted')}>
        {companyData.company_status}
      </Badge>
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getCurrentStepLabel = () => {
    if (isLoadingCompany) return 'Researching company';
    if (isLoadingPeople) return 'Finding contacts';
    if (isAwaitingCallback) return 'Processing results';
    return null;
  };

  return (
    <div className={cn('rounded-xl border-2 transition-all shadow-sm hover:shadow-md', getStatusColor())}>
      {/* Header - Clean and minimal */}
      <button
        onClick={onToggleExpand}
        className="w-full p-5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {step === 'error' ? (
            <div className="shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
          ) : step === 'complete' ? (
            <div className="shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          ) : (
            <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-lg text-foreground truncate">{companyName}</span>
            </div>
            {isProcessing && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                {getCurrentStepLabel()}
              </p>
            )}
            {step === 'complete' && !isExpanded && peopleData?.contacts && (
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                ✓ {peopleData.contacts.length} contact{peopleData.contacts.length !== 1 ? 's' : ''} found
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive font-medium mt-1">⚠ {error}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {(companyData || peopleData || isProcessing) && (
            isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )
          )}
        </div>
      </button>

      {/* Expanded Content - show during loading or when data exists */}
      {isExpanded && (companyData || peopleData || isProcessing) && (
        <div className="px-6 pb-6 space-y-6 border-t border-border/50 pt-6 bg-muted/20">
          {/* Action Buttons */}
          {(onRetryStep || onPushToContacts) && (
            <div className="flex flex-wrap gap-2">
              {onPushToContacts && (step === 'complete' || (peopleData?.contacts && peopleData.contacts.length > 0)) && (
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onPushToContacts(companyId, companyName); }}
                  className="shadow-sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Push to Contacts
                </Button>
              )}
              {onRetryStep && !isProcessing && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onRetryStep(companyId, 'company'); }}
                    className="shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry Company
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onRetryStep(companyId, 'people'); }}
                    className="shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry People
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Company Data or Loading Skeleton */}
          {isLoadingCompany && <CompanyDataSkeleton />}
          {companyData && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <h4 className="text-base font-semibold text-foreground">Company Information</h4>
                <Check className="w-4 h-4 text-green-500 ml-auto" />
              </div>
              <div className="bg-background rounded-xl p-4 shadow-sm space-y-3 border">
                {companyData.company_status && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground min-w-[100px]">Status</span>
                    <div className="flex items-center gap-2">
                      {getCompanyStatusBadge()}
                      {companyData.acquiredBy && (
                        <span className="text-sm">
                          → <span className="font-medium">{companyData.acquiredBy}</span>
                          {companyData.effectiveDate && <span className="text-muted-foreground ml-1">({companyData.effectiveDate})</span>}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {companyData.cloud_preference && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground min-w-[100px]">Cloud Provider</span>
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{companyData.cloud_preference.provider}</span>
                      <Badge variant="outline" className="text-xs">
                        {companyData.cloud_preference.confidence}% confidence
                      </Badge>
                    </div>
                  </div>
                )}
                {companyData.cloud_preference?.evidence_urls && companyData.cloud_preference.evidence_urls.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex flex-wrap gap-2">
                      {companyData.cloud_preference.evidence_urls.slice(0, 3).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 bg-primary/5 px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Source {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* People Data or Loading Skeleton */}
          {(isLoadingPeople || isAwaitingCallback) && <PeopleDataSkeleton />}
          {peopleData?.contacts && peopleData.contacts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-base font-semibold text-foreground">
                  {peopleData.contacts.length} Contact{peopleData.contacts.length !== 1 ? 's' : ''} Found
                </h4>
                <Check className="w-4 h-4 text-green-500 ml-auto" />
              </div>
              <div className="grid gap-3">
                {peopleData.contacts.map((contact: ResearchContact, index: number) => (
                  <div
                    key={index}
                    className="bg-background rounded-xl p-4 flex items-start justify-between gap-4 border shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold text-base">
                          {contact.first_name} {contact.last_name}
                        </span>
                        <Badge className={cn('text-xs font-medium', getPriorityColor(contact.priority))}>
                          {contact.priority}
                        </Badge>
                        {contact.pitch_type && (
                          <Badge variant="secondary" className="text-xs">
                            {contact.pitch_type}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground font-medium mb-2">
                        {contact.job_title}
                      </p>
                      {contact.priority_reason && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 bg-muted/50 p-2 rounded-lg">
                          {contact.priority_reason}
                        </p>
                      )}
                    </div>
                    {contact.linkedin && (
                      <a
                        href={`https://${contact.linkedin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-2 rounded-lg hover:bg-primary/10 transition-colors"
                        title="View LinkedIn Profile"
                      >
                        <ExternalLink className="w-5 h-5 text-primary" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
