import React, { useState } from 'react';
import {
  FileCode,
  Box,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Route,
  Sparkles,
  AlertTriangle,
  Beaker,
  FolderGit2,
} from 'lucide-react';
import type { EnrichedFinding } from './types';

interface ImpactFindingsTabProps {
  findings: EnrichedFinding[];
  affectedModules: Array<{ path: string; count: number }>;
  targets: string[];
  selectedNodeId?: string | null;
  onOpenSource: (filePath: string, startLine: number, endLine: number) => void;
  onViewPath: (sourceId: string, targetId: string) => void;
  onAskAI: (question: string) => void;
}

export const ImpactFindingsTab: React.FC<ImpactFindingsTabProps> = ({
  findings,
  affectedModules,
  targets,
  selectedNodeId,
  onOpenSource,
  onViewPath,
  onAskAI,
}) => {
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(new Set());

  const toggleSnippet = (id: string) => {
    setExpandedSnippets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const direct = findings.filter(f => !f.is_test && f.distance === 1);
  const indirect = findings.filter(f => !f.is_test && f.distance > 1);
  const tests = findings.filter(f => f.is_test);

  const getKindIcon = (kind: string, isTest: boolean) => {
    if (isTest) return <Beaker className="w-3.5 h-3.5 text-muted shrink-0" />;
    if (kind === 'class') return <Layers className="w-3.5 h-3.5 text-slate shrink-0" />;
    return <Box className="w-3.5 h-3.5 text-green-bright shrink-0" />;
  };

  const renderFindingRow = (f: EnrichedFinding) => {
    const isExpanded = expandedSnippets.has(f.id);
    const isSelected = selectedNodeId === f.id;

    return (
      <div
        key={f.id}
        id={`finding-${f.id}`}
        className={`p-3.5 rounded-lg border transition-colors ${
          isSelected
            ? 'bg-raised border-green-bright/60 ring-1 ring-green-bright/30'
            : 'bg-surface border-line hover:border-line-strong'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {getKindIcon(f.kind, f.is_test)}
            <span className="font-mono text-xs font-bold text-text truncate">
              {f.symbol}
            </span>
            <span className="text-[11px] font-mono text-subtle">
              {f.file}:{f.start_line}-{f.end_line}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Distance Chip */}
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border ${
                f.is_test
                  ? 'bg-raised text-muted border-line'
                  : f.distance === 1
                  ? 'bg-terracotta/15 text-terracotta border-terracotta/40'
                  : 'bg-terracotta/10 text-terracotta/80 border-terracotta/30'
              }`}
            >
              {f.is_test ? 'Test' : f.distance === 1 ? 'Direct (Hop 1)' : `Hop ${f.distance}`}
            </span>

            {/* Unresolved warning */}
            {f.has_unresolved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ember/15 text-ember text-[10px] font-mono font-semibold border border-ember/30">
                <AlertTriangle className="w-3 h-3" />
                <span>Unresolved dynamic call</span>
              </span>
            )}
          </div>
        </div>

        {/* Relationship & Why it may be affected */}
        <div className="mt-2 text-xs font-mono text-muted space-y-1">
          <div className="text-text font-medium flex items-center gap-1.5">
            <span className="text-subtle">Relationship:</span>
            <span>{f.relationship}</span>
          </div>
          <div className="text-subtle text-[11px] leading-relaxed">
            <span className="text-muted font-medium">Potential Impact:</span> {f.why_affected}
          </div>
        </div>

        {/* Action Buttons & Snippet Toggle */}
        <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenSource(f.file, f.start_line, f.end_line)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-raised hover:bg-line text-[11px] font-mono text-subtle hover:text-text transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open source</span>
            </button>

            <button
              type="button"
              onClick={() => onViewPath(f.id, targets[0] || '')}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-raised hover:bg-line text-[11px] font-mono text-subtle hover:text-text transition-colors"
            >
              <Route className="w-3 h-3" />
              <span>View path</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onAskAI(
                  `What might break in ${f.symbol} (${f.file}) if I modify ${targets.join(', ')}?`
                )
              }
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-raised hover:bg-line text-[11px] font-mono text-subtle hover:text-green-bright transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Ask AI</span>
            </button>
          </div>

          {f.snippet && (
            <button
              type="button"
              onClick={() => toggleSnippet(f.id)}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-subtle hover:text-text transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Hide snippet</span>
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>View snippet</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Expandable Snippet */}
        {isExpanded && f.snippet && (
          <div className="mt-3 p-3 rounded bg-ide border border-line font-mono text-[11px] text-muted overflow-x-auto leading-relaxed whitespace-pre animate-in fade-in-50 duration-100">
            {f.snippet}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Group 1: Direct Dependents */}
      {direct.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle font-semibold border-b border-line pb-1.5">
            <span>Direct Dependents ({direct.length})</span>
            <span className="text-[10px] text-terracotta">Immediate Callers (Hop 1)</span>
          </div>
          <div className="space-y-2.5">{direct.map(renderFindingRow)}</div>
        </div>
      )}

      {/* Group 2: Indirect Dependents */}
      {indirect.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle font-semibold border-b border-line pb-1.5">
            <span>Indirect Dependents ({indirect.length})</span>
            <span className="text-[10px] text-terracotta/70">Transitive Callers (Hop 2+)</span>
          </div>
          <div className="space-y-2.5">{indirect.map(renderFindingRow)}</div>
        </div>
      )}

      {/* Group 3: Related Tests */}
      {tests.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle font-semibold border-b border-line pb-1.5">
            <span className="flex items-center gap-1.5">
              <Beaker className="w-3.5 h-3.5 text-muted" />
              <span>Related Tests ({tests.length})</span>
            </span>
            <span className="text-[10px] text-green">Covers This Change</span>
          </div>
          <div className="space-y-2.5">{tests.map(renderFindingRow)}</div>
        </div>
      )}

      {/* Group 4: Affected Modules */}
      {affectedModules.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle font-semibold border-b border-line pb-1.5">
            <span className="flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-muted" />
              <span>Affected Modules ({affectedModules.length})</span>
            </span>
            <span className="text-[10px] text-subtle">Unique Impacted Files</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {affectedModules.map(mod => (
              <div
                key={mod.path}
                className="p-2.5 rounded bg-surface border border-line flex items-center justify-between font-mono text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-muted shrink-0" />
                  <span className="text-text truncate" title={mod.path}>
                    {mod.path}
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-raised text-[10px] text-subtle border border-line shrink-0">
                  {mod.count} symbol{mod.count === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
