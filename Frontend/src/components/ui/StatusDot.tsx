import React from 'react';

export type StatusType = 'ready' | 'indexing' | 'failed' | 'queued' | 'offline' | 'idle' | 'not_indexed';

export interface StatusDotProps {
  status?: StatusType;
  pulse?: boolean;
  className?: string;
  label?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status = 'ready',
  pulse = false,
  className = '',
  label,
}) => {
  const statusColors: Record<StatusType, string> = {
    ready: 'bg-green-bright shadow-[0_0_8px_rgba(0,234,100,0.4)]',
    indexing: 'bg-ember',
    failed: 'bg-danger',
    queued: 'bg-slate',
    offline: 'bg-subtle',
    idle: 'bg-subtle',
    not_indexed: 'bg-subtle',
  };

  const dot = (
    <span
      className={`inline-block w-2 h-2 rounded-full ${statusColors[status]} ${
        pulse || status === 'indexing' ? 'animate-pulse' : ''
      } ${className}`}
      aria-hidden="true"
    />
  );

  if (!label) return dot;

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
      {dot}
      <span>{label}</span>
    </span>
  );
};
