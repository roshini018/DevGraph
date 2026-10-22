import React from 'react';

export interface DotGridBackgroundProps {
  className?: string;
  dotColor?: string;
  dotSize?: number;
  gap?: number;
}

export const DotGridBackground: React.FC<DotGridBackgroundProps> = ({
  className = '',
  dotColor = '#262626',
  dotSize = 1,
  gap = 24,
}) => {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${className}`}
      style={{
        backgroundImage: `radial-gradient(${dotColor} ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${gap}px ${gap}px`,
        maskImage: 'radial-gradient(ellipse 60% 50% at 50% 50%, #000 60%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 50%, #000 60%, transparent 100%)',
      }}
    />
  );
};
