import React from 'react';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  name?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  name = 'segmented-control',
}: SegmentedControlProps<T>) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs',
    md: 'p-1 text-xs',
  };

  const itemSizeClasses = {
    sm: 'px-2 py-0.5 min-h-[24px]',
    md: 'px-3 py-1 min-h-[28px]',
  };

  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={`inline-flex items-center rounded-md bg-surface border border-line ${sizeClasses[size]} ${className}`}
    >
      {options.map(option => {
        const isSelected = option.value === value;
        const isDisabled = option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(option.value)}
            className={`flex items-center justify-center gap-1.5 rounded font-sans font-medium select-none whitespace-nowrap transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              itemSizeClasses[size]
            } ${
              isSelected
                ? 'bg-raised text-text border border-line-strong font-semibold shadow-sm'
                : 'bg-transparent text-muted hover:text-text border border-transparent'
            }`}
          >
            {option.icon && <span className="inline-flex shrink-0">{option.icon}</span>}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
