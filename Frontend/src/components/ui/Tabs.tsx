import React from 'react';
import { Tooltip } from './Tooltip';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  tooltip?: string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      className={`flex items-center space-x-1 border-b border-transparent ${className}`}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        const isDisabled = tab.disabled;

        const buttonElement = (
          <button
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(tab.id)}
            className={`relative flex items-center gap-1.5 px-3 py-3 text-xs font-medium font-sans select-none transition-colors cursor-pointer disabled:cursor-not-allowed ${
              isActive
                ? 'text-text'
                : isDisabled
                ? 'text-subtle/50'
                : 'text-muted hover:text-text'
            }`}
          >
            {tab.icon && <span className="inline-flex shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-raised text-muted border border-line">
                {tab.badge}
              </span>
            )}
            {/* White underline on active tab */}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-sm"
                aria-hidden="true"
              />
            )}
          </button>
        );

        if (tab.tooltip) {
          return (
            <Tooltip key={tab.id} content={tab.tooltip} side="bottom">
              {buttonElement}
            </Tooltip>
          );
        }

        return <React.Fragment key={tab.id}>{buttonElement}</React.Fragment>;
      })}
    </div>
  );
};
