import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  whatHappened: string;
  nextStep?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  whatHappened,
  nextStep = 'Check your connection or mock controls, then retry the request.',
  onRetry,
  isRetrying = false,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-danger/30 bg-surface/80 font-sans ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center text-danger mb-3">
        <AlertCircle className="w-5 h-5" />
      </div>

      <h3 className="text-sm font-semibold text-text tracking-tight mb-2">
        {title}
      </h3>

      <div className="max-w-md space-y-1.5 mb-4 text-xs">
        <p className="text-muted">
          <span className="text-subtle font-medium">What happened: </span>
          {whatHappened}
        </p>
        {nextStep && (
          <p className="text-subtle">
            <span className="text-subtle font-medium">Next step: </span>
            {nextStep}
          </p>
        )}
      </div>

      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          isLoading={isRetrying}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Retry
        </Button>
      )}
    </div>
  );
};
