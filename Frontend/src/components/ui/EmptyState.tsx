import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-line bg-surface/50 font-sans ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center text-muted mb-3">
        {icon || <Inbox className="w-5 h-5 text-subtle" />}
      </div>
      <h3 className="text-sm font-semibold text-text tracking-tight mb-1">
        {title}
      </h3>
      <p className="text-xs text-subtle max-w-sm mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
