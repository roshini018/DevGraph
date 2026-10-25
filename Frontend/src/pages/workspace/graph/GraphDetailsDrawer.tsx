import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  FileCode,
  Copy,
  Check,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  ArrowRightLeft,
  Code2,
} from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';

export interface SelectedGraphItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'function' | 'class';
  summary?: string;
  symbols?: Array<{ name: string; kind: string; line: number }>;
  incoming: Array<{ source: string; file: string; line: number; kind: string; resolved?: boolean }>;
  outgoing: Array<{ target: string; file: string; line: number; kind: string; resolved?: boolean }>;
}

export interface GraphDetailsDrawerProps {
  item: SelectedGraphItem | null;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
}

export const GraphDetailsDrawer: React.FC<GraphDetailsDrawerProps> = ({
  item,
  onClose,
  onSelectNode,
}) => {
  const navigate = useNavigate();
  const {
    openFile,
    setActiveFile,
    setImpactTargets,
    setMultiSelection,
    selectedRepo,
    setRightOpen,
  } = useAppStore();

  const repoId = selectedRepo?.full_name || selectedRepo?.id || selectedRepo?.repo_name || 'default';

  const [copied, setCopied] = useState(false);
  const [descLoading, setDescLoading] = useState(true);

  // Brief skeleton loader for AI description
  useEffect(() => {
    if (item) {
      setDescLoading(true);
      const timer = setTimeout(() => setDescLoading(false), 220);
      return () => clearTimeout(timer);
    }
  }, [item?.id]);

  if (!item) return null;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenCode = () => {
    openFile(item.path, 1);
    navigate(`/w/${encodeURIComponent(repoId)}`);
  };

  const handleAskAI = () => {
    setActiveFile(item.path);
    setRightOpen(true);
  };

  const handleImpact = () => {
    const targetSymbol = item.symbols?.[0]?.name || item.name.replace('.py', '');
    setImpactTargets([targetSymbol]);
    navigate(`/w/${encodeURIComponent(repoId)}/impact`);
  };

  const handleCompare = () => {
    setMultiSelection([item.path]);
    navigate(`/w/${encodeURIComponent(repoId)}/connections?source=${encodeURIComponent(item.path)}`);
  };

  return (
    <div className="w-80 h-full bg-surface border-l border-line flex flex-col shrink-0 select-none overflow-hidden font-sans shadow-2xl z-20 animate-in slide-in-from-right-4 duration-150">
      {/* Header */}
      <div className="h-10 px-3.5 border-b border-line flex items-center justify-between shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-green-bright" />
          <span className="font-semibold text-text text-xs tracking-tight truncate max-w-[190px]">
            {item.name}
          </span>
          <Badge variant="neutral">
            {item.type}
          </Badge>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-subtle hover:text-text p-1 rounded transition-colors"
          aria-label="Close details drawer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
        {/* Path with Copy */}
        <div className="space-y-1">
          <div className="text-[10px] font-mono uppercase text-subtle tracking-wider">
            File Path
          </div>
          <div className="flex items-center justify-between gap-2 p-2 rounded bg-raised border border-line font-mono text-[11px] text-muted">
            <span className="truncate">{item.path}</span>
            <button
              type="button"
              onClick={handleCopyPath}
              className="text-subtle hover:text-text p-1 rounded shrink-0 transition-colors"
              title="Copy path"
            >
              {copied ? (
                <Check className="w-3 h-3 text-green-bright" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* AI-Generated Description */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-green-bright tracking-wider">
            <Sparkles className="w-3 h-3" />
            <span>AI-generated description</span>
          </div>

          <div className="p-2.5 rounded bg-ide border border-line text-xs text-muted leading-relaxed">
            {descLoading ? (
              <div className="space-y-1.5 py-0.5">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-4/5 rounded" />
              </div>
            ) : (
              item.summary ||
              `${item.name} module participates in AST call graph resolution with verified static symbol declarations.`
            )}
          </div>
        </div>

        {/* Contained Symbols */}
        {item.symbols && item.symbols.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-subtle tracking-wider">
              <span>Contained Symbols</span>
              <span>{item.symbols.length}</span>
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto font-mono text-xs">
              {item.symbols.map((sym, i) => (
                <div
                  key={i}
                  className="p-1.5 rounded bg-raised/70 border border-line flex items-center justify-between text-muted"
                >
                  <span className="truncate text-text font-medium">{sym.name}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-subtle">
                    <span>{sym.kind}</span>
                    <span>:{sym.line}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incoming Relationships (Click selects node; unresolved shown dashed) */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase text-subtle tracking-wider flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3 text-green-bright" />
            <span>Incoming ({item.incoming.length})</span>
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto font-mono text-xs">
            {item.incoming.length === 0 ? (
              <div className="text-subtle text-[11px] p-1">No incoming callers</div>
            ) : (
              item.incoming.map((rel, i) => (
                <div
                  key={i}
                  onClick={() => onSelectNode(rel.file)}
                  className={`p-1.5 rounded bg-raised hover:bg-raised/80 border cursor-pointer flex items-center justify-between transition-colors ${
                    rel.resolved === false
                      ? 'border-dashed border-subtle text-subtle'
                      : 'border-line text-muted hover:text-text'
                  }`}
                >
                  <div className="truncate">
                    <span className="text-green-bright font-medium">{rel.source}</span>
                    <span className="text-subtle text-[10px] ml-1">({rel.kind})</span>
                  </div>
                  <span className="text-[10px] text-subtle shrink-0">
                    {rel.file.split('/').pop()}:{rel.line}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Outgoing Relationships */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase text-subtle tracking-wider flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-slate" />
            <span>Outgoing ({item.outgoing.length})</span>
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto font-mono text-xs">
            {item.outgoing.length === 0 ? (
              <div className="text-subtle text-[11px] p-1">No outgoing dependencies</div>
            ) : (
              item.outgoing.map((rel, i) => (
                <div
                  key={i}
                  onClick={() => onSelectNode(rel.file)}
                  className={`p-1.5 rounded bg-raised hover:bg-raised/80 border cursor-pointer flex items-center justify-between transition-colors ${
                    rel.resolved === false
                      ? 'border-dashed border-subtle text-subtle'
                      : 'border-line text-muted hover:text-text'
                  }`}
                >
                  <div className="truncate">
                    <span className="text-text font-medium">{rel.target}</span>
                    <span className="text-subtle text-[10px] ml-1">({rel.kind})</span>
                  </div>
                  <span className="text-[10px] text-subtle shrink-0">
                    {rel.file.split('/').pop()}:{rel.line}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-line space-y-2">
          <Button
            variant="white"
            size="sm"
            onClick={handleOpenCode}
            className="w-full text-xs"
            leftIcon={<Code2 className="w-3.5 h-3.5" />}
          >
            Open code
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleAskAI}
            className="w-full text-xs"
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-green-bright" />}
          >
            Ask AI
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleImpact}
            className="w-full text-xs"
            leftIcon={<ShieldAlert className="w-3.5 h-3.5 text-terracotta" />}
          >
            What if I change this?
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCompare}
            className="w-full text-xs"
            leftIcon={<ArrowRightLeft className="w-3.5 h-3.5 text-slate" />}
          >
            Compare with another file
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GraphDetailsDrawer;
