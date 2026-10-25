import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Route,
  ArrowRight,
  ArrowLeftRight,
  Play,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  Network,
  HelpCircle,
  Check,
  Search,
} from 'lucide-react';
import { getConnection, getGraph } from '../../api/client';
import type { ConnectionResult, Citation, GraphEdge, GraphNode } from '../../types/api';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { EvidenceCard } from '../../components/ui/EvidenceCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { MOCK_SYMBOLS, MOCK_FILES, MOCK_EDGES } from '../../mocks/repo';

export const ConnectionsViewPage: React.FC = () => {
  const { repoId: rawRepoId = 'my-store' } = useParams();
  const repoId = decodeURIComponent(rawRepoId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const querySource = searchParams.get('source');
  const queryTarget = searchParams.get('target');

  const { openFile, addMessage, setRightOpen, setImpactTargets, setGraphSelection } =
    useAppStore();

  const isDemo = !repoId || repoId === 'my-store' || repoId === 'repo-1' || repoId === 'default';

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    let isMounted = true;
    getGraph(repoId, 'symbol').then(res => {
      if (isMounted) setGraphData(res);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [repoId]);

  const [source, setSource] = useState(querySource || (isDemo ? 'place_order' : ''));
  const [target, setTarget] = useState(queryTarget || (isDemo ? 'validate_amount' : ''));

  const [activePathIndex, setActivePathIndex] = useState(0);
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dropdown states for searchable chips
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [isTargetOpen, setIsTargetOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');

  // Available options
  const symbolOptions = useMemo(() => {
    if (isDemo) {
      return MOCK_SYMBOLS.map(s => ({
        id: s.id,
        label: s.label,
        file: s.file,
        kind: s.kind,
      }));
    }
    return graphData.nodes
      .filter(n => n.kind !== 'file')
      .map(n => ({
        id: n.label || n.id,
        label: n.label,
        file: n.file || '',
        kind: n.kind,
      }));
  }, [isDemo, graphData.nodes]);

  const filteredSourceOptions = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return symbolOptions.slice(0, 15);
    return symbolOptions
      .filter(s => s.id.toLowerCase().includes(q) || s.file.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
      .slice(0, 15);
  }, [symbolOptions, sourceSearch]);

  const filteredTargetOptions = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    if (!q) return symbolOptions.slice(0, 15);
    return symbolOptions
      .filter(s => s.id.toLowerCase().includes(q) || s.file.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
      .slice(0, 15);
  }, [symbolOptions, targetSearch]);

  // Execute path finding
  const handleTrace = useCallback(
    async (src: string, tgt: string) => {
      if (!src || !tgt) return;
      setLoading(true);
      setError(null);
      setActivePathIndex(0);

      try {
        const res = await getConnection(src, tgt, repoId);
        setConnection(res);
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'error' in err
            ? (err as { error: { message: string } }).error.message
            : 'Path calculation failed';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [repoId]
  );

  // Sync with searchParams or initial load
  useEffect(() => {
    if (querySource && queryTarget) {
      setSource(querySource);
      setTarget(queryTarget);
      handleTrace(querySource, queryTarget);
    } else if (isDemo) {
      const s = querySource || 'place_order';
      const t = queryTarget || 'validate_amount';
      setSource(s);
      setTarget(t);
      handleTrace(s, t);
    } else if (graphData.edges.length > 0) {
      const firstEdge = graphData.edges.find(e => e.kind === 'calls' || e.kind === 'imports') || graphData.edges[0];
      const s = querySource || firstEdge.source.split(':').pop() || firstEdge.source;
      const t = queryTarget || firstEdge.target.split(':').pop() || firstEdge.target;
      setSource(s);
      setTarget(t);
      handleTrace(s, t);
    } else if (graphData.nodes.length >= 2) {
      const s = querySource || graphData.nodes[0].label || graphData.nodes[0].id;
      const t = queryTarget || graphData.nodes[1].label || graphData.nodes[1].id;
      setSource(s);
      setTarget(t);
      handleTrace(s, t);
    }
  }, [querySource, queryTarget, isDemo, graphData.edges, graphData.nodes]);

  // Swap source and target
  const handleSwap = () => {
    const newSource = target;
    const newTarget = source;
    setSource(newSource);
    setTarget(newTarget);
    setSearchParams({ source: newSource, target: newTarget });
    handleTrace(newSource, newTarget);
  };

  // Run on manual button click
  const handleRunExplain = () => {
    setSearchParams({ source, target });
    handleTrace(source, target);
  };

  // Current active path
  const activePath = useMemo(() => {
    if (!connection || !connection.connected || connection.paths.length === 0) {
      return null;
    }
    return connection.paths[activePathIndex] || connection.paths[0];
  }, [connection, activePathIndex]);

  // Helper to find node in real graph or mock
  const findNode = useCallback((id: string) => {
    if (isDemo) return MOCK_SYMBOLS.find(s => s.id === id);
    return graphData.nodes.find(n => n.id === id || n.label === id || n.id.endsWith(`:${id}`));
  }, [isDemo, graphData.nodes]);

  // Active path edges with details
  const activeEdges = useMemo(() => {
    if (!activePath) return [];
    const pool = isDemo ? MOCK_EDGES : graphData.edges;
    const result: GraphEdge[] = [];
    for (let i = 0; i < activePath.length - 1; i++) {
      const u = activePath[i];
      const v = activePath[i + 1];
      const edge = pool.find(e =>
        (e.source === u && e.target === v) ||
        (e.source.endsWith(u) && e.target.endsWith(v)) ||
        (e.source.split(':').pop() === u && e.target.split(':').pop() === v)
      );
      if (edge) {
        result.push(edge);
      } else {
        result.push({
          id: `edge-${u}-${v}`,
          source: u,
          target: v,
          kind: 'calls',
          line: 1,
          resolved: true,
        });
      }
    }
    return result;
  }, [activePath, isDemo, graphData.edges]);

  // Check if any heuristic call along the path
  const hasHeuristic = useMemo(() => {
    return activeEdges.some(e => !e.resolved || e.is_heuristic);
  }, [activeEdges]);

  // Generate natural language explanation for active path
  const explanation = useMemo(() => {
    if (!activePath || activePath.length < 2) return '';

    const parts: string[] = [];
    for (let i = 0; i < activePath.length - 1; i++) {
      const srcNode = activePath[i];
      const tgtNode = activePath[i + 1];
      const edge = activeEdges[i];
      const srcSym = findNode(srcNode);
      const tgtSym = findNode(tgtNode);

      const srcFile = srcSym ? (srcSym.file?.split('/').pop() || 'file') : 'file';
      const tgtFile = tgtSym ? (tgtSym.file?.split('/').pop() || 'file') : 'file';
      const kind = edge?.kind || 'calls';
      const line = edge?.line ? `at line ${edge.line}` : '';

      if (i === 0) {
        parts.push(
          `${srcNode} (${srcFile}) initiates the workflow by ${kind} ${tgtNode} (${tgtFile}) ${line}.`
        );
      } else if (i === activePath.length - 2) {
        parts.push(
          `Finally, ${srcNode} passes control to ${tgtNode} in ${tgtFile} ${line} to finalize the operation.`
        );
      } else {
        parts.push(
          `Then ${srcNode} delegates downstream execution to ${tgtNode} (${tgtFile}) ${line}.`
        );
      }
    }
    return parts.join(' ');
  }, [activePath, activeEdges, findNode]);

  // Generate EvidenceCards from active path
  const evidenceCitations = useMemo<Citation[]>(() => {
    if (!activePath) return [];
    const list: Citation[] = [];

    for (let i = 0; i < activePath.length - 1; i++) {
      const srcNode = activePath[i];
      const tgtNode = activePath[i + 1];
      const edge = activeEdges[i];
      const srcSym = findNode(srcNode);

      const filePath = srcSym?.file || '';
      const fileObj = MOCK_FILES.find(f => f.path === filePath);
      const focusLine = edge?.line || srcSym?.start_line || 1;

      let snippet = srcSym?.signature || `${srcNode}(...) -> calls ${tgtNode}(...)`;
      let startLine = focusLine;
      let endLine = focusLine;

      if (fileObj) {
        const lines = fileObj.content.split('\n');
        startLine = Math.max(1, focusLine - 1);
        endLine = Math.min(lines.length, focusLine + 3);
        snippet = lines.slice(startLine - 1, endLine).join('\n');
      }

      list.push({
        id: `cit-${srcNode}-${tgtNode}-${i}`,
        file_path: filePath,
        start_line: startLine,
        end_line: endLine,
        symbol: srcNode,
        snippet,
        sources: [
          `Hop ${i + 1}: ${edge?.kind || 'calls'} at line ${focusLine}`,
          edge?.resolved ? 'AST Verified' : 'Dynamic Heuristic',
        ],
      });
    }

    return list;
  }, [activePath, activeEdges, findNode]);

  // Action handlers
  const handleOpenSource = (symbolId: string) => {
    const sym = findNode(symbolId);
    if (sym && sym.file) {
      openFile(sym.file, sym.start_line || 1, sym.end_line || sym.start_line || 1);
      navigate(`/w/${encodeURIComponent(repoId)}`);
    }
  };

  const handleAskAI = () => {
    addMessage({
      sender: 'user',
      content: `Explain how ${source} connects to ${target} in this codebase.`,
    });
    setRightOpen(true);
  };

  const handleAnalyzeImpact = () => {
    setImpactTargets([target]);
    navigate(`/w/${encodeURIComponent(repoId)}/impact?target=${encodeURIComponent(target)}`);
  };

  const handleBackToGraph = () => {
    setGraphSelection(source);
    navigate(`/w/${encodeURIComponent(repoId)}/graph`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-ide overflow-hidden select-none font-sans">
      {/* ============================================================== */}
      {/* SEARCH HEADER: Two Searchable Chips, Swap, Green Button         */}
      {/* ============================================================== */}
      <div className="h-14 px-4 bg-surface border-b border-line flex items-center justify-between shrink-0 gap-3 z-30">
        <div className="flex items-center gap-2 flex-wrap">
          <Route className="w-4 h-4 text-slate shrink-0" />

          {/* Source Chip with Dropdown */}
          <div className="relative">
            <div
              onClick={() => {
                setIsSourceOpen(true);
                setIsTargetOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-raised border border-line hover:border-line-strong text-xs font-mono text-text cursor-pointer transition-colors"
            >
              <span className="text-subtle text-[10px] uppercase font-semibold">From:</span>
              <span className="text-green-bright font-bold truncate max-w-[150px]">{source}</span>
            </div>

            {isSourceOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 max-h-60 overflow-y-auto bg-surface border border-line-strong rounded-lg shadow-2xl p-1 z-50 divide-y divide-line animate-in fade-in-50 duration-100">
                <div className="p-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-raised rounded text-xs font-mono">
                    <Search className="w-3 h-3 text-subtle shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      value={sourceSearch}
                      onChange={e => setSourceSearch(e.target.value)}
                      placeholder="Search source..."
                      className="bg-transparent border-none outline-none text-xs text-text w-full"
                    />
                  </div>
                </div>
                <div className="py-1">
                  {filteredSourceOptions.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSource(opt.id);
                        setIsSourceOpen(false);
                        setSourceSearch('');
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs font-mono hover:bg-raised text-text rounded"
                    >
                      <span className="truncate">{opt.label}</span>
                      {opt.id === source && (
                        <Check className="w-3.5 h-3.5 text-green-bright shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Swap Button */}
          <button
            type="button"
            onClick={handleSwap}
            className="p-1.5 rounded hover:bg-raised text-subtle hover:text-text border border-line transition-colors"
            title="Swap source and target"
            aria-label="Swap source and target"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* Target Chip with Dropdown */}
          <div className="relative">
            <div
              onClick={() => {
                setIsTargetOpen(true);
                setIsSourceOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-raised border border-line hover:border-line-strong text-xs font-mono text-text cursor-pointer transition-colors"
            >
              <span className="text-subtle text-[10px] uppercase font-semibold">To:</span>
              <span className="text-terracotta font-bold truncate max-w-[150px]">{target}</span>
            </div>

            {isTargetOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 max-h-60 overflow-y-auto bg-surface border border-line-strong rounded-lg shadow-2xl p-1 z-50 divide-y divide-line animate-in fade-in-50 duration-100">
                <div className="p-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-raised rounded text-xs font-mono">
                    <Search className="w-3 h-3 text-subtle shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      value={targetSearch}
                      onChange={e => setTargetSearch(e.target.value)}
                      placeholder="Search target..."
                      className="bg-transparent border-none outline-none text-xs text-text w-full"
                    />
                  </div>
                </div>
                <div className="py-1">
                  {filteredTargetOptions.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setTarget(opt.id);
                        setIsTargetOpen(false);
                        setTargetSearch('');
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs font-mono hover:bg-raised text-text rounded"
                    >
                      <span className="truncate">{opt.label}</span>
                      {opt.id === target && (
                        <Check className="w-3.5 h-3.5 text-green-bright shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Green Button: Explain connection (Rule 5) */}
        <Button
          variant="green"
          size="sm"
          onClick={handleRunExplain}
          isLoading={loading}
          leftIcon={<Play className="w-3 h-3 fill-black" />}
        >
          Explain connection
        </Button>
      </div>

      {/* ============================================================== */}
      {/* MAIN CONTENT AREA                                              */}
      {/* ============================================================== */}
      <div
        className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full"
        onClick={() => {
          setIsSourceOpen(false);
          setIsTargetOpen(false);
        }}
      >
        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <ErrorState
            title="Connection analysis failed"
            whatHappened={error}
            onRetry={handleRunExplain}
          />
        )}

        {/* Ready State */}
        {!loading && !error && connection && (
          <>
            {/* Case A: No connection found */}
            {(!connection.connected || connection.paths.length === 0) && (
              <div className="p-8 rounded-lg bg-surface border border-line text-center space-y-4 shadow-xl">
                <div className="w-12 h-12 rounded-full bg-raised border border-line flex items-center justify-center mx-auto text-subtle">
                  <HelpCircle className="w-6 h-6 text-muted" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-mono text-sm font-semibold text-text">
                    No connection was found in the currently indexed relationships.
                  </h3>
                  <p className="text-xs text-subtle max-w-md mx-auto leading-relaxed">
                    No static dependency path exists from {source} to {target}. Try swapping
                    direction or exploring an intermediate hub like validate_amount.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSwap}
                    leftIcon={<ArrowLeftRight className="w-3.5 h-3.5" />}
                  >
                    Swap direction
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSource('place_order');
                      setTarget('validate_amount');
                      handleTrace('place_order', 'validate_amount');
                    }}
                  >
                    Try place_order → validate_amount
                  </Button>
                </div>
              </div>
            )}

            {/* Case B: Connected paths found */}
            {connection.connected && connection.paths.length > 0 && activePath && (
              <>
                {/* Switcher & Stats Bar */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-line">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-text">
                      Path {activePathIndex + 1} of {connection.paths.length}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-raised text-[10px] font-mono text-subtle border border-line">
                      {activePath.length - 1} hop{activePath.length - 1 === 1 ? '' : 's'}
                    </span>
                  </div>

                  {connection.paths.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={activePathIndex === 0}
                        onClick={() => setActivePathIndex(prev => Math.max(0, prev - 1))}
                        className="p-1 rounded bg-raised hover:bg-line text-subtle hover:text-text disabled:opacity-30 disabled:cursor-not-allowed border border-line transition-colors"
                        title="Previous path"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={activePathIndex === connection.paths.length - 1}
                        onClick={() =>
                          setActivePathIndex(prev =>
                            Math.min(connection.paths.length - 1, prev + 1)
                          )
                        }
                        className="p-1 rounded bg-raised hover:bg-line text-subtle hover:text-text disabled:opacity-30 disabled:cursor-not-allowed border border-line transition-colors"
                        title="Next path"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Heuristic Call Note if applicable */}
                {hasHeuristic && (
                  <div className="p-3 rounded-lg bg-ember/10 border border-ember/30 flex items-center gap-2.5 text-xs font-mono text-ember">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Heuristic call note: This connection includes an unresolved or heuristically
                      inferred dynamic call.
                    </span>
                  </div>
                )}

                {/* Focused Path Graph: Horizontal Pipeline */}
                <div className="p-6 rounded-lg bg-surface border border-line overflow-x-auto space-y-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-subtle font-semibold">
                    Focused Path Visualization
                  </div>

                  <div className="flex items-center gap-3 min-w-max py-2">
                    {activePath.map((nodeId, idx) => {
                      const isSource = idx === 0;
                      const isDest = idx === activePath.length - 1;
                      const symInfo = findNode(nodeId);
                      const edge = activeEdges[idx];

                      return (
                        <React.Fragment key={idx}>
                          {/* Node Card */}
                          <div
                            onClick={() => handleOpenSource(nodeId)}
                            className={`p-3 rounded-lg border min-w-[170px] max-w-[210px] cursor-pointer transition-all hover:scale-[1.02] shadow-lg ${
                              isSource
                                ? 'bg-green-soft/40 border-green-bright text-text'
                                : isDest
                                ? 'bg-terracotta/20 border-terracotta text-text'
                                : 'bg-raised border-line-strong text-muted hover:text-text'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border ${
                                  isSource
                                    ? 'bg-green-soft text-green-bright border-green/40'
                                    : isDest
                                    ? 'bg-terracotta/20 text-terracotta border-terracotta/40'
                                    : 'bg-surface text-subtle border-line'
                                }`}
                              >
                                {isSource ? 'Source' : isDest ? 'Target' : `Hop ${idx}`}
                              </span>
                              <span className="text-[10px] font-mono text-subtle truncate">
                                {symInfo?.kind || 'symbol'}
                              </span>
                            </div>

                            <div className="font-mono text-xs font-bold text-text truncate" title={nodeId}>
                              {symInfo?.label || nodeId}
                            </div>
                            {symInfo?.file && (
                              <div
                                className="text-[10px] font-mono text-subtle truncate mt-0.5"
                                title={symInfo.file}
                              >
                                {symInfo.file.split('/').slice(-1)[0]}:{symInfo.start_line}
                              </div>
                            )}
                          </div>

                          {/* Edge Connector */}
                          {!isDest && edge && (
                            <div className="flex flex-col items-center justify-center px-1 shrink-0">
                              <span className="px-1.5 py-0.5 rounded bg-ide border border-line text-[10px] font-mono text-subtle mb-1 whitespace-nowrap">
                                {edge.kind} (L{edge.line})
                              </span>
                              <div className="flex items-center">
                                <div className="w-8 h-0.5 bg-line-strong" />
                                <ArrowRight className="w-4 h-4 text-green-bright -ml-1 shrink-0" />
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Explanation */}
                <div className="p-4 rounded-lg bg-surface border border-line space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-text uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-green-bright" />
                    <span>Connection Flow Explanation</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed font-sans font-normal">
                    {explanation}
                  </p>
                </div>

                {/* EvidenceCards for all hops in path */}
                <div className="space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-subtle font-semibold">
                    Code Evidence along Path ({evidenceCitations.length})
                  </div>
                  <div className="space-y-2.5">
                    {evidenceCitations.map(cit => (
                      <EvidenceCard
                        key={cit.id}
                        citation={cit}
                        onNavigate={(fp, l) => {
                          openFile(fp, l, l);
                          navigate(`/w/${encodeURIComponent(repoId)}`);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="pt-4 border-t border-line flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenSource(source)}
                      leftIcon={<ExternalLink className="w-3 h-3" />}
                    >
                      Open source
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleAskAI}
                      leftIcon={<Sparkles className="w-3 h-3" />}
                    >
                      Ask AI
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleAnalyzeImpact}
                      leftIcon={<ShieldAlert className="w-3 h-3" />}
                    >
                      Analyze impact
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToGraph}
                    leftIcon={<Network className="w-3 h-3" />}
                  >
                    Back to graph
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
