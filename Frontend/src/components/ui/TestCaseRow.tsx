import React from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

export type TestCaseStatus = 'passed' | 'failed' | 'running' | 'skipped';

export interface TestCaseRowProps {
  id: string;
  name: string;
  status: TestCaseStatus;
  resultText?: string;
  durationMs?: number;
  className?: string;
  onClick?: () => void;
}

export const TestCaseRow: React.FC<TestCaseRowProps> = ({
  name,
  status,
  resultText,
  durationMs,
  className = '',
  onClick,
}) => {
  const statusIcons: Record<TestCaseStatus, React.ReactNode> = {
    passed: <CheckCircle2 className="w-3.5 h-3.5 text-green-bright shrink-0" />,
    failed: <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />,
    running: <Clock className="w-3.5 h-3.5 text-ember shrink-0 animate-spin" />,
    skipped: <AlertTriangle className="w-3.5 h-3.5 text-subtle shrink-0" />,
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded bg-surface border border-line hover:border-line-strong text-xs font-mono transition-colors select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-2.5 truncate">
        {statusIcons[status]}
        <span className="text-text font-medium truncate">{name}</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {resultText && (
          <span
            className={`text-[11px] ${
              status === 'passed'
                ? 'text-green'
                : status === 'failed'
                ? 'text-danger'
                : 'text-subtle'
            }`}
          >
            {resultText}
          </span>
        )}
        {durationMs !== undefined && (
          <span className="text-[10px] text-subtle">{durationMs}ms</span>
        )}
      </div>
    </div>
  );
};
