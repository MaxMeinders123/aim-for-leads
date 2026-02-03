import { ReactNode, forwardRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(
  function PageHeader({ title, subtitle, backTo, onBack, actions }, ref) {
    const navigate = useNavigate();

    const handleBack = () => {
      if (onBack) {
        onBack();
      } else if (backTo) {
        navigate(backTo);
      }
    };

    return (
      <div ref={ref} className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          {(backTo || onBack) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="w-8 h-8 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    );
  }
);
