import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'white' | 'green' | 'secondary' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      loading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isSpinnerActive = isLoading || loading;
    const isDisabled = disabled || isSpinnerActive;

    // Base styling: 1px hairline border, 6px radius, Geist font, transitions, focus ring
    const baseStyles =
      'inline-flex items-center justify-center font-sans font-medium transition-all duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none';

    // Variants according to Rule 5 & design tokens
    const variantStyles: Record<ButtonVariant, string> = {
      // White: bg = text token (#EDEDED), near-black label (#0A0A0A) for navigate or confirm
      white:
        'bg-white text-black border border-white hover:bg-white/90 active:bg-white/80 disabled:hover:bg-white',
      // Green: dark label (#0A0A0A), bg #1BA94C (hover #17933F) for run or verify
      green:
        'bg-green text-black border border-green hover:bg-green-hover active:bg-green-hover/90 disabled:hover:bg-green font-semibold',
      // Secondary: transparent with 1px border
      secondary:
        'bg-transparent text-text border border-line hover:border-line-strong hover:bg-raised active:bg-surface disabled:hover:bg-transparent disabled:hover:border-line',
      // Ghost: transparent, no border by default, subtle hover
      ghost:
        'bg-transparent text-muted hover:text-text hover:bg-raised active:bg-surface border border-transparent',
      // Icon: compact square button
      icon:
        'bg-transparent text-muted hover:text-text hover:bg-raised active:bg-surface border border-line hover:border-line-strong p-1.5',
    };

    const sizeStyles: Record<ButtonSize, string> = {
      sm: variant === 'icon' ? 'p-1 text-xs' : 'text-xs px-2.5 py-1 rounded gap-1.5 min-h-[28px]',
      md: variant === 'icon' ? 'p-1.5 text-xs' : 'text-xs px-3.5 py-1.5 rounded gap-2 min-h-[32px]',
      lg: variant === 'icon' ? 'p-2 text-sm' : 'text-sm px-4 py-2 rounded gap-2.5 min-h-[38px]',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isSpinnerActive ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isSpinnerActive && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
