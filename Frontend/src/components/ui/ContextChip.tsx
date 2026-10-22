import React from 'react';
import { X } from 'lucide-react';

export interface ContextChipProps {
  label: string;
  icon?: React.ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  count?: number;
}

export const ContextChip: React.FC<ContextChipProps> = ({
  label,
  icon,
  onRemove,
  onClick,
  active = false,
  className = '',
  count,
}) => {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono transition-colors select-none ${
        active
          ? 'bg-raised border-line-strong text-text'
          : 'bg-surface border-line text-muted hover:border-line-strong hover:text-text'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {icon && <span className="inline-flex shrink-0 text-subtle">{icon}</span>}
      <span className="truncate max-w-[140px]">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] px-1 rounded bg-raised text-subtle font-mono">
          {count}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-subtle hover:text-text p-0.5 rounded transition-colors"
          aria-label={`Remove ${label}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};
