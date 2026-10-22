import React from 'react';
import { FileCode, ExternalLink } from 'lucide-react';
import type { Citation } from '../../types/api';
import { useAppStore } from '../../store/useAppStore';

export interface EvidenceCardProps {
  citation: Citation;
  onNavigate?: (filePath: string, line: number) => void;
  className?: string;
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  citation,
  onNavigate,
  className = '',
}) => {
  const { openFile } = useAppStore();

  const handleJump = () => {
    if (onNavigate) {
      onNavigate(citation.file_path, citation.start_line);
    } else {
      openFile(citation.file_path, citation.start_line, citation.end_line);
    }
  };

  return (
    <div
      className={`p-3 bg-surface border border-line hover:border-line-strong rounded-md font-sans transition-colors cursor-pointer group ${className}`}
      onClick={handleJump}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 truncate">
          <FileCode className="w-3.5 h-3.5 text-muted group-hover:text-green-bright transition-colors shrink-0" />
          <span className="font-mono text-xs text-text font-medium truncate group-hover:text-green-bright transition-colors">
            {citation.symbol}
          </span>
          <span className="text-[10px] font-mono text-subtle truncate">
            {citation.file_path}:{citation.start_line}-{citation.end_line}
          </span>
        </div>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handleJump();
          }}
          className="text-subtle hover:text-text p-1 rounded transition-colors"
          aria-label={`Jump to ${citation.symbol} at ${citation.file_path}:${citation.start_line}`}
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <pre className="p-2 rounded bg-ide border border-line font-mono text-[11px] text-muted overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {citation.snippet}
      </pre>

      {citation.sources && citation.sources.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {citation.sources.map((src, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-raised text-[10px] font-mono text-subtle border border-line"
            >
              {src}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
