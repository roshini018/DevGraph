import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { Target, Beaker, ShieldCheck, Maximize2 } from 'lucide-react';
import type { EnrichedFinding } from './types';
import { MOCK_EDGES, MOCK_SYMBOLS } from '../../../mocks/repo';

interface ImpactGraphCanvasProps {
  targets: string[];
  findings: EnrichedFinding[];
  onSelectNode: (nodeId: string) => void;
}

const GraphCanvasInner: React.FC<ImpactGraphCanvasProps> = ({
  targets,
  findings,
  onSelectNode,
}) => {
  const { fitView } = useReactFlow();

  // Generate nodes and edges strictly following rules
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const drawnNodes = new Set<string>();

    const targetSet = new Set(targets);

    // 1. Target nodes in Column 0 (x = 40)
    targets.forEach((targetId, idx) => {
      drawnNodes.add(targetId);
      const symbolInfo = MOCK_SYMBOLS.find(s => s.id === targetId);
      const label = symbolInfo?.label || targetId;
      const file = symbolInfo?.file || (targetId.includes('/') ? targetId : '');

      nodes.push({
        id: targetId,
        position: { x: 40, y: 60 + idx * 110 },
        data: {
          label: (
            <div className="p-3 bg-green-soft/30 border border-green-bright rounded-lg shadow-lg min-w-[190px] font-sans">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-bright/20 text-green-bright text-[9px] font-mono font-bold tracking-wider uppercase border border-green-bright/40">
                  <Target className="w-2.5 h-2.5" />
                  Target
                </span>
                <span className="text-[10px] font-mono text-subtle truncate max-w-[80px]">
                  {symbolInfo?.kind || 'symbol'}
                </span>
              </div>
              <div className="font-mono text-xs font-bold text-text truncate" title={label}>
                {label}
              </div>
              {file && (
                <div className="text-[10px] font-mono text-subtle truncate mt-0.5" title={file}>
                  {file.split('/').slice(-2).join('/')}
                </div>
              )}
            </div>
          ),
        },
        type: 'default',
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
    });

    // 2. Separate test findings from non-test findings
    const testFindings = findings.filter(f => f.is_test);
    const nonTestFindings = findings.filter(f => !f.is_test);

    // Separate non-tests by hop
    const hop1 = nonTestFindings.filter(f => f.distance === 1);
    const hop2 = nonTestFindings.filter(f => f.distance === 2);
    const hop3 = nonTestFindings.filter(f => f.distance >= 3);

    // Placement helper for columns: Hop 1 (x=300), Hop 2 (x=560), Hop 3 (x=820)
    let maxY = Math.max(160, targets.length * 110);

    const placeColumn = (
      items: EnrichedFinding[],
      colX: number,
      hopLabel: string,
      borderClass: string,
      bgClass: string,
      textClass: string
    ) => {
      items.forEach((item, idx) => {
        if (drawnNodes.has(item.id)) return;
        drawnNodes.add(item.id);

        const yPos = 60 + idx * 110;
        if (yPos + 90 > maxY) maxY = yPos + 90;

        nodes.push({
          id: item.id,
          position: { x: colX, y: yPos },
          data: {
            label: (
              <div
                className={`p-3 rounded-lg shadow-lg min-w-[190px] font-sans border transition-all hover:scale-[1.02] cursor-pointer ${bgClass} ${borderClass}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border border-current/30 ${textClass}`}
                  >
                    {hopLabel}
                  </span>
                  {item.has_unresolved && (
                    <span className="text-[9px] font-mono text-ember font-semibold">
                      unresolved
                    </span>
                  )}
                </div>
                <div className={`font-mono text-xs font-bold truncate ${textClass}`} title={item.symbol}>
                  {item.symbol}
                </div>
                <div className="text-[10px] font-mono text-subtle truncate mt-0.5" title={item.file}>
                  {item.file.split('/').slice(-2).join('/')}:{item.line}
                </div>
              </div>
            ),
          },
          type: 'default',
          style: { background: 'transparent', border: 'none', padding: 0 },
        });
      });
    };

    // Hop 1: strong terracotta
    placeColumn(
      hop1,
      300,
      'Hop 1 (Direct)',
      'border-terracotta',
      'bg-terracotta/20',
      'text-terracotta'
    );

    // Hop 2: 70% opacity terracotta
    placeColumn(
      hop2,
      560,
      'Hop 2',
      'border-terracotta/70',
      'bg-terracotta/15',
      'text-terracotta/90'
    );

    // Hop 3: 40% opacity terracotta
    placeColumn(
      hop3,
      820,
      'Hop 3',
      'border-terracotta/40',
      'bg-terracotta/10',
      'text-subtle'
    );

    // 3. Tests in a separate group/lane below
    const testLaneY = maxY + 60;
    if (testFindings.length > 0) {
      // Add a swimlane header node for tests
      nodes.push({
        id: 'test-group-header',
        position: { x: 40, y: testLaneY - 32 },
        data: {
          label: (
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-subtle uppercase tracking-wider">
              <Beaker className="w-3.5 h-3.5 text-muted" />
              <span>Related Test Suite ({testFindings.length} tests)</span>
            </div>
          ),
        },
        type: 'default',
        selectable: false,
        draggable: false,
        style: { background: 'transparent', border: 'none', padding: 0 },
      });

      testFindings.forEach((test, idx) => {
        if (drawnNodes.has(test.id)) return;
        drawnNodes.add(test.id);

        const colIdx = idx % 4;
        const rowIdx = Math.floor(idx / 4);
        const testX = 40 + colIdx * 240;
        const testY = testLaneY + rowIdx * 100;

        nodes.push({
          id: test.id,
          position: { x: testX, y: testY },
          data: {
            label: (
              <div className="p-3 bg-surface border border-line-strong rounded-lg shadow-lg min-w-[200px] font-sans hover:border-text transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-raised text-muted text-[9px] font-mono font-bold tracking-wider uppercase border border-line">
                    <Beaker className="w-2.5 h-2.5" />
                    Test
                  </span>
                  <span className="text-[10px] font-mono text-green font-semibold">
                    covers change
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-text truncate" title={test.symbol}>
                  {test.symbol}
                </div>
                <div className="text-[10px] font-mono text-subtle truncate mt-0.5" title={test.file}>
                  {test.file}:{test.line}
                </div>
              </div>
            ),
          },
          type: 'default',
          style: { background: 'transparent', border: 'none', padding: 0 },
        });
      });
    }

    // 4. Edges: draw directed connections between connected pairs in the blast radius
    // Caller/Dependent -> Target or Child -> Parent
    for (const edge of MOCK_EDGES) {
      if (drawnNodes.has(edge.source) && drawnNodes.has(edge.target)) {
        const isTargetEndpoint = targetSet.has(edge.target) || targetSet.has(edge.source);
        const isUnresolved = !edge.resolved;

        edges.push({
          id: `edge-${edge.id}`,
          source: edge.source,
          target: edge.target,
          label: `${edge.kind} (L${edge.line})`,
          labelStyle: {
            fill: '#A1A1A1',
            fontSize: 10,
            fontFamily: 'Geist Mono, monospace',
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: '#111111',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
          style: {
            stroke: isUnresolved
              ? '#E8935F'
              : isTargetEndpoint
              ? '#C46B4A'
              : '#3D3D3D',
            strokeWidth: isTargetEndpoint ? 2 : 1.5,
            strokeDasharray: isUnresolved ? '4 4' : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isUnresolved
              ? '#E8935F'
              : isTargetEndpoint
              ? '#C46B4A'
              : '#3D3D3D',
            width: 14,
            height: 14,
          },
        });
      }
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [targets, findings]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id !== 'test-group-header') {
        onSelectNode(node.id);
      }
    },
    [onSelectNode]
  );

  return (
    <div className="relative w-full h-full bg-ide overflow-hidden select-none">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.2}
          color="#222222"
          className="bg-ide"
        />
        <Controls
          showInteractive={false}
          className="!bg-surface !border !border-line !shadow-xl !rounded-md overflow-hidden !m-3"
        />
      </ReactFlow>

      {/* Fit Button top-right */}
      <button
        type="button"
        onClick={() => fitView({ padding: 0.2, duration: 400 })}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface/90 hover:bg-raised border border-line hover:border-line-strong text-xs font-mono text-subtle hover:text-text transition-colors shadow-lg"
        title="Fit graph to view"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        <span>Fit view</span>
      </button>

      {/* Legend bottom-left */}
      <div className="absolute bottom-3 left-3 z-10 p-2.5 rounded-lg bg-surface/95 border border-line text-[11px] font-mono space-y-1.5 shadow-xl backdrop-blur-sm pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-green-soft border border-green-bright shrink-0" />
          <span className="text-text">Target symbol/file</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-terracotta/20 border border-terracotta shrink-0" />
          <span className="text-text">Hop 1 (Direct caller)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-terracotta/15 border border-terracotta/70 shrink-0" />
          <span className="text-text">Hop 2 (70% opacity)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-terracotta/10 border border-terracotta/40 shrink-0" />
          <span className="text-text">Hop 3 (40% opacity)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-raised border border-line-strong shrink-0" />
          <span className="text-text">Related Test</span>
        </div>
      </div>

      {/* Zero results overlay if empty findings */}
      {findings.length === 0 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-soft border border-green/40 shadow-2xl">
          <ShieldCheck className="w-4 h-4 text-green-bright shrink-0" />
          <span className="font-mono text-xs text-text">
            Nothing in the index depends on this. It looks safe to change.
          </span>
        </div>
      )}
    </div>
  );
};

export const ImpactGraphCanvas: React.FC<ImpactGraphCanvasProps> = props => {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
};
