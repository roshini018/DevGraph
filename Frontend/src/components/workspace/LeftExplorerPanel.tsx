import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  Search,
  ArrowRightLeft,
  Network,
  ShieldAlert,
  FileSymlink,
  Check,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getFileTree } from '../../api/client';
import type { TreeNode } from '../../types/api';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';

// Static connection count mapping for analyzed Python files in mock repo
const CONNECTION_COUNTS: Record<string, number> = {
  'src/api/orders.py': 8,
  'src/services/order_service.py': 14,
  'src/services/payment_service.py': 11,
  'src/services/inventory_service.py': 7,
  'src/services/notification_service.py': 5,
  'src/models/order.py': 6,
  'src/models/payment.py': 5,
  'src/models/customer.py': 4,
  'src/utils/validators.py': 12,
  'src/utils/logger.py': 6,
  'src/config.py': 3,
  'src/main.py': 4,
  'tests/test_orders.py': 5,
  'tests/test_payment.py': 4,
  'tests/test_validators.py': 3,
  'tests/conftest.py': 2,
};

interface ContextMenuState {
  x: number;
  y: number;
  file: TreeNode;
}

export const LeftExplorerPanel: React.FC = () => {
  const navigate = useNavigate();
  const {
    openTab,
    activeFile,
    toggleLeftPanel,
    multiSelection,
    toggleMultiSelection,
    setMultiSelection,
    selectedRepo,
  } = useAppStore();

  const [tree, setTree] = useState<TreeNode | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['src', 'src/api', 'src/services', 'src/models', 'src/utils', 'tests'])
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const repoId = selectedRepo?.repo_name || 'my-store';

  useEffect(() => {
    let isMounted = true;
    getFileTree().then(t => {
      if (isMounted) setTree(t);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Close context menu on click outside or escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null);
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [contextMenu]);

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleFileClick = (node: TreeNode, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Ctrl/Cmd-click multi-select
      toggleMultiSelection(node.path);
    } else {
      openTab(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 200),
      file: node,
    });
  };

  const handleCompareConnections = () => {
    if (multiSelection.length === 2) {
      navigate(
        `/w/${repoId}/connections?source=${encodeURIComponent(
          multiSelection[0]
        )}&target=${encodeURIComponent(multiSelection[1])}`
      );
    } else {
      navigate(`/w/${repoId}/connections`);
    }
  };

  // Filter matching
  const nodeMatchesFilter = (node: TreeNode, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
      return true;
    }
    if (node.children) {
      return node.children.some(child => nodeMatchesFilter(child, query));
    }
    return false;
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isDir = node.type === 'directory';
    const isExpanded = expandedPaths.has(node.path) || Boolean(filterQuery);
    const isActive = activeFile === node.path;
    const isMultiSelected = multiSelection.includes(node.path);
    const isNotAnalyzed = node.name === 'README.md' || node.name === 'requirements.txt';
    const connCount = CONNECTION_COUNTS[node.path];

    if (filterQuery && !nodeMatchesFilter(node, filterQuery)) {
      return null;
    }

    if (node.id === 'root') {
      return (
        <div key="root" className="space-y-0.5">
          {node.children?.map(child => renderNode(child, depth))}
        </div>
      );
    }

    const folderName = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : '';

    return (
      <div key={node.path} className="select-none">
        <div
          onClick={e => {
            if (isDir) toggleExpand(node.path);
            else handleFileClick(node, e);
          }}
          onContextMenu={e => !isDir && handleContextMenu(e, node)}
          title={`${node.path}${folderName ? ` (in ${folderName})` : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          className={`group flex items-center justify-between py-1 pr-2 text-xs font-mono rounded cursor-pointer transition-colors relative ${
            isMultiSelected
              ? 'bg-raised border-l-2 border-green-bright text-text font-semibold'
              : isActive
              ? 'bg-raised text-text font-semibold'
              : isNotAnalyzed
              ? 'opacity-60 text-subtle hover:opacity-100 hover:text-muted'
              : 'text-muted hover:bg-raised/60 hover:text-text'
          }`}
        >
          {/* Left: Icon & Name */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isDir ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-subtle shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-subtle shrink-0" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-slate shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-subtle shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5" />
                {node.language === 'python' ? (
                  <FileCode className="w-3.5 h-3.5 text-green-bright shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-subtle shrink-0" />
                )}
              </>
            )}

            <span className="truncate">{node.name}</span>

            {/* Folder hint on hover for same-named files */}
            {folderName && !isDir && (
              <span className="hidden group-hover:inline text-[10px] text-subtle font-mono truncate pl-1">
                ({folderName})
              </span>
            )}
          </div>

          {/* Right: Badges */}
          <div className="flex items-center gap-1 shrink-0 pl-1">
            {/* Analyzed files show connection-count badge */}
            {!isDir && typeof connCount === 'number' && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-line text-subtle group-hover:text-muted group-hover:border-line-strong transition-colors"
                title={`${connCount} AST connections`}
              >
                {connCount}
              </span>
            )}

            {/* README.md and requirements.txt show 'Not analyzed' pill */}
            {!isDir && isNotAnalyzed && (
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-raised border border-line text-subtle uppercase tracking-tight">
                Not analyzed
              </span>
            )}

            {/* Multi-selected checkmark */}
            {isMultiSelected && (
              <Check className="w-3 h-3 text-green-bright shrink-0" />
            )}
          </div>
        </div>

        {/* Children */}
        {isDir && isExpanded && node.children && (
          <div className="space-y-0.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const hasTwoAnalyzedSelected =
    multiSelection.length === 2 &&
    multiSelection.every(path => typeof CONNECTION_COUNTS[path] === 'number');

  return (
    <aside
      aria-label="File Explorer"
      className="h-full flex flex-col bg-surface border-r border-line select-none overflow-hidden relative"
    >
      {/* Explorer Header */}
      <div className="h-9 px-3 border-b border-line flex items-center justify-between shrink-0 bg-surface">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Files
        </span>
        <Tooltip content="Collapse Explorer" side="right">
          <button
            type="button"
            onClick={toggleLeftPanel}
            className="text-subtle hover:text-text p-1 rounded transition-colors"
            aria-label="Collapse Explorer"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Filter Input */}
      <div className="p-2 border-b border-line shrink-0">
        <div className="relative">
          <Search className="w-3 h-3 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-ide border border-line focus:border-green-bright rounded pl-7 pr-2 py-1 text-xs text-text placeholder:text-subtle font-mono outline-none transition-colors"
          />
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5 font-sans">
        {tree ? (
          renderNode(tree)
        ) : (
          <div className="p-4 text-subtle text-xs animate-pulse">Loading tree...</div>
        )}
      </div>

      {/* Floating 'Compare connections' button when exactly two analyzed files are selected */}
      {hasTwoAnalyzedSelected && (
        <div className="p-2.5 border-t border-line bg-surface shrink-0 z-30">
          <Button
            variant="white"
            size="sm"
            onClick={handleCompareConnections}
            className="w-full text-xs"
            leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
          >
            Compare connections
          </Button>
          <div className="text-[10px] font-mono text-subtle text-center pt-1 truncate">
            2 files selected for trace
          </div>
        </div>
      )}

      {/* Multi-selection clear hint if items are selected */}
      {multiSelection.length > 0 && !hasTwoAnalyzedSelected && (
        <div className="p-2 border-t border-line bg-surface/80 flex items-center justify-between text-[11px] font-mono text-subtle shrink-0">
          <span>{multiSelection.length} selected</span>
          <button
            type="button"
            onClick={() => setMultiSelection([])}
            className="text-text hover:text-danger underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* File Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-48 bg-surface border border-line-strong rounded-md shadow-2xl p-1 text-xs font-mono divide-y divide-line select-none animate-in fade-in duration-100"
        >
          <div className="p-1 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                openTab(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded hover:bg-raised text-text transition-colors"
            >
              <FileSymlink className="w-3.5 h-3.5 text-muted" />
              <span>Open</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMultiSelection([contextMenu.file.path]);
                navigate(`/w/${repoId}/connections?source=${encodeURIComponent(contextMenu.file.path)}`);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded hover:bg-raised text-text transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate" />
              <span>Compare connections</span>
            </button>
          </div>

          <div className="p-1 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                navigate(`/w/${repoId}/graph`);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded hover:bg-raised text-text transition-colors"
            >
              <Network className="w-3.5 h-3.5 text-green-bright" />
              <span>View in graph</span>
            </button>
            <button
              type="button"
              onClick={() => {
                navigate(`/w/${repoId}/impact`);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded hover:bg-raised text-text transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-terracotta" />
              <span>What if I change this?</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default LeftExplorerPanel;
