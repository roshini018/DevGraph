import React from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs font-mono select-none ${className}`}>
      <ol className="flex items-center space-x-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isClickable = Boolean(item.href || item.onClick);

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <span className="text-subtle mx-1.5 select-none" aria-hidden="true">
                  /
                </span>
              )}
              {isClickable && !isLast ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="text-muted hover:text-text transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-green-bright rounded px-0.5"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={isLast ? 'text-text font-semibold' : 'text-muted'}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
