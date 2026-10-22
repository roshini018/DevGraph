import React, { useRef, useEffect } from 'react';
import { Check, Minus } from 'lucide-react';

export type CheckboxCheckedState = boolean | 'indeterminate';

export interface CheckboxProps {
  checked: CheckboxCheckedState;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  id,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = checked === 'indeterminate';
    }
  }, [checked]);

  const isChecked = checked === true;
  const isIndeterminate = checked === 'indeterminate';

  const handleClick = () => {
    if (disabled) return;
    onChange(checked !== true);
  };

  return (
    <label
      htmlFor={id}
      onClick={handleClick}
      className={`inline-flex items-center gap-2 select-none cursor-pointer text-xs font-sans text-text ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="checkbox"
        id={id}
        checked={isChecked}
        disabled={disabled}
        onChange={() => {}} // handled by wrapper label
        className="sr-only"
      />
      <div
        className={`w-4 h-4 rounded flex items-center justify-center transition-colors border ${
          isChecked || isIndeterminate
            ? 'bg-green border-green text-black'
            : 'bg-surface border-line hover:border-line-strong'
        }`}
        aria-hidden="true"
      >
        {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
        {isIndeterminate && <Minus className="w-3 h-3 stroke-[2.5]" />}
      </div>
      {label && <span className="text-muted hover:text-text">{label}</span>}
    </label>
  );
};
