import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search, FileCode, GitFork, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { search } from '../../api/client';
import type { SearchMatch } from '../../types/api';

export interface SearchCommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchCommandDialog: React.FC<SearchCommandDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { selectedRepo, openFile } = useAppStore();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMatches([]);
      return;
    }

    let isMounted = true;
    if (query.trim()) {
      setLoading(true);
      search(query.trim())
        .then(res => {
          if (isMounted) setMatches(res.matches);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setMatches([]);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [query, isOpen]);

  // Global shortcut listener: ⌘K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const repoId = selectedRepo?.repo_name || 'my-store';

  const handleSelect = (match: SearchMatch) => {
    if (match.type === 'file' || match.type === 'code' || match.type === 'symbol') {
      openFile(match.file_path, match.line, match.line ? match.line + 2 : undefined);
      navigate(`/w/${repoId}`);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search Codebase"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/75 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-surface border border-line-strong rounded-lg shadow-2xl overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150">
        <Command
          className="flex flex-col bg-surface"
          shouldFilter={false} // our backend/client handles search matching
        >
          {/* Search Input Bar */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line bg-raised/40">
            <Search className="w-4 h-4 text-muted shrink-0" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search symbols, functions, files, or citations..."
              className="w-full bg-transparent text-sm text-text placeholder:text-subtle focus:outline-none"
            />
            {loading && (
              <span className="text-[10px] font-mono text-subtle animate-pulse">
                searching...
              </span>
            )}
            <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface text-[10px] font-mono text-subtle">
              ESC
            </kbd>
          </div>

          <Command.List className="overflow-y-auto max-h-80 p-2 space-y-1">
            {query.trim() && !loading && matches.length === 0 && (
              <Command.Empty className="px-4 py-8 text-center text-subtle text-xs">
                No matching symbols or files found for &ldquo;{query}&rdquo;
              </Command.Empty>
            )}

            {!query.trim() && (
              <div className="px-3 py-2 text-subtle text-xs space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-subtle">
                  Quick Actions
                </div>
                <div
                  onClick={() => {
                    navigate(`/w/${repoId}/graph`);
                    onClose();
                  }}
                  className="flex items-center justify-between p-2 rounded hover:bg-raised text-text cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GitFork className="w-3.5 h-3.5 text-muted" />
                    <span>Explore Dependency Graph</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-subtle" />
                </div>
                <div
                  onClick={() => {
                    navigate(`/w/${repoId}/impact`);
                    onClose();
                  }}
                  className="flex items-center justify-between p-2 rounded hover:bg-raised text-text cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="w-3.5 h-3.5 text-muted" />
                    <span>Run Blast Radius Impact Analysis</span>
                  </div>
                  <ArrowRight className="w-3 h-3 text-subtle" />
                </div>
              </div>
            )}

            {matches.map(match => (
              <Command.Item
                key={match.id}
                value={match.id}
                onSelect={() => handleSelect(match)}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded cursor-pointer transition-colors hover:bg-raised text-xs text-text"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <FileCode className="w-4 h-4 text-muted shrink-0" />
                  <div className="truncate">
                    <div className="font-medium text-text truncate">
                      {match.name}
                    </div>
                    <div className="text-[10px] font-mono text-subtle truncate">
                      {match.file_path}
                      {match.line ? `:${match.line}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised border border-line text-subtle uppercase">
                    {match.type}
                  </span>
                </div>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
