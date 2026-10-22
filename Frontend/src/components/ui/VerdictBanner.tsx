import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';

export type VerdictStatus = 'passed' | 'failed' | 'warning' | 'pending';

export interface VerdictBannerProps {
  status: VerdictStatus;
  title: string;
  summary: string;
  metadata?: string;
  className?: string;
}

export const VerdictBanner: React.FC<VerdictBannerProps> = ({
  status,
  title,
  summary,
  metadata,
  className = '',
}) => {
  const configs: Record<VerdictStatus, { bg: string; border: string; icon: React.ReactNode; text: string }> = {
    passed: {
      bg: 'bg-green-soft',
      border: 'border-green/40',
      icon: <CheckCircle2 className="w-5 h-5 text-green-bright shrink-0" />,
      text: 'text-green-bright',
    },
    failed: {
      bg: 'bg-danger/10',
      border: 'border-danger/40',
      icon: <XCircle className="w-5 h-5 text-danger shrink-0" />,
      text: 'text-danger',
    },
    warning: {
      bg: 'bg-ember/10',
      border: 'border-ember/40',
      icon: <AlertTriangle className="w-5 h-5 text-ember shrink-0" />,
      text: 'text-ember',
    },
    pending: {
      bg: 'bg-raised',
      border: 'border-line-strong',
      icon: <Clock className="w-5 h-5 text-muted shrink-0 animate-spin" />,
      text: 'text-text',
    },
  };

  const current = configs[status];

  return (
    <div
      role="status"
      className={`flex items-start gap-3.5 p-3.5 rounded-lg border font-sans ${current.bg} ${current.border} ${className}`}
    >
      {current.icon}
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className={`text-sm font-semibold tracking-tight uppercase font-mono ${current.text}`}>
            {title}
          </h4>
          {metadata && (
            <span className="text-[11px] font-mono text-subtle">{metadata}</span>
          )}
        </div>
        <p className="text-xs text-text mt-0.5 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
};
