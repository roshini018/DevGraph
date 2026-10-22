import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'neutral' | 'success' | 'green' | 'warning' | 'danger';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-raised text-muted border-line',
    neutral: 'bg-surface text-text border-line-strong',
    success: 'bg-green-soft text-green-bright border-green/30',
    green: 'bg-green-soft text-green-bright border-green/30',
    warning: 'bg-ember/10 text-ember border-ember/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-medium border ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
