import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
  MarkerType,
  BackgroundVariant,
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
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Focus,
} from 'lucide-react';
import { getGraph, getRepoStats, USE_MOCKS } from '../../api/client';
import type { RepoStats, GraphData } from '../../types/api';
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
import { LabeledEdge } from './graph/LabeledEdge';

// Register custom React Flow node & edge types
const nodeTypes = {
  fileCard: FileCardNode,
  swimlaneGroup: SwimlaneGroupNode,
};

const edgeTypes = {
  labeled: LabeledEdge,
};

// ─── Swimlane category mapping ────────────────────────────────────────────────
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

function getFolderCategory(path: string): string {
  if (FOLDER_CATEGORIES[path]) return FOLDER_CATEGORIES[path];
  const p = path.toLowerCase();
  
  if (p.includes('/test') || p.includes('/__tests__') || p.includes('.test.') || p.includes('.spec.')) {
    return 'tests';
  }
  if (p.includes('/api/') || p.includes('/routes/') || p.includes('/controllers/') || p.includes('/endpoints/')) {
    return 'api';
  }
  if (p.includes('/models/') || p.includes('/types/') || p.includes('/schemas/') || p.includes('/entities/') || p.includes('/interfaces/')) {
    return 'models';
  }
  if (p.includes('/utils/') || p.includes('/lib/') || p.includes('/context/') || p.includes('/helpers/') || p.includes('/config/')) {
    return 'utils';
  }
  if (p.includes('/components/') || p.includes('/views/') || p.includes('/app/') || p.includes('/pages/') || p.includes('/ui/')) {
    return 'services';
  }
  return 'services';
}

function formatFileDisplayName(fullPath: string): { fileName: string; folderPrefix: string } {
  const parts = fullPath.split('/');
  const baseName = parts[parts.length - 1] || fullPath;
  const genericNames = new Set([
    'page.jsx', 'page.tsx', 'page.js', 'page.ts',
    'layout.jsx', 'layout.tsx', 'layout.js', 'layout.ts',
    'route.jsx', 'route.tsx', 'route.js', 'route.ts',
    'loading.jsx', 'loading.tsx', 'loading.js', 'loading.ts',
    'index.jsx', 'index.tsx', 'index.js', 'index.ts',
  ]);

  if (genericNames.has(baseName.toLowerCase()) && parts.length > 1) {
    const parentDir = parts[parts.length - 2];
    const prefix = parts.slice(0, parts.length - 2).join('/');
    return {
      fileName: `${parentDir}/${baseName}`,
      folderPrefix: prefix ? `${prefix}/` : '',
    };
  }

  const prefix = parts.slice(0, -1).join('/');
  return {
    fileName: baseName,
    folderPrefix: prefix ? `${prefix}/` : '',
  };
}

// ─── Edge relationship color palette ──────────────────────────────────────────
const EDGE_COLORS: Record<string, { stroke: string; label: string }> = {
  calls:     { stroke: '#22d3ee', label: 'CALLS' },    // cyan
  imports:   { stroke: '#818cf8', label: 'IMPORTS' },  // indigo
  inherits:  { stroke: '#f59e0b', label: 'INHERITS' }, // amber
  defines:   { stroke: '#34d399', label: 'DEFINES' },  // emerald
  unresolved:{ stroke: '#4b5563', label: '?' },        // gray
};

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W = 240;
const NODE_H_FILES   = 76;
const NODE_H_SYMBOLS = 160;
const GROUP_PAD_X    = 36;
const GROUP_PAD_Y    = 60;   // top = header + padding
const GROUP_GAP_X    = 100;  // horizontal gap between swimlanes
const GROUP_GAP_Y    = 120;  // vertical gap between top row and tests row
const NODE_SEP       = 48;   // horizontal gap between cards
const RANK_SEP       = 72;   // vertical gap between cards

// ─── Custom zoom controls ─────────────────────────────────────────────────────
function ZoomControls({ onFitView }: { onFitView: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-1.5">
      <button
        onClick={() => zoomIn({ duration: 250 })}
        title="Zoom in"
        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center transition-all shadow-md"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={() => zoomOut({ duration: 250 })}
        title="Zoom out"
        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center transition-all shadow-md"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={() => fitView({ padding: 0.12, duration: 400 })}
        title="Fit to screen"
        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center transition-all shadow-md"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
      <button
        onClick={onFitView}
        title="Reset view"
        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center transition-all shadow-md"
      >
        <Focus className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function GraphLegend() {
  return (
    <div className="absolute bottom-6 left-6 z-30 p-3 rounded-xl bg-slate-900/90 border border-slate-700/60 backdrop-blur-sm text-[11px] space-y-2 shadow-xl select-none">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 pb-1 border-b border-slate-700/60">
        Relationships
      </div>
      {Object.entries(EDGE_COLORS).map(([key, val]) => (
        <div key={key} className="flex items-center gap-2.5">
          <span
            className="w-5 h-0.5 inline-block rounded-full"
            style={{ background: val.stroke }}
          />
          <span className="font-mono text-slate-400">{val.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2.5 pt-1 border-t border-slate-700/60">
        <span className="w-5 border-b border-dashed border-slate-500 inline-block" />
        <span className="font-mono text-slate-500">Unresolved</span>
      </div>
    </div>
  );
}

interface HoveredEdgeInfo {
  edgeId: string;
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  primaryKind: string;
  calls: number;
  imports: number;
  inherits: number;
  unresolved: number;
  summary: string;
  x: number;
  y: number;
}

// ─── Main inner component (needs ReactFlowProvider above it) ──────────────────
const GraphViewInner: React.FC = () => {
  const navigate = useNavigate();
  const { fitView } = useReactFlow();
  const {
    setGraphSelection,
    setImpactTargets,
    selectedRepo,
  } = useAppStore();

  const repoId = selectedRepo?.full_name || selectedRepo?.id || selectedRepo?.repo_name || 'default';
  const repoDisplayName = selectedRepo?.repo_name || selectedRepo?.full_name || 'my-store';

  const [viewMode, setViewMode]     = useState<'files' | 'symbols'>('files');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [stats, setStats]           = useState<RepoStats | null>(null);
  const [graphData, setGraphData]   = useState<GraphData>({ nodes: [], edges: [] });
  const [reloadKey, setReloadKey]   = useState(0);
  const [indexing, setIndexing]     = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  const handleIndexRepository = async () => {
    if (!repoId || repoId === 'default') return;
    setIndexing(true);
    setIndexError(null);
    try {
      const res = await fetch(`/api/repos/${encodeURIComponent(repoId)}/graph/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_existing: false, max_files: 100 }),
      });
      if (!res.ok) {
        let msg = `Indexing failed (HTTP ${res.status})`;
        try { const err = await res.json(); if (err.detail) msg = err.detail; else if (err.message) msg = err.message; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      if (!data.success && data.error) throw new Error(data.error);
      setReloadKey(k => k + 1);
    } catch (err: unknown) {
      setIndexError(err instanceof Error ? err.message : 'Failed to index repository');
    } finally {
      setIndexing(false);
    }
  };

  const [controlsOpen, setControlsOpen] = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');

  const [filters, setFilters] = useState<GraphFilterState>({
    groupByFolder: true,
    showIsolated: true,
    showCalls: true,
    showImports: true,
    showInherits: true,
    showUnresolved: true,
    selectedFilePaths: new Set(MOCK_FILE_CONTENTS.map(f => f.path)),
  });

  const [selectedNodeId, setSelectedNodeId]         = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds]       = useState<string[]>([]);
  const [selectedItemDetail, setSelectedItemDetail] = useState<SelectedGraphItem | null>(null);
  const [focusTarget, setFocusTarget]               = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge]               = useState<HoveredEdgeInfo | null>(null);
  let focusDirection: 'both' | 'incoming' | 'outgoing' = 'both';

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ── Fetch graph + stats ────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    const mode = viewMode === 'files' ? 'file' : 'symbol';
    Promise.all([getGraph(repoId, mode), getRepoStats(repoId)])
      .then(([graph, s]) => {
        if (isMounted) { setGraphData(graph); setStats(s); }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message
            : err && typeof err === 'object' && 'error' in err
            ? (err as { error: { message: string } }).error.message
            : 'Failed to load graph data';
          setError(msg);
        }
      })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [repoId, viewMode, reloadKey]);

  // ── Extract active files ───────────────────────────────────────────────────
  const activeFiles = useMemo(() => {
    const map = new Map<string, {
      path: string; name: string;
      symbols: Array<{ name: string; kind: string; line?: number }>;
      summary?: string;
    }>();

    graphData.nodes.forEach(node => {
      if (node.kind === 'file') {
        const p = node.file || node.label || node.id;
        if (p && !map.has(p)) map.set(p, { path: p, name: p.split('/').pop() || p, symbols: [], summary: node.description });
      } else if (node.file) {
        const p = node.file;
        if (!map.has(p)) map.set(p, { path: p, name: p.split('/').pop() || p, symbols: [] });
        const entry = map.get(p)!;
        if (!entry.symbols.some(s => s.name === node.label))
          entry.symbols.push({ name: node.label, kind: node.kind, line: node.start_line });
      }
    });

    if (map.size === 0 && USE_MOCKS && (!selectedRepo || selectedRepo.repo_name === 'my-store' || selectedRepo.id === 'repo-1')) {
      MOCK_FILE_CONTENTS.forEach(f => {
        map.set(f.path, {
          path: f.path, name: f.path.split('/').pop() || f.path,
          symbols: (f.symbols || []).map(s => ({ name: s, kind: 'function' })),
          summary: (f as any).summary,
        });
      });
    }

    return Array.from(map.values());
  }, [graphData.nodes, selectedRepo]);

  // ── Aggregate file-to-file edges ───────────────────────────────────────────
  const aggregatedEdges = useMemo(() => {
    const edgeMap = new Map<string, { source: string; target: string; calls: number; imports: number; inherits: number; unresolved: number }>();

    const nodeIdToFile: Record<string, string> = {};
    graphData.nodes.forEach(n => {
      if (n.file) { nodeIdToFile[n.id] = n.file; nodeIdToFile[n.label] = n.file; }
    });

    const filePathsSet = new Set(activeFiles.map(f => f.path));
    const resolveToFile = (ref: string): string | null => {
      if (filePathsSet.has(ref)) return ref;
      if (nodeIdToFile[ref]) return nodeIdToFile[ref];
      for (const f of activeFiles) if (ref.includes(f.path)) return f.path;
      return null;
    };

    graphData.edges.forEach(e => {
      const srcFile = resolveToFile(e.source);
      const tgtFile = resolveToFile(e.target);
      if (srcFile && tgtFile && srcFile !== tgtFile) {
        const key = `${srcFile}->${tgtFile}`;
        const cur = edgeMap.get(key) || { source: srcFile, target: tgtFile, calls: 0, imports: 0, inherits: 0, unresolved: 0 };
        if (e.kind === 'calls') cur.calls++;
        else if (e.kind === 'imports') cur.imports++;
        else if (e.kind === 'inherits') cur.inherits++;
        else cur.calls++;
        if (e.resolved === false) cur.unresolved++;
        edgeMap.set(key, cur);
      }
    });

    if (edgeMap.size === 0 && USE_MOCKS && (!selectedRepo || selectedRepo.repo_name === 'my-store' || selectedRepo.id === 'repo-1')) {
      const symbolToFile: Record<string, string> = {};
      MOCK_FILE_CONTENTS.forEach(f => f.symbols?.forEach(s => { symbolToFile[s] = f.path; }));
      MOCK_EDGES.forEach(e => {
        const srcFile = symbolToFile[e.source];
        const tgtFile = symbolToFile[e.target];
        if (srcFile && tgtFile && srcFile !== tgtFile) {
          const key = `${srcFile}->${tgtFile}`;
          const cur = edgeMap.get(key) || { source: srcFile, target: tgtFile, calls: 0, imports: 0, inherits: 0, unresolved: 0 };
          if (e.kind === 'calls') cur.calls++;
          else if (e.kind === 'imports') cur.imports++;
          else if (e.kind === 'inherits') cur.inherits++;
          if (e.resolved === false) cur.unresolved++;
          edgeMap.set(key, cur);
        }
      });
    }

    return Array.from(edgeMap.values());
  }, [graphData.nodes, graphData.edges, activeFiles, selectedRepo]);

  // ── Connection counts per file ─────────────────────────────────────────────
  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    aggregatedEdges.forEach(e => {
      const total = (e.calls || 0) + (e.imports || 0) + (e.inherits || 0);
      counts[e.source] = (counts[e.source] || 0) + total;
      counts[e.target] = (counts[e.target] || 0) + total;
    });
    return counts;
  }, [aggregatedEdges]);

  // ── Folder structure for sidebar ───────────────────────────────────────────
  const folderStructure = useMemo<Record<string, FolderFileItem[]>>(() => {
    const groups: Record<string, FolderFileItem[]> = { api: [], services: [], models: [], utils: [], tests: [] };
    activeFiles.forEach(f => {
      const folder = getFolderCategory(f.path);
      if (!groups[folder]) groups[folder] = [];
      const { fileName } = formatFileDisplayName(f.path);
      groups[folder].push({ id: f.path, name: fileName, path: f.path });
    });
    return groups;
  }, [activeFiles]);

  // ── Sync selected file paths when data loads ───────────────────────────────
  useEffect(() => {
    if (activeFiles.length > 0) {
      setFilters(prev => ({ ...prev, selectedFilePaths: new Set(activeFiles.map(f => f.path)) }));
    }
  }, [activeFiles]);

  // ── Neighbor set for dimming ───────────────────────────────────────────────
  const neighborSet = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ns = new Set<string>();
    aggregatedEdges.forEach(e => {
      if (e.source === selectedNodeId) ns.add(e.target);
      if (e.target === selectedNodeId) ns.add(e.source);
    });
    return ns;
  }, [selectedNodeId, aggregatedEdges]);

  // ── Dagre layout ───────────────────────────────────────────────────────────
  const buildGraphLayout = useCallback(() => {
    const isSymbolsMode = viewMode === 'symbols';
    const nodeH = isSymbolsMode ? NODE_H_SYMBOLS : NODE_H_FILES;
    const activePaths = filters.selectedFilePaths;

    let visibleFiles = activeFiles.filter(f => activePaths.has(f.path));

    // Focus mode: only connected nodes
    if (focusTarget) {
      const fp = new Set<string>([focusTarget]);
      aggregatedEdges.forEach(e => {
        if (focusDirection === 'both' || focusDirection === 'outgoing') if (e.source === focusTarget) fp.add(e.target);
        if (focusDirection === 'both' || focusDirection === 'incoming') if (e.target === focusTarget) fp.add(e.source);
      });
      visibleFiles = visibleFiles.filter(f => fp.has(f.path));
    }

    if (!filters.showIsolated) {
      const connected = new Set<string>();
      aggregatedEdges.forEach(e => { connected.add(e.source); connected.add(e.target); });
      visibleFiles = visibleFiles.filter(f => connected.has(f.path));
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const nodePositionMap: Record<string, { x: number; y: number }> = {};

    const filesByFolder: Record<string, typeof visibleFiles> = {
      api: [], services: [], models: [], utils: [], tests: [],
    };
    visibleFiles.forEach(f => {
      const cat = getFolderCategory(f.path);
      if (!filesByFolder[cat]) filesByFolder[cat] = [];
      filesByFolder[cat].push(f);
    });

    if (filters.groupByFolder) {
      // ── Swimlane grouped layout ──────────────────────────────────────────
      const topFolders = ['api', 'services', 'models', 'utils'];
      let curX = 40;
      let maxTopH = 200;

      topFolders.forEach(folderName => {
        const folderFiles = filesByFolder[folderName] || [];
        if (folderFiles.length === 0) return;

        // Multi-column grid layout inside swimlane to prevent extreme horizontal stretching
        const cols = folderFiles.length >= 20 ? 4 : folderFiles.length >= 8 ? 3 : folderFiles.length >= 2 ? 2 : 1;
        const rows = Math.ceil(folderFiles.length / cols);
        const childNodes: Array<{ path: string; relX: number; relY: number }> = [];

        folderFiles.forEach((f, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const rx = GROUP_PAD_X + col * (NODE_W + NODE_SEP);
          const ry = GROUP_PAD_Y + row * (nodeH + RANK_SEP);
          childNodes.push({ path: f.path, relX: rx, relY: ry });
        });

        const groupW = GROUP_PAD_X * 2 + cols * NODE_W + Math.max(0, cols - 1) * NODE_SEP;
        const groupH = Math.max(220, GROUP_PAD_Y * 2 + rows * nodeH + Math.max(0, rows - 1) * RANK_SEP + 28);
        if (groupH > maxTopH) maxTopH = groupH;

        const groupId = `group-${folderName}`;
        newNodes.push({
          id: groupId,
          type: 'swimlaneGroup',
          position: { x: curX, y: 40 },
          data: { label: folderName, fileCount: folderFiles.length, width: groupW, height: groupH } as SwimlaneGroupData,
          draggable: false,
          selectable: false,
        });

        childNodes.forEach(child => {
          const fileObj = folderFiles.find(f => f.path === child.path)!;
          const { fileName, folderPrefix } = formatFileDisplayName(fileObj.path);
          nodePositionMap[fileObj.path] = { x: curX + child.relX, y: 40 + child.relY };
          newNodes.push({
            id: fileObj.path,
            type: 'fileCard',
            parentId: groupId,
            extent: 'parent',
            position: { x: child.relX, y: child.relY },
            data: {
              fileName, folderPrefix, fullPath: fileObj.path,
              connCount: connectionCounts[fileObj.path] || 0,
              symbols: (fileObj.symbols || []).map(s => ({
                name: typeof s === 'string' ? s : s.name,
                kind: (typeof s === 'object' && s.kind) || 'function',
              })),
              showSymbols: isSymbolsMode,
              isSelected: selectedNodeIds.includes(fileObj.path),
              isNeighbor: neighborSet.has(fileObj.path),
              isDimmed: Boolean(selectedNodeId && selectedNodeId !== fileObj.path),
            } as FileCardData,
          });
        });

        curX += groupW + GROUP_GAP_X;
      });

      // ── Tests swimlane (bottom row) ────────────────────────────────────
      const testFiles = filesByFolder.tests || [];
      if (testFiles.length > 0) {
        const testsGroupId = 'group-tests';
        const testsY = maxTopH + GROUP_GAP_Y;
        const testCols = Math.min(4, Math.max(1, Math.ceil(testFiles.length / 2)));
        const testRows = Math.ceil(testFiles.length / testCols);
        const testChildNodes: Array<{ path: string; relX: number; relY: number }> = [];

        testFiles.forEach((f, i) => {
          const col = i % testCols;
          const row = Math.floor(i / testCols);
          const rx = GROUP_PAD_X + col * (NODE_W + NODE_SEP);
          const ry = GROUP_PAD_Y + row * (nodeH + RANK_SEP);
          testChildNodes.push({ path: f.path, relX: rx, relY: ry });
        });

        const testGroupW = GROUP_PAD_X * 2 + testCols * NODE_W + Math.max(0, testCols - 1) * NODE_SEP;
        const testGroupH = Math.max(160, GROUP_PAD_Y * 2 + testRows * nodeH + Math.max(0, testRows - 1) * RANK_SEP + 28);

        newNodes.push({
          id: testsGroupId,
          type: 'swimlaneGroup',
          position: { x: 40, y: testsY },
          data: { label: 'tests', fileCount: testFiles.length, width: testGroupW, height: testGroupH } as SwimlaneGroupData,
          draggable: false,
          selectable: false,
        });

        testChildNodes.forEach(child => {
          const fileObj = testFiles.find(f => f.path === child.path)!;
          const { fileName, folderPrefix } = formatFileDisplayName(fileObj.path);
          nodePositionMap[fileObj.path] = { x: 40 + child.relX, y: testsY + child.relY };
          newNodes.push({
            id: fileObj.path,
            type: 'fileCard',
            parentId: testsGroupId,
            extent: 'parent',
            position: { x: child.relX, y: child.relY },
            data: {
              fileName, folderPrefix: folderPrefix || 'tests/', fullPath: fileObj.path,
              connCount: connectionCounts[fileObj.path] || 0,
              symbols: (fileObj.symbols || []).map(s => ({
                name: typeof s === 'string' ? s : s.name,
                kind: (typeof s === 'object' && s.kind) || 'function',
              })),
              showSymbols: isSymbolsMode,
              isSelected: selectedNodeIds.includes(fileObj.path),
              isNeighbor: neighborSet.has(fileObj.path),
              isDimmed: Boolean(selectedNodeId && selectedNodeId !== fileObj.path),
            } as FileCardData,
          });
        });
      }
    } else {
      // ── Ungrouped layout ───────────────────────────────────────────────
      const cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(visibleFiles.length * 1.5))));
      const hasEdges = aggregatedEdges.length > 0;

      if (!hasEdges) {
        visibleFiles.forEach((f, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const rx = 60 + col * (NODE_W + NODE_SEP * 1.5);
          const ry = 60 + row * (nodeH + RANK_SEP * 1.5);
          const { fileName, folderPrefix } = formatFileDisplayName(f.path);
          nodePositionMap[f.path] = { x: rx, y: ry };
          newNodes.push({
            id: f.path,
            type: 'fileCard',
            position: { x: rx, y: ry },
            data: {
              fileName, folderPrefix, fullPath: f.path,
              connCount: connectionCounts[f.path] || 0,
              symbols: (f.symbols || []).map(s => ({
                name: typeof s === 'string' ? s : s.name,
                kind: (typeof s === 'object' && s.kind) || 'function',
              })),
              showSymbols: isSymbolsMode,
              isSelected: selectedNodeIds.includes(f.path),
              isNeighbor: neighborSet.has(f.path),
              isDimmed: Boolean(selectedNodeId && selectedNodeId !== f.path),
            } as FileCardData,
          });
        });
      } else {
        const g = new dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'LR', nodesep: NODE_SEP * 1.5, ranksep: RANK_SEP * 1.5, marginx: 60, marginy: 60 });
        g.setDefaultEdgeLabel(() => ({}));
        visibleFiles.forEach(f => g.setNode(f.path, { width: NODE_W, height: nodeH }));
        aggregatedEdges.forEach(e => {
          if (visibleFiles.some(f => f.path === e.source) && visibleFiles.some(f => f.path === e.target))
            g.setEdge(e.source, e.target);
        });
        dagre.layout(g);

        visibleFiles.forEach(f => {
          const pos = g.node(f.path);
          const { fileName, folderPrefix } = formatFileDisplayName(f.path);
          const rx = Math.round(pos.x - NODE_W / 2);
          const ry = Math.round(pos.y - nodeH / 2);
          nodePositionMap[f.path] = { x: rx, y: ry };
          newNodes.push({
            id: f.path,
            type: 'fileCard',
            position: { x: rx, y: ry },
            data: {
              fileName, folderPrefix, fullPath: f.path,
              connCount: connectionCounts[f.path] || 0,
              symbols: (f.symbols || []).map(s => ({
                name: typeof s === 'string' ? s : s.name,
                kind: (typeof s === 'object' && s.kind) || 'function',
              })),
              showSymbols: isSymbolsMode,
              isSelected: selectedNodeIds.includes(f.path),
              isNeighbor: neighborSet.has(f.path),
              isDimmed: Boolean(selectedNodeId && selectedNodeId !== f.path),
            } as FileCardData,
          });
        });
      }
    }

    // ── Build edges ────────────────────────────────────────────────────────
    const visiblePathSet = new Set(visibleFiles.map(f => f.path));

    aggregatedEdges.forEach((e, idx) => {
      if (!visiblePathSet.has(e.source) || !visiblePathSet.has(e.target)) return;

      const hasCalls    = e.calls    > 0 && filters.showCalls;
      const hasImports  = e.imports  > 0 && filters.showImports;
      const hasInherits = e.inherits > 0 && filters.showInherits;
      const hasUnresolved = e.unresolved > 0 && filters.showUnresolved;

      if (!hasCalls && !hasImports && !hasInherits && !hasUnresolved) return;

      const edgeId = `e-${e.source}->${e.target}-${idx}`;
      const isHovered = hoveredEdge?.edgeId === edgeId;
      const isEdgeActive = Boolean(
        isHovered ||
        (selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId))
      );

      // Pick primary type for color
      const primaryType = hasCalls ? 'calls' : hasImports ? 'imports' : hasInherits ? 'inherits' : 'unresolved';
      const edgeMeta = EDGE_COLORS[primaryType];
      const strokeColor = isEdgeActive ? edgeMeta.stroke : edgeMeta.stroke + 'b0';

      const strokeW = isHovered ? 3 : isEdgeActive ? 2.5 : 1.75;
      const opacity = selectedNodeId && !isEdgeActive ? 0.15 : 1;

      // Determine optimal anchor handles based on relative geometry
      const srcPos = nodePositionMap[e.source];
      const tgtPos = nodePositionMap[e.target];

      let sourceHandle = 'right-source';
      let targetHandle = 'left-target';

      if (srcPos && tgtPos) {
        const dx = tgtPos.x - srcPos.x;
        const dy = tgtPos.y - srcPos.y;

        if (dx > NODE_W * 0.75) {
          sourceHandle = 'right-source';
          targetHandle = 'left-target';
        } else if (dx < -NODE_W * 0.75) {
          sourceHandle = 'left-source';
          targetHandle = 'right-target';
        } else if (dy > 0) {
          sourceHandle = 'bottom-source';
          targetHandle = 'top-target';
        } else {
          sourceHandle = 'top-source';
          targetHandle = 'bottom-target';
        }
      }

      const { fileName: srcName } = formatFileDisplayName(e.source);
      const { fileName: tgtName } = formatFileDisplayName(e.target);

      let summary = 'Direct module dependency';
      if (hasCalls) summary = `${e.calls} function/method call${e.calls > 1 ? 's' : ''}`;
      else if (hasImports) summary = `${e.imports} module import${e.imports > 1 ? 's' : ''}`;
      else if (hasInherits) summary = 'Class inheritance relationship';

      newEdges.push({
        id: edgeId,
        source: e.source,
        target: e.target,
        sourceHandle,
        targetHandle,
        type: 'labeled',
        animated: isEdgeActive && hasCalls,
        data: {
          source: e.source,
          target: e.target,
          sourceName: srcName,
          targetName: tgtName,
          primaryKind: primaryType,
          calls: e.calls,
          imports: e.imports,
          inherits: e.inherits,
          unresolved: e.unresolved,
          summary,
          // Flags consumed by LabeledEdge to show/hide the midpoint badge
          isHovered,
          isSelected: Boolean(selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId)),
        },
        style: {
          stroke: strokeColor,
          strokeWidth: strokeW,
          strokeDasharray: hasUnresolved && !hasCalls && !hasImports ? '6 3' : undefined,
          opacity,
          cursor: 'pointer',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 20,
          height: 20,
        },
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [
    viewMode, filters, focusTarget, focusDirection,
    selectedNodeId, selectedNodeIds, neighborSet,
    aggregatedEdges, activeFiles, connectionCounts,
    hoveredEdge?.edgeId,
    setNodes, setEdges,
  ]);

  useEffect(() => { buildGraphLayout(); }, [buildGraphLayout]);

  // Fit view after layout settles
  const fitViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current);
    fitViewTimerRef.current = setTimeout(() => {
      fitView({ padding: 0.12, duration: 350 });
    }, 120);
    return () => { if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current); };
  }, [nodes.length, fitView]);

  // ── Event handlers ─────────────────────────────────────────────────────────
  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    if (node.type === 'swimlaneGroup') return;

    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setGraphSelection(node.id);

    const fileObj = activeFiles.find(f => f.path === node.id);
    if (!fileObj) return;

    const incoming: SelectedGraphItem['incoming'] = [];
    const outgoing: SelectedGraphItem['outgoing'] = [];

    aggregatedEdges.forEach(e => {
      if (e.target === node.id)
        incoming.push({ source: e.source.split('/').pop() || e.source, file: e.source, line: 0, kind: e.calls > 0 ? 'calls' : e.imports > 0 ? 'imports' : 'inherits', resolved: e.unresolved === 0 });
      if (e.source === node.id)
        outgoing.push({ target: e.target.split('/').pop() || e.target, file: e.target, line: 0, kind: e.calls > 0 ? 'calls' : e.imports > 0 ? 'imports' : 'inherits', resolved: e.unresolved === 0 });
    });

    setSelectedItemDetail({
      id: node.id,
      name: fileObj.path.split('/').pop() || fileObj.path,
      path: fileObj.path,
      type: 'file',
      summary: fileObj.summary || 'Code module analyzed with AST dependency graph.',
      symbols: (fileObj.symbols || []).map((s, idx) => ({
        name: typeof s === 'string' ? s : s.name,
        kind: (typeof s === 'object' && s.kind) || 'function',
        line: (typeof s === 'object' && s.line) || (12 + idx * 8),
      })),
      incoming,
      outgoing,
    });
  };

  const onEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: Edge) => {
    const edgeData = edge.data as any;
    setHoveredEdge({
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      sourceName: edgeData?.sourceName || edge.source.split('/').pop() || edge.source,
      targetName: edgeData?.targetName || edge.target.split('/').pop() || edge.target,
      primaryKind: edgeData?.primaryKind || 'dependency',
      calls: edgeData?.calls || 0,
      imports: edgeData?.imports || 0,
      inherits: edgeData?.inherits || 0,
      unresolved: edgeData?.unresolved || 0,
      summary: edgeData?.summary || 'Direct module dependency',
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onEdgeMouseMove = useCallback((event: React.MouseEvent) => {
    setHoveredEdge(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setHoveredEdge(null);
    setSelectedNodeId(edge.source);
    setSelectedNodeIds([edge.source, edge.target]);

    const sourceFile = activeFiles.find(f => f.path === edge.source);
    const edgeData = edge.data as any;
    if (sourceFile) {
      const incoming: SelectedGraphItem['incoming'] = [];
      const outgoing: SelectedGraphItem['outgoing'] = [
        {
          target: edge.target,
          file: edge.target,
          line: 1,
          kind: edgeData?.primaryKind || 'imports',
          resolved: edgeData?.unresolved === 0,
        },
      ];
      setSelectedItemDetail({
        id: edge.id,
        name: `${edgeData?.sourceName || edge.source.split('/').pop()} → ${edgeData?.targetName || edge.target.split('/').pop()}`,
        path: `${edge.source} → ${edge.target}`,
        type: 'file',
        summary: edgeData?.summary || `Direct connection: ${edgeData?.primaryKind?.toUpperCase() || 'DEPENDENCY'} from ${edge.source} to ${edge.target}.`,
        symbols: (sourceFile.symbols || []).map((s, idx) => ({
          name: typeof s === 'string' ? s : s.name,
          kind: (typeof s === 'object' && s.kind) || 'function',
          line: (typeof s === 'object' && s.line) || (12 + idx * 8),
        })),
        incoming,
        outgoing,
      });
    }
  }, [activeFiles]);

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const sel = params.nodes.filter(n => n.type === 'fileCard').map(n => n.id);
    setSelectedNodeIds(sel);
    if (sel.length === 1) setSelectedNodeId(sel[0]);
    else if (sel.length === 0) setSelectedNodeId(null);
  }, []);

  const handleClearSelection = () => {
    setSelectedNodeId(null); setSelectedNodeIds([]);
    setSelectedItemDetail(null); setGraphSelection(null);
  };

  const isFiltersHidingAll =
    !loading && !error &&
    nodes.filter(n => n.type === 'fileCard').length === 0 &&
    filters.selectedFilePaths.size === 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d14] overflow-hidden select-none relative font-sans">
      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <div className="h-12 px-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between shrink-0 z-20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight">Graph</h1>
            <span className="text-xs font-mono text-slate-500">
              ({activeFiles.length} files · {stats?.edges_count ?? aggregatedEdges.length} edges)
            </span>
          </div>
          <div className="pl-2">
            <SegmentedControl
              options={[
                { value: 'files',   label: 'Files',              icon: <Layers className="w-3.5 h-3.5" /> },
                { value: 'symbols', label: 'Functions & classes', icon: <Network className="w-3.5 h-3.5" /> },
              ]}
              value={viewMode}
              onChange={val => setViewMode(val as 'files' | 'symbols')}
              size="sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {focusTarget ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800 border border-indigo-500/40 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-slate-400">Focused:</span>
              <span className="text-slate-100 font-semibold">{focusTarget.split('/').pop()}</span>
              <button onClick={() => setFocusTarget(null)} className="text-slate-500 hover:text-slate-200 ml-1 underline text-[11px]">
                Clear focus
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

          {repoId && repoId !== 'default' && (
            <Button variant="secondary" size="sm" disabled={indexing || loading} onClick={handleIndexRepository}
              leftIcon={indexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}>
              {indexing ? 'Indexing...' : 'Index / Refresh'}
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={() => setControlsOpen(p => !p)}
            leftIcon={<Sliders className="w-3.5 h-3.5" />}>
            {controlsOpen ? 'Hide controls' : 'Controls'}
          </Button>
        </div>
      </div>

      {/* ── Main body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left sidebar */}
        <GraphControlsSidebar
          isOpen={controlsOpen}
          onToggleOpen={() => setControlsOpen(false)}
          filters={filters}
          onChangeFilters={setFilters}
          folderStructure={folderStructure}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectAllFiles={() => setFilters({ ...filters, selectedFilePaths: new Set(activeFiles.map(f => f.path)) })}
          onSelectNoneFiles={() => setFilters({ ...filters, selectedFilePaths: new Set() })}
        />

        {/* Canvas */}
        <main className="flex-1 h-full w-full relative overflow-hidden bg-[#080d14]">
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#080d14]/90 backdrop-blur-sm">
              <Skeleton className="h-64 w-[480px] rounded-2xl" />
              <div className="text-xs font-mono text-slate-500 animate-pulse">
                Constructing AST dependency graph…
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && !loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#080d14]">
              <ErrorState title="Graph rendering failed" whatHappened={error} onRetry={() => setReloadKey(k => k + 1)} />
            </div>
          )}

          {/* Empty state */}
          {activeFiles.length === 0 && !loading && !error && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#080d14] text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center">
                {indexing ? <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /> : <Network className="w-8 h-8 text-slate-600" />}
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-base font-semibold text-slate-200">
                  {indexing ? 'Indexing Repository…' : 'No graph data found'}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {indexing ? (
                    <>Parsing AST symbols and building Knowledge Graph for{' '}
                      <span className="text-slate-200 font-mono">{repoDisplayName}</span>…</>
                  ) : selectedRepo?.full_name || (repoId && repoId !== 'default') ? (
                    <><span className="text-slate-300 font-mono">{selectedRepo?.full_name || repoId}</span>{' '}
                      has not been indexed yet.</>
                  ) : 'No repository selected.'}
                </p>
                {indexError && (
                  <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-left">
                    {indexError}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {repoId && repoId !== 'default' && (
                  <Button variant="white" size="sm" disabled={indexing} onClick={handleIndexRepository}>
                    {indexing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Indexing…</> : 'Index repository'}
                  </Button>
                )}
                <Button variant="white" size="sm" disabled={indexing} onClick={() => navigate('/repos')}>
                  Select repository
                </Button>
              </div>
            </div>
          )}

          {/* No-edges warning */}
          {edges.length === 0 && !loading && !error && !isFiltersHidingAll && activeFiles.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs flex items-center gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>No relationships match the active filters.</span>
            </div>
          )}

          {/* All-filtered warning */}
          {isFiltersHidingAll && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#080d14] text-center px-6">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-200">All nodes are hidden by active filters</h3>
              <Button variant="white" size="sm" onClick={() => setFilters({ ...filters, selectedFilePaths: new Set(activeFiles.map(f => f.path)) })}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}>
                Reset filters
              </Button>
            </div>
          )}

          {/* React Flow graph canvas */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onSelectionChange={onSelectionChange}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseMove={onEdgeMouseMove}
            onEdgeMouseLeave={onEdgeMouseLeave}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={0.1}
            maxZoom={3}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            proOptions={{ hideAttribution: true }}
            className="bg-[#080d14]"
          >
            <Background
              color="#1e293b"
              gap={28}
              size={1}
              variant={BackgroundVariant.Dots}
            />
            <MiniMap
              nodeColor={n => {
                if (n.id === selectedNodeId) return '#6366f1';
                if (n.type === 'swimlaneGroup') return '#1e293b';
                return '#334155';
              }}
              maskColor="rgba(8,13,20,0.85)"
              className="!bottom-20 !right-6 !bg-slate-900 !border !border-slate-700/60 !rounded-xl !w-40 !h-28 !overflow-hidden !shadow-xl"
            />

            {/* Custom zoom controls */}
            <ZoomControls onFitView={() => fitView({ padding: 0.12, duration: 400 })} />

            {/* Legend */}
            <GraphLegend />
          </ReactFlow>

          {/* Hovered edge floating tooltip */}
          {hoveredEdge && (
            <div
              className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 px-3.5 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md text-slate-200 text-xs font-sans animate-in fade-in zoom-in-95 duration-150 min-w-[220px] max-w-[340px]"
              style={{ left: hoveredEdge.x, top: hoveredEdge.y - 12 }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-slate-800">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border ${
                  hoveredEdge.primaryKind === 'calls'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                    : hoveredEdge.primaryKind === 'imports'
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {hoveredEdge.primaryKind}
                </span>
                <span className="text-[10px] font-mono text-slate-400 font-semibold">
                  {hoveredEdge.calls > 0 ? `${hoveredEdge.calls} calls` : hoveredEdge.imports > 0 ? `${hoveredEdge.imports} imports` : 'dependency'}
                </span>
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-400 truncate">
                  <span className="text-slate-500 shrink-0 text-[10px]">Source:</span>
                  <span className="text-slate-200 font-semibold truncate">{hoveredEdge.sourceName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 truncate">
                  <span className="text-slate-500 shrink-0 text-[10px]">Target:</span>
                  <span className="text-slate-200 font-semibold truncate">{hoveredEdge.targetName}</span>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
                <span>{hoveredEdge.summary}</span>
                <span className="text-indigo-400 font-mono text-[9px]">Click to inspect</span>
              </div>
            </div>
          )}

          {/* Floating action bar */}
          {selectedNodeIds.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl flex items-center gap-3 font-mono text-xs">
              <span className="text-slate-200 font-semibold">{selectedNodeIds.length} selected</span>
              <div className="h-4 w-px bg-slate-700" />
              <Button variant="secondary" size="sm" onClick={() => { if (selectedNodeIds.length > 0) setFocusTarget(selectedNodeIds[0]); }}
                leftIcon={<Eye className="w-3.5 h-3.5 text-indigo-400" />}>
                Focus
              </Button>
              {selectedNodeIds.length === 2 && (
                <Button variant="secondary" size="sm"
                  onClick={() => navigate(`/w/${repoId}/connections?source=${encodeURIComponent(selectedNodeIds[0])}&target=${encodeURIComponent(selectedNodeIds[1])}`)}
                  leftIcon={<ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />}>
                  Compare
                </Button>
              )}
              <Button variant="green" size="sm"
                onClick={() => { const t = selectedNodeIds[0].split('/').pop()?.replace('.py','') || 'place_order'; setImpactTargets([t]); navigate(`/w/${repoId}/impact`); }}
                leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}>
                Analyze impact
              </Button>
              <button onClick={handleClearSelection} className="text-slate-600 hover:text-slate-300 p-1 rounded ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* Right details drawer */}
        {selectedItemDetail && (
          <GraphDetailsDrawer
            item={selectedItemDetail}
            onClose={() => { setSelectedItemDetail(null); setSelectedNodeId(null); }}
            onSelectNode={nodeId => {
              const fakeNode: Node = { id: nodeId, position: { x: 0, y: 0 }, data: {} };
              onNodeClick({} as React.MouseEvent, fakeNode);
            }}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="h-7 px-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between shrink-0 text-[11px] font-mono text-slate-600 z-20">
        <div className="flex items-center gap-4">
          <span>
            Showing{' '}
            <span className="text-slate-300 font-semibold">{nodes.filter(n => n.type === 'fileCard').length}</span>
            {' '}of{' '}
            <span className="text-slate-400">{activeFiles.length}</span> nodes
          </span>
          <span>·</span>
          <span>{edges.length} edges</span>
          <span>·</span>
          <span className="text-indigo-400 font-medium">Dagre Swimlane</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{selectedRepo?.full_name || repoDisplayName}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>
      </footer>
    </div>
  );
};

// ─── Exported component (wraps inner with ReactFlowProvider) ──────────────────
export const GraphViewPage: React.FC = () => (
  <ReactFlowProvider>
    <GraphViewInner />
  </ReactFlowProvider>
);

export default GraphViewPage;
