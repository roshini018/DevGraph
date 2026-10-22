import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
  MarkerType,
} from '@xyflow/react';
import dagre from 'dagre';
import {
  Network,
  Layers,
  Sliders,
  AlertTriangle,
  ArrowRightLeft,
  ShieldAlert,
  X,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { getGraph, getRepoStats } from '../../api/client';
import type { RepoStats } from '../../types/api';
import { MOCK_FILES as MOCK_FILE_CONTENTS, MOCK_EDGES } from '../../mocks/repo';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

import { FileCardNode, type FileCardData } from './graph/FileCardNode';
import { SwimlaneGroupNode, type SwimlaneGroupData } from './graph/SwimlaneGroupNode';
import {
  GraphDetailsDrawer,
  type SelectedGraphItem,
} from './graph/GraphDetailsDrawer';
import {
  GraphControlsSidebar,
  type GraphFilterState,
  type FolderFileItem,
} from './graph/GraphControlsSidebar';

// Register custom React Flow node types
const nodeTypes = {
  fileCard: FileCardNode,
  swimlaneGroup: SwimlaneGroupNode,
};

// Static folder categorization for mock repository
const FOLDER_CATEGORIES: Record<string, string> = {
  'src/api/orders.py': 'api',
  'src/main.py': 'api',
  'src/services/order_service.py': 'services',
  'src/services/payment_service.py': 'services',
  'src/services/inventory_service.py': 'services',
  'src/services/notification_service.py': 'services',
  'src/services/auth_service.py': 'services',
  'src/models/order.py': 'models',
  'src/models/payment.py': 'models',
  'src/models/user.py': 'models',
  'src/models/customer.py': 'models',
  'src/models/base.py': 'models',
  'src/utils/validators.py': 'utils',
  'src/utils/logger.py': 'utils',
  'src/config.py': 'utils',
  'tests/test_orders.py': 'tests',
  'tests/test_payment.py': 'tests',
  'tests/test_validators.py': 'tests',
  'tests/conftest.py': 'tests',
};

const CONNECTION_COUNTS: Record<string, number> = {
  'src/api/orders.py': 8,
  'src/services/order_service.py': 14,
  'src/services/payment_service.py': 11,
  'src/services/inventory_service.py': 7,
  'src/services/notification_service.py': 5,
  'src/services/auth_service.py': 5,
  'src/models/order.py': 6,
  'src/models/payment.py': 5,
  'src/models/user.py': 4,
  'src/models/customer.py': 4,
  'src/models/base.py': 2,
  'src/utils/validators.py': 12,
  'src/utils/logger.py': 6,
  'src/config.py': 3,
  'src/main.py': 4,
  'tests/test_orders.py': 5,
  'tests/test_payment.py': 4,
  'tests/test_validators.py': 3,
  'tests/conftest.py': 2,
};

export const GraphViewPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    setGraphSelection,
    setImpactTargets,
    selectedRepo,
  } = useAppStore();

  const repoId = selectedRepo?.repo_name || 'my-store';

  // Toggle Files | Functions & classes
  const [viewMode, setViewMode] = useState<'files' | 'symbols'>('files');

  // Loading & error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RepoStats | null>(null);

  // Left controls drawer visibility
  const [controlsOpen, setControlsOpen] = useState(true);

  // Search in graph
  const [searchQuery, setSearchQuery] = useState('');

  // Graph filters state
  const [filters, setFilters] = useState<GraphFilterState>({
    groupByFolder: true,
    showIsolated: true,
    showCalls: true,
    showImports: true,
    showInherits: true,
    showUnresolved: true,
    selectedFilePaths: new Set(MOCK_FILE_CONTENTS.map(f => f.path)),
  });

  // Selected node for details drawer and multi-selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedItemDetail, setSelectedItemDetail] = useState<SelectedGraphItem | null>(null);

  // Focus mode state: isolates selected file with callers, callees, imports
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  let focusDirection: 'both' | 'incoming' | 'outgoing' = 'both';
  const focusDepth = 1;

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Folder structure grouping
  const folderStructure = useMemo<Record<string, FolderFileItem[]>>(() => {
    const groups: Record<string, FolderFileItem[]> = {
      api: [],
      services: [],
      models: [],
      utils: [],
      tests: [],
    };

    MOCK_FILE_CONTENTS.forEach(f => {
      const folder = FOLDER_CATEGORIES[f.path] || 'utils';
      const name = f.path.split('/').pop() || f.path;
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push({
        id: f.path,
        name,
        path: f.path,
      });
    });

    return groups;
  }, []);

  // Fetch initial graph stats
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([getGraph(viewMode === 'files' ? 'file' : 'symbol'), getRepoStats()])
      .then(([_, s]) => {
        if (isMounted) {
          setStats(s);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg =
            err && typeof err === 'object' && 'error' in err
              ? (err as { error: { message: string } }).error.message
              : 'Failed to load graph data';
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [viewMode]);

  // Aggregate file-to-file edges from MOCK_EDGES
  const aggregatedEdges = useMemo(() => {
    const edgeMap = new Map<
      string,
      {
        source: string;
        target: string;
        calls: number;
        imports: number;
        inherits: number;
        unresolved: number;
      }
    >();

    // Map symbol to its file path
    const symbolToFile: Record<string, string> = {};
    MOCK_FILE_CONTENTS.forEach(f => {
      f.symbols?.forEach(s => {
        symbolToFile[s] = f.path;
      });
    });

    MOCK_EDGES.forEach(e => {
      const srcFile = symbolToFile[e.source];
      const tgtFile = symbolToFile[e.target];

      if (srcFile && tgtFile && srcFile !== tgtFile) {
        const key = `${srcFile}->${tgtFile}`;
        const current = edgeMap.get(key) || {
          source: srcFile,
          target: tgtFile,
          calls: 0,
          imports: 0,
          inherits: 0,
          unresolved: 0,
        };

        if (e.kind === 'calls') current.calls++;
        else if (e.kind === 'imports') current.imports++;
        else if (e.kind === 'inherits') current.inherits++;

        if (e.resolved === false) current.unresolved++;

        edgeMap.set(key, current);
      }
    });

    return Array.from(edgeMap.values());
  }, []);

  // Compute neighbor set for dimmed styling
  const neighborSet = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const neighbors = new Set<string>();

    aggregatedEdges.forEach(e => {
      if (e.source === selectedNodeId) neighbors.add(e.target);
      if (e.target === selectedNodeId) neighbors.add(e.source);
    });

    return neighbors;
  }, [selectedNodeId, aggregatedEdges]);

  // Layout Engine: Dagre relative layout inside each folder group, then group placement
  const buildGraphLayout = useCallback(() => {
    const isSymbolsMode = viewMode === 'symbols';
    const activePaths = filters.selectedFilePaths;

    // Filter files
    let visibleFiles = MOCK_FILE_CONTENTS.filter(f => activePaths.has(f.path));

    // If focus mode is active, isolate focus target + 1-3 hops
    if (focusTarget) {
      const focusedPaths = new Set<string>([focusTarget]);
      aggregatedEdges.forEach(e => {
        if (focusDirection === 'both' || focusDirection === 'outgoing') {
          if (e.source === focusTarget) focusedPaths.add(e.target);
        }
        if (focusDirection === 'both' || focusDirection === 'incoming') {
          if (e.target === focusTarget) focusedPaths.add(e.source);
        }
      });
      visibleFiles = visibleFiles.filter(f => focusedPaths.has(f.path));
    }

    // Filter isolated files if showIsolated is false
    if (!filters.showIsolated) {
      const connectedPaths = new Set<string>();
      aggregatedEdges.forEach(e => {
        connectedPaths.add(e.source);
        connectedPaths.add(e.target);
      });
      visibleFiles = visibleFiles.filter(f => connectedPaths.has(f.path));
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Group files by folder
    const filesByFolder: Record<string, typeof visibleFiles> = {
      api: [],
      services: [],
      models: [],
      utils: [],
      tests: [],
    };

    visibleFiles.forEach(f => {
      const folder = FOLDER_CATEGORIES[f.path] || 'utils';
      if (!filesByFolder[folder]) filesByFolder[folder] = [];
      filesByFolder[folder].push(f);
    });

    if (filters.groupByFolder) {
      // 1. SWIMLANE GROUPED LAYOUT (Relative positioning inside parent swimlane)
      const folderOrder = ['api', 'services', 'models', 'utils'];
      let currentX = 40;
      let maxTopRowHeight = 200;

      // Group layout for top row: api -> services -> models -> utils
      folderOrder.forEach(folderName => {
        const folderFiles = filesByFolder[folderName] || [];
        if (folderFiles.length === 0) return;

        const groupId = `group-${folderName}`;

        // Dagre layout strictly inside this folder
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setGraph({
          rankdir: 'TB',
          nodesep: 20,
          ranksep: 26,
          marginx: 24,
          marginy: 44,
        });
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        const nodeW = 190;
        const nodeH = isSymbolsMode ? 100 : 54;

        folderFiles.forEach(f => {
          dagreGraph.setNode(f.path, { width: nodeW, height: nodeH });
        });

        // Add intra-folder edges to dagre for clean internal ranking
        aggregatedEdges.forEach(e => {
          if (
            folderFiles.some(f => f.path === e.source) &&
            folderFiles.some(f => f.path === e.target)
          ) {
            dagreGraph.setEdge(e.source, e.target);
          }
        });

        dagre.layout(dagreGraph);

        // Compute relative positions (strictly relative to parent group)
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        const childNodesData: Array<{ path: string; relX: number; relY: number }> = [];

        folderFiles.forEach(f => {
          const pos = dagreGraph.node(f.path);
          const relX = Math.round(pos.x - nodeW / 2);
          const relY = Math.round(pos.y - nodeH / 2);

          if (relX < minX) minX = relX;
          if (relX + nodeW > maxX) maxX = relX + nodeW;
          if (relY < minY) minY = relY;
          if (relY + nodeH > maxY) maxY = relY + nodeH;

          childNodesData.push({ path: f.path, relX, relY });
        });

        // Compute group size from children plus 24px padding
        const groupWidth = Math.max(240, maxX + 24);
        const groupHeight = Math.max(160, maxY + 24);

        if (groupHeight > maxTopRowHeight) maxTopRowHeight = groupHeight;

        // Push Swimlane Group Node
        newNodes.push({
          id: groupId,
          type: 'swimlaneGroup',
          position: { x: currentX, y: 40 },
          data: {
            label: folderName,
            fileCount: folderFiles.length,
            width: groupWidth,
            height: groupHeight,
          } as SwimlaneGroupData,
          draggable: false,
          selectable: false,
        });

        // Push Child File Nodes (RELATIVE to parent group)
        childNodesData.forEach(child => {
          const fileObj = folderFiles.find(f => f.path === child.path)!;
          const fileName = fileObj.path.split('/').pop() || fileObj.path;
          const folderPrefix = fileObj.path.includes('/')
            ? fileObj.path.substring(0, fileObj.path.lastIndexOf('/') + 1)
            : '';

          newNodes.push({
            id: fileObj.path,
            type: 'fileCard',
            parentId: groupId,
            extent: 'parent', // LOCKS inside parent group per CRITICAL requirement
            position: { x: child.relX, y: child.relY },
            data: {
              fileName,
              folderPrefix,
              fullPath: fileObj.path,
              connCount: CONNECTION_COUNTS[fileObj.path] || 4,
              symbols: (fileObj.symbols || []).map(s => ({ name: s, kind: 'function' })),
              showSymbols: isSymbolsMode,
              isSelected: selectedNodeIds.includes(fileObj.path),
              isNeighbor: neighborSet.has(fileObj.path),
              isDimmed: Boolean(selectedNodeId && selectedNodeId !== fileObj.path),
            } as FileCardData,
          });
        });

        currentX += groupWidth + 50;
      });

      // Bottom Row: Tests Swimlane (Spanning across beneath the top row)
      const testFiles = filesByFolder.tests || [];
      if (testFiles.length > 0) {
        const testsGroupId = 'group-tests';
        const testsY = maxTopRowHeight + 110;

        const dagreTests = new dagre.graphlib.Graph();
        dagreTests.setGraph({
          rankdir: 'LR',
          nodesep: 24,
          ranksep: 30,
          marginx: 24,
          marginy: 44,
        });
        dagreTests.setDefaultEdgeLabel(() => ({}));

        const nodeW = 190;
        const nodeH = isSymbolsMode ? 100 : 54;

        testFiles.forEach(f => dagreTests.setNode(f.path, { width: nodeW, height: nodeH }));
        dagre.layout(dagreTests);

        let maxTestX = -Infinity;
        let maxTestY = -Infinity;
        const testChildNodes: Array<{ path: string; relX: number; relY: number }> = [];

        testFiles.forEach(f => {
          const pos = dagreTests.node(f.path);
          const relX = Math.round(pos.x - nodeW / 2);
          const relY = Math.round(pos.y - nodeH / 2);
          if (relX + nodeW > maxTestX) maxTestX = relX + nodeW;
          if (relY + nodeH > maxTestY) maxTestY = relY + nodeH;
          testChildNodes.push({ path: f.path, relX, relY });
        });

        const testGroupW = Math.max(500, maxTestX + 24);
        const testGroupH = Math.max(130, maxTestY + 24);

        newNodes.push({
          id: testsGroupId,
          type: 'swimlaneGroup',
          position: { x: 40, y: testsY },
          data: {
            label: 'tests',
            fileCount: testFiles.length,
            width: testGroupW,
            height: testGroupH,
          } as SwimlaneGroupData,
          draggable: false,
          selectable: false,
        });

        testChildNodes.forEach(child => {
          const fileObj = testFiles.find(f => f.path === child.path)!;
          const fileName = fileObj.path.split('/').pop() || fileObj.path;
          newNodes.push({
            id: fileObj.path,
            type: 'fileCard',
            parentId: testsGroupId,
            extent: 'parent',
            position: { x: child.relX, y: child.relY },
            data: {
              fileName,
              folderPrefix: 'tests/',
              fullPath: fileObj.path,
              connCount: CONNECTION_COUNTS[fileObj.path] || 3,
              symbols: (fileObj.symbols || []).map(s => ({ name: s, kind: 'function' })),
              showSymbols: isSymbolsMode,
              isSelected: selectedNodeIds.includes(fileObj.path),
              isNeighbor: neighborSet.has(fileObj.path),
              isDimmed: Boolean(selectedNodeId && selectedNodeId !== fileObj.path),
            } as FileCardData,
          });
        });
      }
    } else {
      // 2. UNGROUPED GLOBAL DAGRE LAYOUT
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 50, marginx: 40, marginy: 40 });
      g.setDefaultEdgeLabel(() => ({}));

      const nodeW = 190;
      const nodeH = isSymbolsMode ? 100 : 54;

      visibleFiles.forEach(f => g.setNode(f.path, { width: nodeW, height: nodeH }));

      aggregatedEdges.forEach(e => {
        if (
          visibleFiles.some(f => f.path === e.source) &&
          visibleFiles.some(f => f.path === e.target)
        ) {
          g.setEdge(e.source, e.target);
        }
      });

      dagre.layout(g);

      visibleFiles.forEach(f => {
        const pos = g.node(f.path);
        const fileName = f.path.split('/').pop() || f.path;
        newNodes.push({
          id: f.path,
          type: 'fileCard',
          position: { x: Math.round(pos.x - nodeW / 2), y: Math.round(pos.y - nodeH / 2) },
          data: {
            fileName,
            fullPath: f.path,
            connCount: CONNECTION_COUNTS[f.path] || 4,
            symbols: (f.symbols || []).map(s => ({ name: s, kind: 'function' })),
            showSymbols: isSymbolsMode,
            isSelected: selectedNodeIds.includes(f.path),
            isNeighbor: neighborSet.has(f.path),
            isDimmed: Boolean(selectedNodeId && selectedNodeId !== f.path),
          } as FileCardData,
        });
      });
    }

    // Filter & construct aggregated edges
    const visiblePathSet = new Set(visibleFiles.map(f => f.path));

    aggregatedEdges.forEach((e, idx) => {
      if (!visiblePathSet.has(e.source) || !visiblePathSet.has(e.target)) return;

      // Filter by relationship checkboxes
      const hasCalls = e.calls > 0 && filters.showCalls;
      const hasImports = e.imports > 0 && filters.showImports;
      const hasInherits = e.inherits > 0 && filters.showInherits;
      const hasUnresolved = e.unresolved > 0 && filters.showUnresolved;

      if (!hasCalls && !hasImports && !hasInherits && !hasUnresolved) return;

      // Label text: e.g. '3 calls' or '2 calls, 1 import'
      const labelParts: string[] = [];
      if (hasCalls) labelParts.push(`${e.calls} call${e.calls > 1 ? 's' : ''}`);
      if (hasImports) labelParts.push(`${e.imports} import${e.imports > 1 ? 's' : ''}`);
      if (hasInherits) labelParts.push(`${e.inherits} inherit`);
      const edgeLabel = labelParts.join(', ') || `${e.calls + e.imports} conn`;

      // Stroke color based on predominant relationship type
      let strokeColor = '#8A9BA8'; // default slate for imports
      if (hasCalls) strokeColor = '#1BA94C'; // green
      else if (hasInherits) strokeColor = '#C46B4A'; // terracotta
      else if (hasUnresolved) strokeColor = '#737373'; // subtle

      const isEdgeActive =
        selectedNodeId &&
        (e.source === selectedNodeId || e.target === selectedNodeId);

      newEdges.push({
        id: `e-${e.source}->${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        label: edgeLabel,
        type: 'smoothstep',
        animated: hasCalls && isEdgeActive ? true : false,
        style: {
          stroke: isEdgeActive ? '#00EA64' : strokeColor,
          strokeWidth: isEdgeActive ? 2 : 1.25,
          strokeDasharray: hasUnresolved ? '4 4' : undefined,
          opacity: selectedNodeId && !isEdgeActive ? 0.2 : 1,
        },
        labelStyle: {
          fill: isEdgeActive ? '#EDEDED' : '#A1A1A1',
          fontSize: 10,
          fontFamily: 'Geist Mono, monospace',
        },
        labelBgStyle: {
          fill: '#111111',
          fillOpacity: 0.9,
          rx: 4,
          ry: 4,
        },
        labelBgPadding: [4, 2],
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isEdgeActive ? '#00EA64' : strokeColor,
          width: 14,
          height: 14,
        },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [
    viewMode,
    filters,
    focusTarget,
    focusDirection,
    focusDepth,
    selectedNodeId,
    selectedNodeIds,
    neighborSet,
    aggregatedEdges,
    setNodes,
    setEdges,
  ]);

  // Re-run layout whenever view mode, filters, selection, or focus change
  useEffect(() => {
    buildGraphLayout();
  }, [buildGraphLayout]);

  // Handle Node Click
  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    if (node.type === 'swimlaneGroup') return;

    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setGraphSelection(node.id);

    // Prepare item details for right drawer
    const fileObj = MOCK_FILE_CONTENTS.find(f => f.path === node.id);
    if (!fileObj) return;

    const incomingRels: SelectedGraphItem['incoming'] = [];
    const outgoingRels: SelectedGraphItem['outgoing'] = [];

    aggregatedEdges.forEach(e => {
      if (e.target === node.id) {
        incomingRels.push({
          source: e.source.split('/').pop() || e.source,
          file: e.source,
          line: 14,
          kind: e.calls > 0 ? 'calls' : e.imports > 0 ? 'imports' : 'inherits',
          resolved: e.unresolved === 0,
        });
      }
      if (e.source === node.id) {
        outgoingRels.push({
          target: e.target.split('/').pop() || e.target,
          file: e.target,
          line: 22,
          kind: e.calls > 0 ? 'calls' : e.imports > 0 ? 'imports' : 'inherits',
          resolved: e.unresolved === 0,
        });
      }
    });

    setSelectedItemDetail({
      id: node.id,
      name: fileObj.path.split('/').pop() || fileObj.path,
      path: fileObj.path,
      type: 'file',
      summary: (fileObj as any).summary || 'Python module analyzed with deterministic AST symbol graph.',
      symbols: (fileObj.symbols || []).map((s, idx) => ({
        name: s,
        kind: 'function',
        line: 12 + idx * 8,
      })),
      incoming: incomingRels,
      outgoing: outgoingRels,
    });
  };

  // Handle Selection Change (Shift/Cmd multi-selection)
  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const selected = params.nodes
      .filter(n => n.type === 'fileCard')
      .map(n => n.id);
    setSelectedNodeIds(selected);
    if (selected.length === 1) {
      setSelectedNodeId(selected[0]);
    } else if (selected.length === 0) {
      setSelectedNodeId(null);
    }
  }, []);

  const handleClearSelection = () => {
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedItemDetail(null);
    setGraphSelection(null);
  };

  const handleFocusOnSelected = () => {
    if (selectedNodeIds.length > 0) {
      setFocusTarget(selectedNodeIds[0]);
    }
  };

  const handleBackToFullGraph = () => {
    setFocusTarget(null);
  };

  const handleCompareTwoSelected = () => {
    if (selectedNodeIds.length === 2) {
      navigate(
        `/w/${repoId}/connections?source=${encodeURIComponent(
          selectedNodeIds[0]
        )}&target=${encodeURIComponent(selectedNodeIds[1])}`
      );
    }
  };

  const handleAnalyzeImpactSelected = () => {
    if (selectedNodeIds.length > 0) {
      const targetName = selectedNodeIds[0].split('/').pop()?.replace('.py', '') || 'place_order';
      setImpactTargets([targetName]);
      navigate(`/w/${repoId}/impact`);
    }
  };

  const isFiltersHidingAll =
    !loading &&
    !error &&
    nodes.filter(n => n.type === 'fileCard').length === 0 &&
    filters.selectedFilePaths.size === 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-ide overflow-hidden select-none relative font-sans">
      {/* 1. TOP SUB-HEADER: Title in Geist; subtitle computed ('N files, N relationships') */}
      <div className="h-12 px-4 bg-surface border-b border-line flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-semibold text-text tracking-tight font-sans">
              Graph
            </h1>
            <span className="text-xs font-mono text-subtle">
              ({MOCK_FILE_CONTENTS.length} files, {MOCK_EDGES.length} relationships)
            </span>
          </div>

          {/* Toggle: Files | Functions & classes */}
          <div className="pl-2">
            <SegmentedControl
              options={[
                { value: 'files', label: 'Files', icon: <Layers className="w-3.5 h-3.5" /> },
                { value: 'symbols', label: 'Functions & classes', icon: <Network className="w-3.5 h-3.5" /> },
              ]}
              value={viewMode}
              onChange={val => setViewMode(val as 'files' | 'symbols')}
              size="sm"
            />
          </div>
        </div>

        {/* Focus Mode Banner or Top Actions */}
        <div className="flex items-center gap-3">
          {focusTarget ? (
            <div className="flex items-center gap-2 p-1 px-2.5 rounded bg-raised border border-green-bright text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-green-bright animate-pulse" />
              <span className="text-muted">Focused:</span>
              <span className="text-text font-semibold">{focusTarget.split('/').pop()}</span>
              <button
                type="button"
                onClick={handleBackToFullGraph}
                className="text-subtle hover:text-text ml-2 underline text-[11px]"
              >
                Back to full graph
              </button>
            </div>
          ) : (
            stats && (
              <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
                <Badge variant="default">{stats.symbols_count} symbols</Badge>
                <Badge variant="default">{stats.edges_count} edges</Badge>
                <Badge variant="warning">{stats.unresolved_edges_count} unresolved</Badge>
              </div>
            )
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setControlsOpen(prev => !prev)}
            leftIcon={<Sliders className="w-3.5 h-3.5" />}
          >
            {controlsOpen ? 'Hide controls' : 'Controls'}
          </Button>
        </div>
      </div>

      {/* 2. MAIN BODY (Left Controls 280px + Canvas + Right Details Drawer) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Controls Accordion Sidebar (280px, collapsible) */}
        <GraphControlsSidebar
          isOpen={controlsOpen}
          onToggleOpen={() => setControlsOpen(false)}
          filters={filters}
          onChangeFilters={setFilters}
          folderStructure={folderStructure}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectAllFiles={() =>
            setFilters({
              ...filters,
              selectedFilePaths: new Set(MOCK_FILE_CONTENTS.map(f => f.path)),
            })
          }
          onSelectNoneFiles={() =>
            setFilters({
              ...filters,
              selectedFilePaths: new Set(),
            })
          }
        />

        {/* Large Canvas Area (React Flow with ide background & dot grid) */}
        <main className="flex-1 h-full w-full relative bg-ide overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-ide/90 backdrop-blur-sm space-y-3">
              <Skeleton className="h-64 w-96 rounded-xl" />
              <div className="text-xs font-mono text-subtle animate-pulse">
                Constructing AST dependency graph &amp; Dagre swimlanes...
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-ide">
              <ErrorState
                title="Graph rendering failed"
                whatHappened={error}
                onRetry={() => setLoading(true)}
              />
            </div>
          )}

          {/* Warning banner if zero edges in graph */}
          {edges.length === 0 && !loading && !error && !isFiltersHidingAll && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 p-2.5 rounded-lg bg-amber/10 border border-amber/40 text-amber font-mono text-xs flex items-center gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>No relationships match the active filters or focus mode.</span>
            </div>
          )}

          {/* Banner if filters hide everything */}
          {isFiltersHidingAll && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-ide text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber mx-auto" />
              <h3 className="text-sm font-semibold text-text">All nodes are hidden by active filters</h3>
              <p className="text-xs text-subtle max-w-sm">
                You have deselected all files in the controls panel. Click below to restore full graph visibility.
              </p>
              <Button
                variant="white"
                size="sm"
                onClick={() =>
                  setFilters({
                    ...filters,
                    selectedFilePaths: new Set(MOCK_FILE_CONTENTS.map(f => f.path)),
                  })
                }
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Reset filters
              </Button>
            </div>
          )}

          {/* React Flow Graph Canvas */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            minZoom={0.2}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            className="bg-ide"
          >
            {/* Faint Dot Grid */}
            <Background color="#262626" gap={24} size={1} />

            {/* Bottom-Left Legend */}
            <div className="absolute bottom-4 left-4 z-20 p-2.5 rounded-lg bg-surface/90 border border-line backdrop-blur-sm font-mono text-[11px] text-subtle space-y-1.5 shadow-lg select-none">
              <div className="text-[10px] uppercase font-semibold text-text tracking-wider pb-0.5 border-b border-line">
                Legend
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-0.5 bg-green rounded-full inline-block" />
                <span className="text-muted">Calls</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-0.5 bg-slate rounded-full inline-block" />
                <span className="text-muted">Imports</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-0.5 bg-terracotta rounded-full inline-block" />
                <span className="text-muted">Inherits</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 border-b border-dashed border-subtle inline-block" />
                <span className="text-muted">Unresolved</span>
              </div>
            </div>

            {/* Bottom-Right Zoom Controls & Minimap */}
            <Controls className="!bottom-4 !right-4 !bg-surface !border !border-line !rounded-lg !overflow-hidden !shadow-lg" />
            <MiniMap
              nodeColor="#171717"
              maskColor="rgba(10, 10, 10, 0.75)"
              className="!bottom-16 !right-4 !bg-surface !border !border-line !rounded-lg !w-36 !h-24 !overflow-hidden !shadow-lg"
            />
          </ReactFlow>

          {/* 3. FLOATING ACTION BAR when nodes are selected */}
          {selectedNodeIds.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 p-2 px-3.5 rounded-xl bg-surface border border-line-strong shadow-2xl flex items-center gap-3 font-mono text-xs animate-in slide-in-from-bottom-2 duration-150">
              <span className="text-text font-semibold pl-1">
                {selectedNodeIds.length} selected
              </span>

              <div className="h-4 w-px bg-line" />

              {/* Focus Button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFocusOnSelected}
                leftIcon={<Eye className="w-3.5 h-3.5 text-green-bright" />}
              >
                Focus
              </Button>

              {/* Compare connections button (exactly 2) */}
              {selectedNodeIds.length === 2 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCompareTwoSelected}
                  leftIcon={<ArrowRightLeft className="w-3.5 h-3.5 text-slate" />}
                >
                  Compare connections
                </Button>
              )}

              {/* Analyze impact button (green) */}
              <Button
                variant="green"
                size="sm"
                onClick={handleAnalyzeImpactSelected}
                leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
              >
                Analyze impact
              </Button>

              <button
                type="button"
                onClick={handleClearSelection}
                className="text-subtle hover:text-text p-1 rounded ml-1"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* 4. RIGHT DETAILS DRAWER that opens on select */}
        {selectedItemDetail && (
          <GraphDetailsDrawer
            item={selectedItemDetail}
            onClose={() => {
              setSelectedItemDetail(null);
              setSelectedNodeId(null);
            }}
            onSelectNode={nodeId => {
              const fakeNode: Node = { id: nodeId, position: { x: 0, y: 0 }, data: {} };
              onNodeClick({} as React.MouseEvent, fakeNode);
            }}
          />
        )}
      </div>

      {/* 5. FOOTER: stats from getStats & 'Showing X of Y nodes' */}
      <footer className="h-8 px-4 bg-surface border-t border-line flex items-center justify-between shrink-0 text-[11px] font-mono text-subtle z-20">
        <div className="flex items-center gap-4">
          <span>
            Showing <span className="text-text font-semibold">{nodes.filter(n => n.type === 'fileCard').length}</span> of{' '}
            <span className="text-text">{MOCK_FILE_CONTENTS.length}</span> nodes
          </span>
          <span>•</span>
          <span>{edges.length} edges active</span>
          <span>•</span>
          <span className="text-green-bright font-medium">Dagre Swimlane Layout</span>
        </div>

        <div className="flex items-center gap-3">
          <span>acme / {repoId}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-bright" />
        </div>
      </footer>
    </div>
  );
};

export default GraphViewPage;
