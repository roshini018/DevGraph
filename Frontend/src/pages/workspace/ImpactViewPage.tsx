import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Play,
  Network,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { getImpact } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { RiskPill } from '../../components/ui/RiskPill';
import { VerdictBanner } from '../../components/ui/VerdictBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { ImpactTargetCombobox } from './impact/ImpactTargetCombobox';
import { ImpactGraphCanvas } from './impact/ImpactGraphCanvas';
import { ImpactFindingsTab } from './impact/ImpactFindingsTab';
import { ImpactChecksTab } from './impact/ImpactChecksTab';
import type { EnrichedFinding, TestCaseItem, ImpactStateData } from './impact/types';
import { MOCK_SYMBOLS, MOCK_FILES, MOCK_EDGES } from '../../mocks/repo';

export const ImpactViewPage: React.FC = () => {
  const { repoId = 'my-store' } = useParams();
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

  // Targets state: default to 'charge_payment' on first visit if none set
  const initialTargets = useMemo(() => {
    if (queryTarget) return [queryTarget];
    if (impactTargets.length > 0) return impactTargets;
    return ['charge_payment'];
  }, [queryTarget, impactTargets]);

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
  const quickPicks = [
    { id: 'charge_payment', label: 'charge_payment', type: 'func' },
    { id: 'validate_amount', label: 'validate_amount', type: 'func' },
    { id: 'order_service.py', label: 'order_service.py', type: 'file' },
    { id: 'logger.py', label: 'logger.py', type: 'file' },
  ];

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

        // Build enriched findings
        const findings: EnrichedFinding[] = res.impacted_nodes.map(node => {
          const sym = MOCK_SYMBOLS.find(s => s.id === node.node_id);
          const edge = MOCK_EDGES.find(
            e =>
              e.source === node.node_id &&
              (targetSet.has(e.target) || node.path.includes(e.target))
          );

          const isTest =
            sym?.file.startsWith('tests/') || node.node_id.startsWith('test_');
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

          // Extract code snippet from file
          let snippet = '';
          if (sym?.file) {
            const fileObj = MOCK_FILES.find(f => f.path === sym.file);
            if (fileObj) {
              const lines = fileObj.content.split('\n');
              const focusLine = edge?.line || sym.start_line || 1;
              const sLine = Math.max(1, focusLine - 1);
              const eLine = Math.min(lines.length, focusLine + 3);
              snippet = lines
                .slice(sLine - 1, eLine)
                .map((l, i) => `${sLine + i} | ${l}`)
                .join('\n');
            }
          }

          return {
            id: node.node_id,
            symbol: sym?.label || node.node_id,
            file: sym?.file || 'unknown',
            line: edge?.line || sym?.start_line || 1,
            start_line: sym?.start_line || 1,
            end_line: sym?.end_line || 20,
            kind: (sym?.kind === 'function' || sym?.kind === 'class' || sym?.kind === 'method' ? sym.kind : 'function') as EnrichedFinding['kind'],
            distance: node.distance,
            relationship: `${edge?.kind || 'calls'} ${
              edge?.target || targetsToAnalyze[0]
            } at line ${edge?.line || sym?.start_line || 1}`,
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
        const hasUnresolved = MOCK_EDGES.some(
          e =>
            !e.resolved &&
            (targetSet.has(e.source) || targetSet.has(e.target))
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
        for (const e of MOCK_EDGES) {
          if (e.source.startsWith('test_') || e.source.includes('test')) {
            testTargetSet.add(e.target);
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
    [repoId, setImpactTargets]
  );

  // Auto-run on mount or if queryTarget changes
  useEffect(() => {
    if (queryTarget && !targets.includes(queryTarget)) {
      setTargets([queryTarget]);
      runAnalysis([queryTarget], depth);
    } else {
      runAnalysis(targets, depth);
    }
  }, [queryTarget]);

  // Handle Quick Pick click
  const handleQuickPick = (pickId: string) => {
    setTargets([pickId]);
    runAnalysis([pickId], depth);
  };

  // Handle Open in Editor
  const handleOpenSource = (filePath: string, startLine: number, endLine?: number) => {
    openFile(filePath, startLine, endLine || startLine);
    navigate(`/w/${repoId}`);
  };

  // Handle View in Connections
  const handleViewPath = (sourceId: string, targetId: string) => {
    navigate(
      `/w/${repoId}/connections?source=${encodeURIComponent(
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
    navigate(`/w/${repoId}/graph`);
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
