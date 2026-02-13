import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, AlertCircle, Send, HelpCircle } from 'lucide-react';

type ProspectStatus = 'pending' | 'sent_to_clay' | 'new' | 'update' | 'fail' | 'inputted' | 'duplicate' | string | null;

interface StatusBadgeProps {
  status: ProspectStatus;
}

const statusConfig: Record<string, { 
  label: string; 
  icon: typeof Clock; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}> = {
  pending: { 
    label: 'Pending', 
    icon: Clock, 
    variant: 'outline',
    className: 'border-muted-foreground/50'
  },
  sent_to_clay: { 
    label: 'Sent to Clay', 
    icon: Send, 
    variant: 'secondary',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
  },
  new: { 
    label: 'New', 
    icon: CheckCircle, 
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  },
  update: { 
    label: 'Update', 
    icon: CheckCircle, 
    variant: 'default',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
  },
  fail: {
    label: 'Clay enrichment failed',
    icon: AlertCircle,
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  },

  failed: {
    label: 'Clay enrichment failed',
    icon: AlertCircle,
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  },
  inputted: { 
    label: 'Inputted', 
    icon: CheckCircle, 
    variant: 'default',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  },
  duplicate: {
    label: 'Duplicate in Clay',
    icon: AlertCircle,
    variant: 'destructive',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase() || 'pending';
  const config = statusConfig[normalizedStatus] || {
    label: status || 'Unknown',
    icon: HelpCircle,
    variant: 'outline' as const,
    className: ''
  };
  
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant} 
      className={`gap-1 ${config.className || ''}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
