import React from 'react';

export interface KbdHintProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const KbdHint: React.FC<KbdHintProps> = ({ children, className = '', ...props }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-line bg-raised font-mono text-[10px] text-muted tracking-tight leading-none select-none ${className}`}
      {...props}
    >
      {children}
    </kbd>
  );
};
