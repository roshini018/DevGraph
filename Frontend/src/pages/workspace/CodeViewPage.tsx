import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  X,
  FileCode,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getFile, getGraph } from '../../api/client';
import type { FileContent, GraphNode, GraphEdge } from '../../types/api';
import { MOCK_SYMBOLS } from '../../mocks/repo';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Badge } from '../../components/ui/Badge';

// Comprehensive Callers and Callees Graph Data for the codebase symbols
interface RelationInfo {
  symbol: string;
  file: string;
  line: number;
  kind: 'calls' | 'called_by' | 'imports' | 'inherits' | 'defines';
}

interface SymbolGraphRelations {
  callers: RelationInfo[];
  callees: RelationInfo[];
  unresolved: Array<{ symbol: string; line: number; reason: string }>;
}

const SYMBOL_RELATIONS: Record<string, SymbolGraphRelations> = {
  place_order: {
    callers: [
      { symbol: 'test_place_order_success', file: 'tests/test_orders.py', line: 12, kind: 'called_by' },
      { symbol: 'test_place_order_invalid_amount', file: 'tests/test_orders.py', line: 28, kind: 'called_by' },
    ],
    callees: [
      { symbol: 'validate_uuid', file: 'src/utils/validators.py', line: 15, kind: 'calls' },
      { symbol: 'create_order', file: 'src/services/order_service.py', line: 22, kind: 'calls' },
    ],
    unresolved: [],
  },
  create_order: {
    callers: [
      { symbol: 'place_order', file: 'src/api/orders.py', line: 36, kind: 'called_by' },
    ],
    callees: [
      { symbol: 'validate_amount', file: 'src/utils/validators.py', line: 28, kind: 'calls' },
      { symbol: 'reserve_stock', file: 'src/services/inventory_service.py', line: 18, kind: 'calls' },
      { symbol: 'charge_payment', file: 'src/services/payment_service.py', line: 25, kind: 'calls' },
      { symbol: 'Order', file: 'src/models/order.py', line: 10, kind: 'inherits' },
    ],
    unresolved: [],
  },
  charge_payment: {
    callers: [
      { symbol: 'create_order', file: 'src/services/order_service.py', line: 42, kind: 'called_by' },
      { symbol: 'test_payment_flow', file: 'tests/test_payment.py', line: 16, kind: 'called_by' },
    ],
    callees: [
      { symbol: 'validate_amount', file: 'src/utils/validators.py', line: 32, kind: 'calls' },
      { symbol: 'Payment', file: 'src/models/payment.py', line: 12, kind: 'calls' },
      { symbol: 'send_notification', file: 'src/services/notification_service.py', line: 14, kind: 'calls' },
    ],
    unresolved: [
      { symbol: 'stripe.Charge.create', line: 34, reason: 'External third-party SDK call' },
      { symbol: 'uuid.uuid4', line: 38, reason: 'Standard library runtime primitive' },
    ],
  },
  validate_amount: {
    callers: [
      { symbol: 'create_order', file: 'src/services/order_service.py', line: 26, kind: 'called_by' },
      { symbol: 'charge_payment', file: 'src/services/payment_service.py', line: 28, kind: 'called_by' },
      { symbol: 'test_validate_amount', file: 'tests/test_validators.py', line: 8, kind: 'called_by' },
    ],
    callees: [],
    unresolved: [],
  },
  reserve_stock: {
    callers: [
      { symbol: 'create_order', file: 'src/services/order_service.py', line: 35, kind: 'called_by' },
    ],
    callees: [],
    unresolved: [],
  },
  send_notification: {
    callers: [
      { symbol: 'charge_payment', file: 'src/services/payment_service.py', line: 48, kind: 'called_by' },
    ],
    callees: [],
    unresolved: [
      { symbol: 'smtplib.SMTP', line: 22, reason: 'External network transport protocol' },
    ],
  },
};

export const CodeViewPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    openTabs,
    activeFile,
    closeTab,
    setActiveFile,
    openFile,
    highlightRange,
    clearHighlightRange,
    selectedRepo,
    addMessage,
    setRightOpen,
  } = useAppStore();

  // Prefer full_name ("owner/repo") as the repo identifier because the backend
  // _resolve_public_repo understands owner/repo slugs natively.  Numeric GitHub
  // IDs (which selectedRepo.id previously held for OAuth repos) are NOT
  // resolvable by the backend and produced 404 errors.
  const { repoId: routeRepoId } = useParams<{ repoId: string }>();
  const repoId = routeRepoId
    ? decodeURIComponent(routeRepoId)
    : selectedRepo?.full_name || selectedRepo?.id || selectedRepo?.repo_name || 'my-store';
  const orgName = selectedRepo?.full_name?.split('/')[0] || 'acme';
  const isMockDemo = repoId === 'my-store' || repoId === 'repo-1' || repoId === 'default';

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    let isMounted = true;
    if (repoId) {
      getGraph(repoId, 'symbol').then(res => {
        if (isMounted) setGraphData(res);
      }).catch(() => {});
    }
    return () => { isMounted = false; };
  }, [repoId]);

  const [fileData, setFileData] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active line in editor (for left marker and active status)
  const [activeLine, setActiveLine] = useState<number>(4);

  // Gutter popover state
  const [gutterPopover, setGutterPopover] = useState<{
    symbolName: string;
    line: number;
    x: number;
    y: number;
  } | null>(null);

  // Function right-click context menu
  const [funcContextMenu, setFuncContextMenu] = useState<{
    symbolName: string;
    line: number;
    x: number;
    y: number;
  } | null>(null);

  // Bottom Panel State (200px collapsible)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<'callers' | 'callees' | 'unresolved'>('callers');
  const [activeFunctionSymbol, setActiveFunctionSymbol] = useState<string>(isMockDemo ? 'place_order' : '');

  // Ref to code lines container for smooth auto-scroll on openFile
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Dismiss context menus on outside click or escape
  useEffect(() => {
    function handleOutside() {
      setGutterPopover(null);
      setFuncContextMenu(null);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setGutterPopover(null);
        setFuncContextMenu(null);
      }
    }
    window.addEventListener('click', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Fetch file content when activeFile changes
  useEffect(() => {
    if (!activeFile) {
      setFileData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getFile(activeFile, repoId)
      .then(f => {
        if (isMounted) {
          setFileData(f);
          // Set first symbol as active function if available
          if (f.symbols && f.symbols.length > 0) {
            setActiveFunctionSymbol(f.symbols[0]);
          } else if (isMockDemo) {
            setActiveFunctionSymbol('place_order');
          } else {
            setActiveFunctionSymbol('');
          }
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg =
            err && typeof err === 'object' && 'error' in err
              ? (err as { error: { message: string } }).error.message
              : err instanceof Error
              ? err.message
              : 'Failed to read file content';
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeFile, repoId]);

  // Handle openFile target scrolling & brief highlight
  useEffect(() => {
    if (!highlightRange) return;

    const targetLine = highlightRange.startLine;
    setActiveLine(targetLine);

    // Scroll line into view
    setTimeout(() => {
      const el = lineRefs.current.get(targetLine);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);

    // Fade highlight after 2.5 seconds
    const timer = setTimeout(() => {
      clearHighlightRange();
    }, 2500);

    return () => clearTimeout(timer);
  }, [highlightRange, clearHighlightRange]);

  // Format Python code lines with syntax styling (no purple)
  const renderSyntaxLine = (text: string, _lineNum?: number) => {
    // 1. Comments
    if (text.trim().startsWith('#')) {
      return <span className="text-subtle italic">{text}</span>;
    }

    // 2. Docstrings
    if (text.trim().startsWith('"""') || text.trim().startsWith("'''")) {
      return <span className="text-muted italic">{text}</span>;
    }

    // Keyword tokens
    const keywords = [
      'def',
      'class',
      'return',
      'import',
      'from',
      'if',
      'else',
      'elif',
      'for',
      'while',
      'try',
      'except',
      'finally',
      'with',
      'as',
      'async',
      'await',
      'lambda',
      'raise',
      'pass',
      'yield',
      'None',
      'True',
      'False',
    ];

    // Simple robust tokenizer for AST styling
    const parts = text.split(/(\bdef\b|\bclass\b|\breturn\b|\bimport\b|\bfrom\b|\bif\b|\belse\b|\bas\b|\btry\b|\bexcept\b|"[^"]*"|'[^']*'|#[^\n]*)/g);

    return (
      <span>
        {parts.map((part, i) => {
          if (keywords.includes(part)) {
            return (
              <span key={i} className="text-terracotta font-medium">
                {part}
              </span>
            );
          }
          if (part.startsWith('"') || part.startsWith("'")) {
            return (
              <span key={i} className="text-ember">
                {part}
              </span>
            );
          }
          if (part.startsWith('#')) {
            return (
              <span key={i} className="text-subtle italic">
                {part}
              </span>
            );
          }
          // Highlight type hints like Dict, Any, int, str
          if (/\b(Dict|Any|List|Optional|str|int|float|bool|Tuple)\b/.test(part)) {
            return (
              <span key={i} className="text-slate">
                {part}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  // Check if line defines a function
  const getFunctionAtLine = (lineNum: number) => {
    if (isMockDemo) {
      const sym = MOCK_SYMBOLS.find(
        s => s.file === activeFile && (s.kind === 'function' || s.kind === 'method') && s.start_line === lineNum
      );
      if (!sym) return null;
      return { name: sym.label, kind: sym.kind, start_line: sym.start_line || lineNum };
    }
    const currentPath = activeFile || '';
    const sym = graphData.nodes.find(
      n => (n.file === currentPath || currentPath.endsWith(n.file || '')) &&
           (n.kind === 'function' || n.kind === 'method' || n.kind === 'class') &&
           n.start_line === lineNum
    );
    if (!sym) return null;
    return { name: sym.label, kind: sym.kind, start_line: sym.start_line || lineNum };
  };

  // Active function relations (must be defined BEFORE any early returns so Hook count is invariant)
  const currentRelations = useMemo<{
    callers: RelationInfo[];
    callees: RelationInfo[];
    unresolved: Array<{ symbol: string; line: number; reason: string }>;
  }>(() => {
    if (isMockDemo) {
      return (
        (SYMBOL_RELATIONS[activeFunctionSymbol] as {
          callers: RelationInfo[];
          callees: RelationInfo[];
          unresolved: Array<{ symbol: string; line: number; reason: string }>;
        }) || {
          callers: [],
          callees: [],
          unresolved: [],
        }
      );
    }
    const callers: RelationInfo[] = [];
    const callees: RelationInfo[] = [];
    const unresolved: Array<{ symbol: string; line: number; reason: string }> = [];

    const activeNode = graphData.nodes.find(
      n => n.label === activeFunctionSymbol || n.id.endsWith(`:${activeFunctionSymbol}`)
    );
    const activeId = activeNode?.id || activeFunctionSymbol;

    graphData.edges.forEach(e => {
      if (e.target === activeId || e.target.endsWith(`:${activeFunctionSymbol}`) || e.target === activeFunctionSymbol) {
        const srcNode = graphData.nodes.find(n => n.id === e.source);
        callers.push({
          symbol: srcNode?.label || e.source.split(':').pop() || e.source,
          file: srcNode?.file || 'unknown',
          line: e.line || srcNode?.start_line || 1,
          kind: e.kind || 'calls',
        });
      }
      if (e.source === activeId || e.source.endsWith(`:${activeFunctionSymbol}`) || e.source === activeFunctionSymbol) {
        const tgtNode = graphData.nodes.find(n => n.id === e.target);
        callees.push({
          symbol: tgtNode?.label || e.target.split(':').pop() || e.target,
          file: tgtNode?.file || 'unknown',
          line: e.line || tgtNode?.start_line || 1,
          kind: e.kind || 'calls',
        });
      }
      if (!e.resolved && (e.source === activeId || e.target === activeId)) {
        unresolved.push({
          symbol: e.target.split(':').pop() || e.target,
          line: e.line || 1,
          reason: 'Dynamic invocation or unresolved import',
        });
      }
    });

    return { callers, callees, unresolved };
  }, [isMockDemo, activeFunctionSymbol, graphData.nodes, graphData.edges]);

  // State: No file open
  if (openTabs.length === 0 || !activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-ide">
        <EmptyState
          title="No file opened"
          description="Select a Python file from the left explorer to view AST symbols and dependencies."
        />
      </div>
    );
  }

  // State: Loading
  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full bg-ide p-6 space-y-4">
        <Skeleton className="h-9 w-72 rounded" />
        <Skeleton className="h-6 w-96 rounded" />
        <Skeleton className="h-16 w-full rounded" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      </div>
    );
  }

  // State: Error
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-ide">
        <ErrorState
          title="Could not load file"
          whatHappened={error}
          nextStep="Select another file from the left explorer tree."
          onRetry={() => {
            if (activeFile) openFile(activeFile);
          }}
        />
      </div>
    );
  }

  const lines = fileData?.content ? fileData.content.split('\n') : [];
  const fileName = activeFile.split('/').pop() || activeFile;
  const isFileTooLarge = (fileData?.size_bytes || 0) > 100000 || lines.length > 2000;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-ide text-text font-sans select-none relative">
      {/* 1. TAB STRIP OF OPEN FILES (active tab has a white hairline) */}
      <div
        role="tablist"
        aria-label="Open Files"
        className="h-9 bg-surface border-b border-line flex items-center overflow-x-auto shrink-0 px-1 gap-1 select-none"
      >
        {openTabs.map(tab => {
          const isActive = tab === activeFile;
          const tabName = tab.split('/').pop() || tab;

          return (
            <div
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveFile(tab)}
              className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-mono cursor-pointer transition-colors relative select-none shrink-0 ${
                isActive
                  ? 'bg-ide text-text font-semibold border-b border-text'
                  : 'bg-surface text-subtle hover:text-muted hover:bg-raised'
              }`}
            >
              <FileCode
                className={`w-3.5 h-3.5 ${
                  isActive ? 'text-green-bright' : 'text-slate'
                } shrink-0`}
              />
              <span className="truncate max-w-[180px]">{tabName}</span>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  closeTab(tab);
                }}
                className="text-subtle hover:text-text p-0.5 rounded transition-colors ml-1"
                aria-label={`Close ${tabName}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Main Code Editor & Panels Column */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Editor Sub-Header: Slash breadcrumb path & File title */}
        <div className="px-5 pt-3.5 pb-2 border-b border-line bg-surface/30 shrink-0 space-y-1">
          {/* 2. Slash Breadcrumb Path */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-subtle truncate">
            <span>{orgName}</span>
            <span className="text-subtle">/</span>
            <span>{repoId}</span>
            {activeFile.split('/').map((seg, idx) => (
              <React.Fragment key={idx}>
                <span className="text-subtle">/</span>
                <span className={idx === activeFile.split('/').length - 1 ? 'text-text font-medium' : ''}>
                  {seg}
                </span>
              </React.Fragment>
            ))}
          </div>

          {/* 3. File Title: Geist 20px */}
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-semibold tracking-tight text-text">
              {fileName}
            </h1>

            <div className="flex items-center gap-2 text-xs font-mono text-subtle">
              <span>{fileData?.lines || lines.length} lines</span>
              <span>•</span>
              <span>{fileData?.language || 'Python'}</span>
              <span>•</span>
              {isMockDemo ? (
                <span className="text-green-bright font-medium">AST Indexed</span>
              ) : (
                <span className="text-subtle font-medium">GitHub Source</span>
              )}
            </div>
          </div>
        </div>

        {/* 4. 'AI-generated summary' strip (raised background, small label) */}
        {fileData?.summary && (
          <div className="mx-4 my-2.5 p-3 rounded-md bg-raised border border-line flex items-start gap-2.5 shrink-0 text-xs shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-green-bright shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5 min-w-0">
              <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-green-bright">
                AI-generated summary
              </div>
              <p className="text-muted leading-relaxed text-xs">
                {fileData.summary}
              </p>
            </div>
          </div>
        )}

        {/* State: File too large banner if applicable */}
        {isFileTooLarge && (
          <div className="mx-4 mb-2 p-2.5 rounded bg-amber/10 border border-amber/30 text-xs text-amber flex items-center justify-between font-mono shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Large file detected (&gt; 100KB). Displaying virtualized AST preview.</span>
            </div>
            <Badge variant="warning">Truncated</Badge>
          </div>
        )}

        {/* 5. Code Area: Geist Mono, line numbers in subtle, active line with green left marker */}
        <div className="flex-1 overflow-auto bg-ide font-mono text-xs leading-relaxed select-text relative">
          <div className="py-2 min-w-full">
            {lines.map((lineContent, idx) => {
              const lineNum = idx + 1;
              const isHighlighted =
                highlightRange &&
                lineNum >= highlightRange.startLine &&
                lineNum <= highlightRange.endLine;
              const isSelectedActive = activeLine === lineNum;
              const funcSymbol = getFunctionAtLine(lineNum);
              const relations = funcSymbol ? SYMBOL_RELATIONS[funcSymbol.name] : null;

              return (
                <div
                  key={lineNum}
                  ref={el => {
                    if (el) lineRefs.current.set(lineNum, el);
                    else lineRefs.current.delete(lineNum);
                  }}
                  onClick={() => {
                    setActiveLine(lineNum);
                    if (funcSymbol) {
                      setActiveFunctionSymbol(funcSymbol.name);
                    }
                  }}
                  onContextMenu={e => {
                    if (funcSymbol) {
                      e.preventDefault();
                      setFuncContextMenu({
                        symbolName: funcSymbol.name,
                        line: lineNum,
                        x: Math.min(e.clientX, window.innerWidth - 220),
                        y: Math.min(e.clientY, window.innerHeight - 200),
                      });
                    }
                  }}
                  className={`flex items-start transition-colors relative group select-text ${
                    isHighlighted
                      ? 'bg-green-soft/80 border-l-2 border-green-bright animate-pulse'
                      : isSelectedActive
                      ? 'bg-raised/40 border-l-2 border-green-bright'
                      : 'border-l-2 border-transparent hover:bg-raised/20'
                  }`}
                >
                  {/* Line Number in subtle */}
                  <div className="w-12 text-right pr-3 pl-2 py-0.5 text-subtle font-mono text-[11px] select-none shrink-0 group-hover:text-muted">
                    {lineNum}
                  </div>

                  {/* Gutter Marker beside each function: 'called by N / calls M' */}
                  <div className="w-32 shrink-0 py-0.5 select-none pr-2">
                    {funcSymbol && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setGutterPopover({
                            symbolName: funcSymbol.name,
                            line: lineNum,
                            x: Math.min(e.clientX, window.innerWidth - 280),
                            y: Math.min(e.clientY, window.innerHeight - 280),
                          });
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface hover:bg-raised border border-line hover:border-line-strong text-[9px] font-mono text-subtle hover:text-text cursor-pointer transition-colors"
                        title={`View callers and callees for ${funcSymbol.name}`}
                      >
                        <span className="text-green-bright">
                          ↓{relations?.callers.length ?? 0}
                        </span>
                        <span>/</span>
                        <span className="text-slate">
                          ↑{relations?.callees.length ?? 0}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Code Line Content with syntax highlighting */}
                  <div className="flex-1 py-0.5 pr-4 whitespace-pre font-mono text-text overflow-visible">
                    {renderSyntaxLine(lineContent, lineNum)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Function Gutter Popover (Callers & Callees list) */}
        {gutterPopover && (
          <div
            style={{ top: `${gutterPopover.y}px`, left: `${gutterPopover.x}px` }}
            onClick={e => e.stopPropagation()}
            className="fixed z-50 w-72 bg-surface border border-line-strong rounded-lg shadow-2xl p-3 font-sans text-xs space-y-3 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="font-mono font-semibold text-text truncate">
                {gutterPopover.symbolName}
              </div>
              <Badge variant="success">AST Resolved</Badge>
            </div>

            {/* Callers List */}
            <div className="space-y-1.5 font-mono text-xs">
              <div className="text-[10px] uppercase font-semibold text-subtle flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-green-bright" />
                <span>Callers ({SYMBOL_RELATIONS[gutterPopover.symbolName]?.callers.length ?? 0})</span>
              </div>
              {SYMBOL_RELATIONS[gutterPopover.symbolName]?.callers.map((c, i) => (
                <div
                  key={i}
                  onClick={() => {
                    openFile(c.file, c.line);
                    setGutterPopover(null);
                  }}
                  className="p-1.5 rounded bg-raised hover:bg-raised/80 border border-line cursor-pointer flex items-center justify-between text-muted hover:text-text transition-colors"
                >
                  <span className="truncate text-green-bright font-medium">{c.symbol}</span>
                  <span className="text-[10px] text-subtle truncate">{c.file}:{c.line}</span>
                </div>
              ))}
            </div>

            {/* Callees List */}
            <div className="space-y-1.5 font-mono text-xs pt-1">
              <div className="text-[10px] uppercase font-semibold text-subtle flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-slate" />
                <span>Calls ({SYMBOL_RELATIONS[gutterPopover.symbolName]?.callees.length ?? 0})</span>
              </div>
              {SYMBOL_RELATIONS[gutterPopover.symbolName]?.callees.map((c, i) => (
                <div
                  key={i}
                  onClick={() => {
                    openFile(c.file, c.line);
                    setGutterPopover(null);
                  }}
                  className="p-1.5 rounded bg-raised hover:bg-raised/80 border border-line cursor-pointer flex items-center justify-between text-muted hover:text-text transition-colors"
                >
                  <span className="truncate text-text font-medium">{c.symbol}</span>
                  <span className="text-[10px] text-subtle truncate">{c.file}:{c.line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Function Right-Click Context Menu */}
        {funcContextMenu && (
          <div
            style={{ top: `${funcContextMenu.y}px`, left: `${funcContextMenu.x}px` }}
            onClick={e => e.stopPropagation()}
            className="fixed z-50 w-52 bg-surface border border-line-strong rounded-md shadow-2xl p-1 font-mono text-xs divide-y divide-line select-none animate-in fade-in duration-100"
          >
            <div className="px-2 py-1.5 text-[10px] font-semibold text-subtle uppercase">
              Function: {funcContextMenu.symbolName}
            </div>

            <div className="p-1 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  navigate(`/w/${encodeURIComponent(repoId)}/connections?source=${encodeURIComponent(funcContextMenu.symbolName)}`);
                  setFuncContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-raised text-text transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-slate" />
                <span>How is this connected?</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate(`/w/${encodeURIComponent(repoId)}/impact`);
                  setFuncContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-raised text-text transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-terracotta" />
                <span>What if I change this?</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  addMessage({
                    sender: 'user',
                    content: `How is function ${funcContextMenu.symbolName} connected in the architecture and what are its dependencies?`,
                  });
                  setRightOpen(true);
                  setFuncContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-raised text-green-bright transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-green-bright" />
                <span>Ask AI</span>
              </button>
            </div>
          </div>
        )}

        {/* 6. BOTTOM PANEL (collapsible, 200px, IDE console tabs: Callers | Callees | Unresolved) */}
        <div
          className={`border-t border-line bg-surface flex flex-col shrink-0 transition-all duration-200 select-none ${
            bottomPanelOpen ? 'h-48' : 'h-8'
          }`}
        >
          {/* Bottom Panel Console Header */}
          <div className="h-8 px-3 border-b border-line flex items-center justify-between bg-surface shrink-0 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-subtle mr-2 flex items-center gap-1">
                <Terminal className="w-3 h-3 text-slate" />
                <span>AST Graph Console</span>
              </span>

              {/* Tabs: Callers | Callees | Unresolved */}
              {(['callers', 'callees', 'unresolved'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setBottomTab(tab);
                    if (!bottomPanelOpen) setBottomPanelOpen(true);
                  }}
                  className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                    bottomTab === tab && bottomPanelOpen
                      ? 'bg-raised text-text font-semibold border border-line'
                      : 'text-subtle hover:text-muted'
                  }`}
                >
                  {tab} (
                  {tab === 'callers'
                    ? currentRelations.callers.length
                    : tab === 'callees'
                    ? currentRelations.callees.length
                    : currentRelations.unresolved.length}
                  )
                </button>
              ))}
            </div>

            {/* Right Controls: active function name & toggle expand */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">
                {isMockDemo ? (
                  <>
                    Active: <span className="text-green-bright font-semibold">{activeFunctionSymbol}</span>
                  </>
                ) : (
                  <span className="text-subtle">Real Repository Code</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setBottomPanelOpen(prev => !prev)}
                className="text-subtle hover:text-text p-1 rounded"
                aria-label={bottomPanelOpen ? 'Collapse console' : 'Expand console'}
              >
                {bottomPanelOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Bottom Panel Content Body */}
          {bottomPanelOpen && (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs bg-ide">
              {/* TAB 1: CALLERS */}
              {bottomTab === 'callers' && (
                <div className="space-y-1.5">
                  {currentRelations.callers.length === 0 ? (
                    <div className="text-subtle text-xs p-2">
                      No incoming callers detected in the AST graph for {activeFunctionSymbol || 'this file'}.
                    </div>
                  ) : (
                    currentRelations.callers.map((c, i) => (
                      <div
                        key={i}
                        onClick={() => openFile(c.file, c.line)}
                        className="p-2 rounded bg-surface hover:bg-raised border border-line cursor-pointer flex items-center justify-between text-muted hover:text-text transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ArrowDownRight className="w-3.5 h-3.5 text-green-bright shrink-0" />
                          <span className="text-green-bright font-semibold">{c.symbol}</span>
                          <span className="text-subtle text-[11px]">calls {activeFunctionSymbol}</span>
                        </div>
                        <span className="text-subtle text-[11px] font-mono">
                          {c.file}:{c.line}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: CALLEES */}
              {bottomTab === 'callees' && (
                <div className="space-y-1.5">
                  {currentRelations.callees.length === 0 ? (
                    <div className="text-subtle text-xs p-2">
                      No downstream function calls made by {activeFunctionSymbol}.
                    </div>
                  ) : (
                    currentRelations.callees.map((c, i) => (
                      <div
                        key={i}
                        onClick={() => openFile(c.file, c.line)}
                        className="p-2 rounded bg-surface hover:bg-raised border border-line cursor-pointer flex items-center justify-between text-muted hover:text-text transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate shrink-0" />
                          <span className="text-text font-semibold">{c.symbol}</span>
                          <span className="text-subtle text-[11px]">{c.kind}</span>
                        </div>
                        <span className="text-subtle text-[11px] font-mono">
                          {c.file}:{c.line}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: UNRESOLVED */}
              {bottomTab === 'unresolved' && (
                <div className="space-y-1.5">
                  {currentRelations.unresolved.length === 0 ? (
                    <div className="p-2 text-xs text-green-bright flex items-center gap-2">
                      <span>✓ All references for {activeFunctionSymbol} resolved deterministically.</span>
                    </div>
                  ) : (
                    currentRelations.unresolved.map((u, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-surface border border-line flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0" />
                          <span className="font-semibold text-amber">{u.symbol}</span>
                          <span className="text-subtle text-[11px]">line {u.line}</span>
                        </div>
                        <span className="text-subtle text-[11px]">{u.reason}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeViewPage;
