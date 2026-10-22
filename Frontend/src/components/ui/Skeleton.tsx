import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'full';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  rounded = 'md',
  className = '',
  style,
  ...props
}) => {
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      aria-hidden="true"
      className={`bg-raised/80 animate-pulse ${roundedClass} ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
};

export const CodeSkeleton: React.FC = () => {
  return (
    <div className="space-y-2 p-4 font-mono">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-5/6" />
      <div className="py-2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
};
