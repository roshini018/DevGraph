import React from 'react';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskPillProps {
  level?: RiskLevel;
  risk?: RiskLevel;
  className?: string;
  showDot?: boolean;
}

export const RiskPill: React.FC<RiskPillProps> = ({
  level,
  risk,
  className = '',
  showDot = true,
}) => {
  const effectiveLevel = level || risk || 'low';
  const styles: Record<RiskLevel, { bg: string; text: string; border: string; dot: string; label: string }> = {
    low: {
      bg: 'bg-green-soft',
      text: 'text-green',
      border: 'border-green/40',
      dot: 'bg-green-bright',
      label: 'LOW',
    },
    medium: {
      bg: 'bg-ember/10',
      text: 'text-ember',
      border: 'border-ember/40',
      dot: 'bg-ember',
      label: 'MEDIUM',
    },
    high: {
      bg: 'bg-terracotta/15',
      text: 'text-terracotta',
      border: 'border-terracotta/50',
      dot: 'bg-terracotta',
      label: 'HIGH',
    },
  };

  const current = styles[effectiveLevel] || styles.low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-wider uppercase border select-none ${current.bg} ${current.text} ${current.border} ${className}`}
      aria-label={`Risk level: ${current.label}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot}`} aria-hidden="true" />}
      <span>{current.label}</span>
    </span>
  );
};
