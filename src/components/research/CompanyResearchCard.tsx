import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Cloud, Globe, Linkedin, ExternalLink, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface CompanyResearch {
  id: string;
  company_domain: string;
  company_name: string | null;
  status: string;
  company_status: string | null;
  acquired_by: string | null;
  cloud_provider: string | null;
  cloud_confidence: number | null;
  evidence_urls: string[] | null;
  raw_data: any;
  created_at: string;
}

interface CompanyResearchCardProps {
  company: CompanyResearch;
  showJustReceived?: boolean;
}

export const CompanyResearchCard = ({ company, showJustReceived = false }: CompanyResearchCardProps) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Information
          {getStatusIcon(company.status)}
          {showJustReceived && (
            <Badge variant="outline" className="ml-2">Just received</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Company Name and Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-lg">
            {company.company_name || company.company_domain}
          </span>
          {company.company_status && (
            <Badge 
              variant="secondary"
              className={
                company.company_status === 'Operating' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                  : company.company_status === 'Acquired'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : ''
              }
            >
              {company.company_status}
            </Badge>
          )}
        </div>

        {/* Domain */}
        <div className="text-sm text-muted-foreground">
          <Globe className="h-3 w-3 inline mr-1" />
          {company.company_domain}
        </div>

        {/* Acquired By Info */}
        {company.acquired_by && (
          <p className="text-sm text-muted-foreground">
            Acquired by <span className="font-medium text-foreground">{company.acquired_by}</span>
          </p>
        )}

        {/* Cloud Preference */}
        {company.cloud_provider && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Cloud Provider</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{company.cloud_provider}</span>
              {company.cloud_confidence && (
                <Badge variant="outline" className="text-xs">
                  {company.cloud_confidence}% confidence
                </Badge>
              )}
            </div>
            
            {/* Evidence URLs */}
            {company.evidence_urls && company.evidence_urls.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">Evidence:</p>
                <div className="flex flex-wrap gap-2">
                  {company.evidence_urls.slice(0, 3).map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {url.includes('linkedin') ? <Linkedin className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      Source {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
