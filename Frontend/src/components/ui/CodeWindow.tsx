import React from 'react';
import { FileCode } from 'lucide-react';

export interface CodeWindowProps {
  filename?: string;
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const CodeWindow: React.FC<CodeWindowProps> = ({
  filename = 'main.py',
  tabs,
  activeTab = filename,
  onTabChange,
  children,
  className = '',
}) => {
  const tabList = tabs || [filename];

  return (
    <div
      className={`rounded-lg border border-line-strong bg-ide shadow-2xl overflow-hidden font-mono text-xs ${className}`}
    >
      {/* Window Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-line">
        {/* macOS / IDE Window Control Dots */}
        <div className="flex items-center gap-1.5 w-14">
          <span className="w-2.5 h-2.5 rounded-full bg-line-strong hover:bg-danger transition-colors cursor-pointer" />
          <span className="w-2.5 h-2.5 rounded-full bg-line-strong hover:bg-ember transition-colors cursor-pointer" />
          <span className="w-2.5 h-2.5 rounded-full bg-line-strong hover:bg-green-bright transition-colors cursor-pointer" />
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 justify-center max-w-md">
          {tabList.map(tab => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange?.(tab)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs select-none transition-colors ${
                  isActive
                    ? 'bg-ide text-text border border-line font-medium'
                    : 'text-subtle hover:text-muted hover:bg-raised'
                }`}
              >
                <FileCode className="w-3 h-3 text-subtle" />
                <span>{tab}</span>
              </button>
            );
          })}
        </div>

        {/* Window Meta */}
        <div className="w-14 text-right">
          <span className="text-[10px] text-subtle uppercase">Python</span>
        </div>
      </div>

      {/* Code Area */}
      <div className="p-4 overflow-x-auto leading-relaxed text-text font-mono text-xs">
        {children}
      </div>
    </div>
  );
};
