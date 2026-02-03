import { Building2, Users, Zap, Check, Loader2, AlertCircle, Cloud, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { CompanyResearchProgress, ResearchContact } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ResearchCompanyCardProps {
  companyProgress: CompanyResearchProgress;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getStepStatus: (stepId: string, companyStep: string) => string;
}

const researchSteps = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'people', label: 'People', icon: Users },
  { id: 'clay', label: 'Enrich', icon: Zap },
];

export function ResearchCompanyCard({ 
  companyProgress, 
  isExpanded, 
  onToggleExpand,
  getStepStatus 
}: ResearchCompanyCardProps) {
  const { companyName, step, companyData, peopleData, error } = companyProgress;

  const getStatusColor = () => {
    if (step === 'error') return 'border-destructive bg-destructive/5';
    if (step === 'complete') return 'border-green-500 bg-green-50';
    return 'border-primary bg-primary/5';
  };

  const getCompanyStatusBadge = () => {
    if (!companyData?.company_status) return null;
    
    const statusColors: Record<string, string> = {
      'Operating': 'bg-green-100 text-green-800',
      'Acquired': 'bg-yellow-100 text-yellow-800',
      'Bankrupt': 'bg-red-100 text-red-800',
      'Not_Found': 'bg-gray-100 text-gray-800',
    };
    
    return (
      <Badge className={cn('text-xs', statusColors[companyData.company_status] || 'bg-muted')}>
        {companyData.company_status}
      </Badge>
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-muted text-muted-foreground';
    }
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
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs',
                    status === 'completed' && 'bg-green-500 text-white',
                    status === 'current' && 'bg-primary text-primary-foreground',
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
          
          {(companyData || peopleData) && (
            isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (companyData || peopleData) && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
          {/* Company Data */}
          {companyData && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company Research
              </h4>
              <div className="bg-background rounded-lg p-3 space-y-2">
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

          {/* People Data */}
          {peopleData?.contacts && peopleData.contacts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Contacts Found ({peopleData.contacts.length})
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
        </div>
      )}
    </div>
  );
}
