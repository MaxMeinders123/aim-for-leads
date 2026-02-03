import { Folder, Target, Users, MessageSquare, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  { id: 0, label: 'Select', icon: Folder },
  { id: 1, label: 'Identity', icon: Target },
  { id: 2, label: 'Audience', icon: Users },
  { id: 3, label: 'Strategy', icon: MessageSquare },
];

interface CampaignStepsProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  completedSteps?: number[];
}

export function CampaignSteps({ currentStep, onStepClick, completedSteps = [] }: CampaignStepsProps) {
  return (
    <div className="flex items-center gap-2 px-6 py-4">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isCompleted = completedSteps.includes(step.id);
        const canClick = onStepClick && (isCompleted || step.id < currentStep);

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => canClick && onStepClick(step.id)}
              disabled={!canClick}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : isCompleted
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground',
                canClick && 'cursor-pointer hover:opacity-80'
              )}
            >
              {isCompleted && !isActive ? (
                <Check className="w-4 h-4" />
              ) : (
                <step.icon className="w-4 h-4" />
              )}
              <span>{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className="w-6 h-px bg-border mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}
