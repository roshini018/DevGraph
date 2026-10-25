import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Play,
  Network,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { getImpact, getGraph } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { RiskPill } from '../../components/ui/RiskPill';
import { VerdictBanner } from '../../components/ui/VerdictBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { ImpactTargetCombobox, type TargetOption } from './impact/ImpactTargetCombobox';
import { ImpactGraphCanvas } from './impact/ImpactGraphCanvas';
import { ImpactFindingsTab } from './impact/ImpactFindingsTab';
import { ImpactChecksTab } from './impact/ImpactChecksTab';
import type { EnrichedFinding, TestCaseItem, ImpactStateData } from './impact/types';
import type { GraphNode, GraphEdge } from '../../types/api';
import { MOCK_SYMBOLS, MOCK_EDGES } from '../../mocks/repo';

export const ImpactViewPage: React.FC = () => {
  const { repoId: rawRepoId = 'my-store' } = useParams();
  const repoId = decodeURIComponent(rawRepoId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTarget = searchParams.get('target');

  const {
    impactTargets,
    setImpactTargets,
    openFile,
    addMessage,
    setRightOpen,
    setGraphSelection,
  } = useAppStore();

  const isDemo = !repoId || repoId === 'my-store' || repoId === 'repo-1' || repoId === 'default';

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    let isMounted = true;
    getGraph(repoId, 'symbol').then(res => {
      if (isMounted) setGraphData(res);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [repoId]);

  // Targets state: default to first real symbol if not demo and none set
  const initialTargets = useMemo(() => {
    if (queryTarget) return [queryTarget];
    if (impactTargets.length > 0) return impactTargets;
    if (isDemo) return ['charge_payment'];
    if (graphData.nodes.length > 0) {
      const firstFunc = graphData.nodes.find(n => n.kind === 'function' || n.kind === 'class' || n.kind === 'method');
      return firstFunc ? [firstFunc.label || firstFunc.id] : [graphData.nodes[0].label || graphData.nodes[0].id];
    }
    return [];
  }, [queryTarget, impactTargets, isDemo, graphData.nodes]);

  const [targets, setTargets] = useState<string[]>(initialTargets);
  const [depth, setDepth] = useState<number>(3);
  const [changeDescription, setChangeDescription] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'graph' | 'findings' | 'checks'>('graph');
  const [selectedFindingNode, setSelectedFindingNode] = useState<string | null>(null);

  // States: 'not_started' | 'analyzing' | 'ready' | 'failed'
  const [state, setState] = useState<'not_started' | 'analyzing' | 'ready' | 'failed'>('analyzing');
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<ImpactStateData | null>(null);

  // Quick picks
  const quickPicks = useMemo(() => {
    if (isDemo) {
      return [
        { id: 'charge_payment', label: 'charge_payment', type: 'func' },
        { id: 'validate_amount', label: 'validate_amount', type: 'func' },
        { id: 'order_service.py', label: 'order_service.py', type: 'file' },
        { id: 'logger.py', label: 'logger.py', type: 'file' },
      ];
    }
    const symbols = graphData.nodes.filter(n => n.kind === 'function' || n.kind === 'class' || n.kind === 'method');
    const files = graphData.nodes.filter(n => n.kind === 'file');
    const picks = [];
    if (symbols.length > 0) picks.push({ id: symbols[0].label || symbols[0].id, label: symbols[0].label, type: symbols[0].kind === 'class' ? 'class' : 'func' });
    if (symbols.length > 1) picks.push({ id: symbols[1].label || symbols[1].id, label: symbols[1].label, type: symbols[1].kind === 'class' ? 'class' : 'func' });
    if (files.length > 0) {
      const fName = files[0].file?.split('/').pop() || files[0].label;
      picks.push({ id: files[0].file || files[0].id, label: fName, type: 'file' });
    }
    if (symbols.length > 2) picks.push({ id: symbols[2].label || symbols[2].id, label: symbols[2].label, type: 'func' });
    return picks;
  }, [isDemo, graphData.nodes]);

  // Target options for combobox
  const targetOptions: TargetOption[] = useMemo(() => {
    if (isDemo) return [];

    const fileMap = new Map<string, TargetOption>();
    const funcMap = new Map<string, TargetOption>();
    const classMap = new Map<string, TargetOption>();

    graphData.nodes.forEach(n => {
      const fp = n.kind === 'file' ? (n.file || n.id) : n.file;
      if (fp && !fileMap.has(fp)) {
        const name = fp.split('/').pop() || fp;
        fileMap.set(fp, { id: fp, label: name, sublabel: fp, group: 'Files' });
      }

      if (n.kind === 'function' || n.kind === 'method') {
        const id = n.label || n.id;
        if (!funcMap.has(id)) {
          funcMap.set(id, {
            id,
            label: n.label || id,
            sublabel: `${n.file || ''}:${n.start_line || 1}`,
            group: 'Functions',
          });
        }
      } else if (n.kind === 'class') {
        const id = n.label || n.id;
        if (!classMap.has(id)) {
          classMap.set(id, {
            id,
            label: n.label || id,
            sublabel: `${n.file || ''}:${n.start_line || 1}`,
            group: 'Classes',
          });
        }
      }
    });

    return [
      ...Array.from(fileMap.values()),
      ...Array.from(funcMap.values()),
      ...Array.from(classMap.values()),
    ];
  }, [isDemo, graphData.nodes]);

  // Run impact analysis
  const runAnalysis = useCallback(
    async (targetsToAnalyze: string[], currentDepth: number) => {
      setState('analyzing');
      setError(null);

      try {
        // Enforce 1 to 2 seconds analyzing state as specified
        const startTime = Date.now();
        const res = await getImpact(targetsToAnalyze, currentDepth, repoId);
        const elapsed = Date.now() - startTime;
        if (elapsed < 1100) {
          await new Promise(r => setTimeout(r, 1100 - elapsed));
        }

        // Target set for filtering
        const targetSet = new Set(targetsToAnalyze);
        const edgePool = isDemo ? MOCK_EDGES : graphData.edges;

        // Build enriched findings
        const findings: EnrichedFinding[] = res.impacted_nodes.map(node => {
          const sym = isDemo
            ? MOCK_SYMBOLS.find(s => s.id === node.node_id)
            : graphData.nodes.find(n => n.id === node.node_id || n.label === node.node_id || n.id.endsWith(`:${node.node_id}`));
          const edge = edgePool.find(
            e =>
              (e.source === node.node_id || e.source.endsWith(`:${node.node_id}`)) &&
              (targetSet.has(e.target) || node.path.includes(e.target) || targetSet.has(e.target.split(':').pop()!))
          );

          const isTest =
            (sym?.file && (sym.file.startsWith('tests/') || sym.file.includes('test'))) ||
            node.node_id.startsWith('test_') ||
            node.node_id.includes('test');
          const hasUnresolved = edge?.resolved === false;

          let whyAffected = '';
          if (isTest) {
            whyAffected =
              'Integration test verifying caller contracts. Changes to argument signatures or return types will cause test assertion failures.';
          } else if (node.distance === 1) {
            whyAffected = `Directly calls ${
              edge?.target || targetsToAnalyze[0]
            }. Modifying function parameters, exceptions, or validation thresholds immediately breaks this call site.`;
          } else {
            whyAffected = `Transitive dependent (${node.distance} hops away). Data flow propagating through ${node.path
              .slice(1, -1)
              .join(' → ')} may encounter unexpected schema variations.`;
          }

          // Extract code snippet from file or symbol signature/docstring
          let snippet = '';
          if (sym?.signature) {
            snippet = sym.signature;
            if (sym.docstring) snippet += `\n    """${sym.docstring.slice(0, 100)}..."""`;
          } else if (sym?.description) {
            snippet = sym.description;
          } else if (sym?.file) {
            const symName = sym?.label || node.node_id.split(':').pop() || 'symbol';
            snippet = `# ${sym.kind || 'Component'} defined in ${sym.file}\n# Blast radius dependent of ${targetsToAnalyze.join(', ')}\n${sym.kind || 'def'} ${symName}`;
          }

          const resolvedFile = sym?.file || (node.node_id.includes(':') ? node.node_id.split(':')[1] : 'unknown');
          const resolvedSymbol = sym?.label || node.node_id.split(':').pop() || node.node_id;
          const relationshipText = edge
            ? `${edge.kind} ${edge.target} at line ${edge.line || sym?.start_line || 1}`
            : `calls ${targetsToAnalyze[0] || 'target'} (blast radius hop ${node.distance})`;

          return {
            id: node.node_id,
            symbol: resolvedSymbol,
            file: resolvedFile,
            line: edge?.line || sym?.start_line || 1,
            start_line: sym?.start_line || 1,
            end_line: sym?.end_line || 20,
            kind: (sym?.kind === 'function' || sym?.kind === 'class' || sym?.kind === 'method' ? sym.kind : 'function') as EnrichedFinding['kind'],
            distance: node.distance,
            relationship: relationshipText,
            why_affected: whyAffected,
            is_test: isTest,
            has_unresolved: hasUnresolved,
            snippet,
            path: node.path,
          };
        });

        const directDependents = findings.filter(f => !f.is_test && f.distance === 1);
        const indirectDependents = findings.filter(f => !f.is_test && f.distance > 1);
        const testFindings = findings.filter(f => f.is_test);

        // Check if an unresolved edge touches the targets directly
        const hasUnresolved = edgePool.some(
          e =>
            !e.resolved &&
            (targetSet.has(e.source) || targetSet.has(e.target) || targetSet.has(e.source.split(':').pop()!) || targetSet.has(e.target.split(':').pop()!))
        );

        // RISK RULE: High if > 5 direct dependents or unresolved edge touches target; Medium for 2 to 5; Low otherwise. (NO PERCENTAGES)
        const isHigh = directDependents.length > 5 || hasUnresolved;
        const isMedium = !isHigh && directDependents.length >= 2 && directDependents.length <= 5;
        const riskLevel = isHigh ? 'high' : isMedium ? 'medium' : 'low';

        let riskReason = '';
        if (isHigh) {
          riskReason = hasUnresolved
            ? `High risk: Contains unresolved dynamic edge and ${directDependents.length} direct caller${
                directDependents.length === 1 ? '' : 's'
              }.`
            : `High risk: Extensive blast radius with ${directDependents.length} direct callers.`;
        } else if (isMedium) {
          riskReason = `Medium risk: Contained blast radius with ${directDependents.length} direct callers.`;
        } else {
          riskReason =
            directDependents.length === 0
              ? 'Low risk: No upstream callers depend on this target.'
              : `Low risk: Contained blast radius with ${directDependents.length} direct caller.`;
        }

        // Tests to run
        const testsToRun: TestCaseItem[] = testFindings.map(t => ({
          id: t.id,
          name: t.symbol,
          file: t.file,
          line: t.line,
          label: t.relationship,
          coversChange: true,
        }));

        // Callers to review (all non-test findings)
        const nonTests = findings.filter(f => !f.is_test);
        const callersToReview: TestCaseItem[] = nonTests.map(c => ({
          id: c.id,
          name: c.symbol,
          file: c.file,
          line: c.line,
          label: c.relationship,
          coversChange: false,
        }));

        // Callers without tests
        const testTargetSet = new Set<string>();
        for (const e of edgePool) {
          if (e.source.startsWith('test_') || e.source.includes('test')) {
            testTargetSet.add(e.target);
            testTargetSet.add(e.target.split(':').pop()!);
          }
        }
        const callersWithoutTests: TestCaseItem[] = nonTests
          .filter(c => !testTargetSet.has(c.id))
          .map(c => ({
            id: `missing-test-${c.id}`,
            name: c.symbol,
            file: c.file,
            line: c.line,
            label: c.relationship,
            coversChange: false,
            hasWarning: true,
            warningText: 'No unit or integration test directly covers this caller',
          }));

        // Affected modules
        const moduleMap = new Map<string, number>();
        for (const f of findings) {
          moduleMap.set(f.file, (moduleMap.get(f.file) || 0) + 1);
        }
        const affectedModules = Array.from(moduleMap.entries()).map(([path, count]) => ({
          path,
          count,
        }));

        setAnalysisData({
          targets: targetsToAnalyze,
          depth: currentDepth,
          totalDirect: directDependents.length,
          totalIndirect: indirectDependents.length,
          totalTests: testFindings.length,
          totalModules: affectedModules.length,
          riskLevel,
          riskReason,
          hasUnresolved,
          findings,
          testsToRun,
          callersToReview,
          callersWithoutTests,
          affectedModules,
        });

        setImpactTargets(targetsToAnalyze);
        setState('ready');
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'error' in err
            ? (err as { error: { message: string } }).error.message
            : 'Impact analysis computation failed';
        setError(msg);
        setState('failed');
      }
    },
    [repoId, setImpactTargets, isDemo, graphData]
  );

  // Auto-run on mount or if queryTarget/graphData changes
  useEffect(() => {
    if (queryTarget && !targets.includes(queryTarget)) {
      setTargets([queryTarget]);
      runAnalysis([queryTarget], depth);
    } else if (!isDemo && graphData.nodes.length > 0) {
      const isCurrentTargetValid = targets.length > 0 && targets.some(t =>
        graphData.nodes.some(n => n.label === t || n.id === t || n.id.endsWith(`:${t}`) || n.file === t)
      );
      if (!isCurrentTargetValid) {
        const firstSym =
          graphData.nodes.find(n => n.kind === 'class') ||
          graphData.nodes.find(n => n.kind === 'function' || n.kind === 'method') ||
          graphData.nodes[0];
        const targetId = firstSym ? (firstSym.label || firstSym.id) : '';
        if (targetId) {
          setTargets([targetId]);
          runAnalysis([targetId], depth);
        }
      } else if (targets.length > 0) {
        runAnalysis(targets, depth);
      }
    } else if (targets.length > 0) {
      runAnalysis(targets, depth);
    }
  }, [queryTarget, graphData.nodes.length, isDemo, runAnalysis]);

  // Handle Quick Pick click
  const handleQuickPick = (pickId: string) => {
    setTargets([pickId]);
    runAnalysis([pickId], depth);
  };

  // Handle Open in Editor
  const handleOpenSource = (filePath: string, startLine: number, endLine?: number) => {
    openFile(filePath, startLine, endLine || startLine);
    navigate(`/w/${encodeURIComponent(repoId)}`);
  };

  // Handle View in Connections
  const handleViewPath = (sourceId: string, targetId: string) => {
    navigate(
      `/w/${encodeURIComponent(repoId)}/connections?source=${encodeURIComponent(
        sourceId
      )}&target=${encodeURIComponent(targetId)}`
    );
  };

  // Handle Ask AI
  const handleAskAI = (question: string) => {
    addMessage({
      sender: 'user',
      content: question,
    });
    setRightOpen(true);
  };

  // Handle Node selection from Graph canvas -> sync with Findings
  const handleSelectNode = (nodeId: string) => {
    setSelectedFindingNode(nodeId);
    setActiveTab('findings');
    setTimeout(() => {
      const el = document.getElementById(`finding-${nodeId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  // Handle View in full graph
  const handleViewInFullGraph = () => {
    if (targets.length > 0) {
      setGraphSelection(targets[0]);
    }
    navigate(`/w/${encodeURIComponent(repoId)}/graph`);
  };

  return (
    <div className="flex-1 flex h-full bg-ide overflow-hidden select-none font-sans">
      {/* ============================================================== */}
      {/* LEFT PANEL: The Problem (about 340px, raised surface)           */}
      {/* ============================================================== */}
      <div className="w-[340px] shrink-0 border-r border-line bg-raised flex flex-col h-full overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Section: Target Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-mono font-semibold uppercase tracking-wider text-subtle">
              Target Selection
            </label>
            <ImpactTargetCombobox
              selectedTargets={targets}
              onChange={newTargets => {
                if (newTargets.length > 0) {
                  setTargets(newTargets);
                }
              }}
              options={isDemo ? undefined : targetOptions}
            />
          </div>

          {/* Quick Picks */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">
              Quick Picks:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {quickPicks.map(qp => {
                const isActive = targets.length === 1 && targets[0] === qp.id;
                return (
                  <button
                    key={qp.id}
                    type="button"
                    onClick={() => handleQuickPick(qp.id)}
                    className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${
                      isActive
                        ? 'bg-green-soft text-green-bright border-green/50 font-semibold'
                        : 'bg-surface hover:bg-surface/80 text-muted hover:text-text border-line'
                    }`}
                  >
                    {qp.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Depth Select (1, 2, 3 hops) */}
          <div className="space-y-2">
            <label
              htmlFor="impact-depth-select"
              className="block text-xs font-mono font-semibold uppercase tracking-wider text-subtle"
            >
              Traversal Depth
            </label>
            <select
              id="impact-depth-select"
              value={depth}
              onChange={e => setDepth(Number(e.target.value))}
              className="w-full bg-surface border border-line rounded px-3 py-1.5 text-xs font-mono text-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-green-bright"
            >
              <option value={1}>1 Hop (Direct Dependents only)</option>
              <option value={2}>2 Hops (Transitive Dependents)</option>
              <option value={3}>3 Hops (Full Blast Radius)</option>
            </select>
          </div>

          {/* Optional: Describe the change */}
          <div className="space-y-2">
            <label
              htmlFor="describe-change-textarea"
              className="block text-xs font-mono font-semibold uppercase tracking-wider text-subtle"
            >
              Describe the change <span className="text-subtle font-normal">(optional)</span>
            </label>
            <textarea
              id="describe-change-textarea"
              rows={3}
              value={changeDescription}
              onChange={e => setChangeDescription(e.target.value)}
              placeholder="e.g., Changing return type to PaymentResult or altering currency validation rules..."
              className="w-full bg-surface border border-line rounded p-2.5 text-xs text-text placeholder-subtle font-sans resize-none focus:outline-none focus:ring-1 focus:ring-green-bright leading-relaxed"
            />
          </div>

          {/* Action Button: ONE green 'Analyze impact' button with play icon (Rule 5) */}
          <div className="pt-2 space-y-2.5">
            <Button
              variant="green"
              size="md"
              className="w-full justify-center"
              onClick={() => runAnalysis(targets, depth)}
              isLoading={state === 'analyzing'}
              leftIcon={<Play className="w-3.5 h-3.5 fill-black" />}
            >
              Analyze impact
            </Button>

            {/* Secondary Button: View in full graph */}
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-center text-xs"
              onClick={handleViewInFullGraph}
              leftIcon={<Network className="w-3.5 h-3.5" />}
            >
              View in full graph
            </Button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RIGHT PANEL: Results Area                                      */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col h-full bg-ide overflow-hidden">
        {/* Loading state */}
        {state === 'analyzing' && (
          <div className="p-6 space-y-4 max-w-5xl mx-auto w-full">
            <div className="flex items-center gap-2.5 text-xs font-mono text-muted animate-pulse">
              <Sparkles className="w-4 h-4 text-green-bright animate-spin" />
              <span>Traversing dependency blast radius across indexed call sites...</span>
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        )}

        {/* Failed state with Retry */}
        {state === 'failed' && (
          <div className="p-6 max-w-2xl mx-auto w-full">
            <ErrorState
              title="Impact Analysis Failure"
              whatHappened={error || 'Failed to compute dependency blast radius'}
              onRetry={() => runAnalysis(targets, depth)}
            />
          </div>
        )}

        {/* Ready State */}
        {state === 'ready' && analysisData && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Top Bar: VerdictBanner with computed reason & RiskPill */}
            <div className="p-4 border-b border-line bg-surface shrink-0 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <VerdictBanner
                  className="flex-1"
                  status={analysisData.riskLevel === 'high' ? 'warning' : 'passed'}
                  title={`Analysis complete: ${analysisData.totalDirect} direct, ${analysisData.totalIndirect} indirect, ${analysisData.totalTests} tests`}
                  summary={analysisData.riskReason}
                  metadata={`TARGETS: ${analysisData.targets.join(', ')}`}
                />
                <div className="shrink-0 pt-1">
                  <RiskPill level={analysisData.riskLevel} />
                </div>
              </div>

              {/* Partial / Unresolved warning banner */}
              {analysisData.hasUnresolved && (
                <div className="p-2.5 rounded bg-ember/10 border border-ember/30 flex items-center justify-between text-xs font-mono text-ember">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Dynamic call resolution notice: One or more dependencies involve unresolved runtime targets.
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-semibold">PARTIAL ACCURACY</span>
                </div>
              )}

              {/* Results Tabs: Underline style like IDE */}
              <div className="flex items-center gap-6 border-b border-line -mb-4 pt-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('graph')}
                  className={`pb-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                    activeTab === 'graph'
                      ? 'border-green-bright text-text font-semibold'
                      : 'border-transparent text-subtle hover:text-text'
                  }`}
                >
                  <span>Graph</span>
                  <span className="px-1.5 py-0.2 rounded bg-raised text-[10px] text-subtle border border-line">
                    {analysisData.findings.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('findings')}
                  className={`pb-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                    activeTab === 'findings'
                      ? 'border-green-bright text-text font-semibold'
                      : 'border-transparent text-subtle hover:text-text'
                  }`}
                >
                  <span>Findings</span>
                  <span className="px-1.5 py-0.2 rounded bg-raised text-[10px] text-subtle border border-line">
                    {analysisData.findings.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('checks')}
                  className={`pb-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                    activeTab === 'checks'
                      ? 'border-green-bright text-text font-semibold'
                      : 'border-transparent text-subtle hover:text-text'
                  }`}
                >
                  <span>Checks</span>
                  <span className="px-1.5 py-0.2 rounded bg-raised text-[10px] text-subtle border border-line">
                    {analysisData.testsToRun.length + analysisData.callersToReview.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'graph' && (
                <ImpactGraphCanvas
                  targets={analysisData.targets}
                  findings={analysisData.findings}
                  onSelectNode={handleSelectNode}
                />
              )}

              {activeTab === 'findings' && (
                <div className="p-6 max-w-5xl mx-auto w-full">
                  <ImpactFindingsTab
                    findings={analysisData.findings}
                    affectedModules={analysisData.affectedModules}
                    targets={analysisData.targets}
                    selectedNodeId={selectedFindingNode}
                    onOpenSource={handleOpenSource}
                    onViewPath={handleViewPath}
                    onAskAI={handleAskAI}
                  />
                </div>
              )}

              {activeTab === 'checks' && (
                <div className="p-6 max-w-4xl mx-auto w-full">
                  <ImpactChecksTab
                    targets={analysisData.targets}
                    testsToRun={analysisData.testsToRun}
                    callersToReview={analysisData.callersToReview}
                    callersWithoutTests={analysisData.callersWithoutTests}
                    totalDirect={analysisData.totalDirect}
                    totalIndirect={analysisData.totalIndirect}
                    totalModules={analysisData.totalModules}
                    onOpenSource={handleOpenSource}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
