import { Building2, Users, Zap, Check, Loader2, AlertCircle, Cloud, ChevronDown, ChevronUp, ExternalLink, RotateCcw } from 'lucide-react';
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
  onRetryStep?: (companyId: string, step: 'company' | 'people' | 'clay') => void;
}

const researchSteps = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'people', label: 'People', icon: Users },
  { id: 'clay', label: 'Enrich', icon: Zap },
];

// Loading skeleton for company data
function CompanyDataSkeleton() {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Building2 className="w-4 h-4" />
        <span className="flex items-center gap-2">
          Researching company...
          <Loader2 className="w-3 h-3 animate-spin" />
        </span>
      </h4>
      <div className="bg-background rounded-lg p-3 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

// Loading skeleton for people data
function PeopleDataSkeleton() {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Users className="w-4 h-4" />
        <span className="flex items-center gap-2">
          Finding contacts...
          <Loader2 className="w-3 h-3 animate-spin" />
        </span>
      </h4>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-background rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Loading skeleton for Clay enrichment
function ClayDataSkeleton() {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Zap className="w-4 h-4" />
        <span className="flex items-center gap-2">
          Enriching data...
          <Loader2 className="w-3 h-3 animate-spin" />
        </span>
      </h4>
      <div className="bg-background rounded-lg p-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function ResearchCompanyCard({ 
  companyProgress, 
  isExpanded, 
  onToggleExpand,
  getStepStatus,
  onRetryStep
}: ResearchCompanyCardProps) {
  const { companyId, companyName, step, companyData, peopleData, error } = companyProgress;

  // Determine if we're currently loading each section
  const isLoadingCompany = step === 'company';
  const isLoadingPeople = step === 'people';
  const isLoadingClay = step === 'clay';
  const isProcessing = isLoadingCompany || isLoadingPeople || isLoadingClay;

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
    if (isLoadingCompany) return 'Researching company status...';
    if (isLoadingPeople) return 'Finding decision makers...';
    if (isLoadingClay) return 'Enriching contact data...';
    return null;
  };

  return (
    <div className={cn('rounded-xl border-2 transition-all', getStatusColor())}>
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          {step === 'error' ? (
            <AlertCircle className="w-5 h-5 text-destructive" />
          ) : step === 'complete' ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{companyName}</span>
              {getCompanyStatusBadge()}
            </div>
            {isProcessing && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                {getCurrentStepLabel()}
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive mt-1">{error}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Step indicators */}
          <div className="flex gap-1">
            {researchSteps.map((s) => {
              const status = getStepStatus(s.id, step);
              return (
                <div
                  key={s.id}
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all',
                    status === 'completed' && 'bg-green-500 text-white',
                    status === 'current' && 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1',
                    status === 'pending' && 'bg-muted text-muted-foreground',
                    status === 'error' && 'bg-destructive text-destructive-foreground'
                  )}
                >
                  {status === 'completed' ? (
                    <Check className="w-3 h-3" />
                  ) : status === 'current' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <s.icon className="w-3 h-3" />
                  )}
                </div>
              );
            })}
          </div>
          
          {(companyData || peopleData || isProcessing) && (
            isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      {/* Expanded Content - show during loading or when data exists */}
      {isExpanded && (companyData || peopleData || isProcessing) && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
          {/* Retry Buttons */}
          {onRetryStep && !isProcessing && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRetryStep(companyId, 'company'); }}
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry Company
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRetryStep(companyId, 'people'); }}
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry People
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRetryStep(companyId, 'clay'); }}
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry/Skip Clay
              </Button>
            </div>
          )}

          {/* Company Data or Loading Skeleton */}
          {isLoadingCompany && <CompanyDataSkeleton />}
          {companyData && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company Research
                <Check className="w-3 h-3 text-green-500" />
              </h4>
              <div className="bg-background rounded-lg p-3 space-y-2">
                {companyData.company_status && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <span className="font-medium">{companyData.company_status}</span>
                  </p>
                )}
                {companyData.acquiredBy && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Acquired by:</span>{' '}
                    <span className="font-medium">{companyData.acquiredBy}</span>
                    {companyData.effectiveDate && ` (${companyData.effectiveDate})`}
                  </p>
                )}
                {companyData.cloud_preference && (
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      <span className="font-medium">{companyData.cloud_preference.provider}</span>
                      <span className="text-muted-foreground ml-2">
                        ({companyData.cloud_preference.confidence}% confidence)
                      </span>
                    </span>
                  </div>
                )}
                {companyData.cloud_preference?.evidence_urls && companyData.cloud_preference.evidence_urls.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Evidence:</p>
                    <div className="flex flex-wrap gap-1">
                      {companyData.cloud_preference.evidence_urls.slice(0, 3).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          Source {i + 1}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* People Data or Loading Skeleton */}
          {isLoadingPeople && <PeopleDataSkeleton />}
          {peopleData?.contacts && peopleData.contacts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Contacts Found ({peopleData.contacts.length})
                <Check className="w-3 h-3 text-green-500" />
              </h4>
              <div className="space-y-2">
                {peopleData.contacts.map((contact: ResearchContact, index: number) => (
                  <div 
                    key={index} 
                    className="bg-background rounded-lg p-3 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {contact.first_name} {contact.last_name}
                        </span>
                        <Badge className={cn('text-xs', getPriorityColor(contact.priority))}>
                          {contact.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {contact.pitch_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {contact.job_title}
                      </p>
                      {contact.priority_reason && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {contact.priority_reason}
                        </p>
                      )}
                    </div>
                    {contact.linkedin && (
                      <a
                        href={`https://${contact.linkedin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clay Enrichment Loading Skeleton */}
          {isLoadingClay && <ClayDataSkeleton />}
        </div>
      )}
    </div>
  );
}
