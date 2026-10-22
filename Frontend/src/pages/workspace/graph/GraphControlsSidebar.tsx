import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  Sliders,
  Folder,
  Check,
  Minus,
  PanelLeftClose,
} from 'lucide-react';

export interface FolderFileItem {
  id: string;
  name: string;
  path: string;
}

export interface GraphFilterState {
  groupByFolder: boolean;
  showIsolated: boolean;
  showCalls: boolean;
  showImports: boolean;
  showInherits: boolean;
  showUnresolved: boolean;
  selectedFilePaths: Set<string>;
}

export interface GraphControlsSidebarProps {
  filters: GraphFilterState;
  onChangeFilters: (filters: GraphFilterState) => void;
  folderStructure: Record<string, FolderFileItem[]>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectAllFiles: () => void;
  onSelectNoneFiles: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const GraphControlsSidebar: React.FC<GraphControlsSidebarProps> = ({
  filters,
  onChangeFilters,
  folderStructure,
  searchQuery,
  onSearchChange,
  onSelectAllFiles,
  onSelectNoneFiles,
  isOpen,
  onToggleOpen,
}) => {
  // Accordion open sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    search: true,
    view: true,
    relationships: true,
    files: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleFile = (path: string) => {
    const next = new Set(filters.selectedFilePaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChangeFilters({ ...filters, selectedFilePaths: next });
  };

  const handleToggleFolder = (folderName: string) => {
    const files = folderStructure[folderName] || [];
    const allSelected = files.every(f => filters.selectedFilePaths.has(f.path));
    const next = new Set(filters.selectedFilePaths);

    if (allSelected) {
      files.forEach(f => next.delete(f.path));
    } else {
      files.forEach(f => next.add(f.path));
    }
    onChangeFilters({ ...filters, selectedFilePaths: next });
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Graph Controls"
      className="w-[280px] h-full bg-surface border-r border-line flex flex-col shrink-0 select-none overflow-hidden font-sans text-xs z-20"
    >
      {/* Header */}
      <div className="h-10 px-3.5 border-b border-line flex items-center justify-between shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-green-bright" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text">
            Graph Controls
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          className="text-subtle hover:text-text p-1 rounded transition-colors"
          aria-label="Collapse Graph Controls"
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Accordion Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-line font-sans">
        {/* 1. SEARCH SECTION */}
        <div className="p-3 space-y-2">
          <div
            onClick={() => toggleSection('search')}
            className="flex items-center justify-between cursor-pointer text-muted hover:text-text font-mono text-[11px] font-semibold uppercase tracking-wider"
          >
            <span>Search Graph</span>
            {openSections.search ? (
              <ChevronDown className="w-3 h-3 text-subtle" />
            ) : (
              <ChevronRight className="w-3 h-3 text-subtle" />
            )}
          </div>

          {openSections.search && (
            <div className="relative pt-1">
              <Search className="w-3 h-3 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Highlight node & pan..."
                className="w-full bg-ide border border-line focus:border-green-bright rounded pl-7 pr-2.5 py-1.5 text-xs text-text placeholder:text-subtle font-mono outline-none transition-colors"
              />
            </div>
          )}
        </div>

        {/* 2. VIEW SECTION */}
        <div className="p-3 space-y-2">
          <div
            onClick={() => toggleSection('view')}
            className="flex items-center justify-between cursor-pointer text-muted hover:text-text font-mono text-[11px] font-semibold uppercase tracking-wider"
          >
            <span>View Settings</span>
            {openSections.view ? (
              <ChevronDown className="w-3 h-3 text-subtle" />
            ) : (
              <ChevronRight className="w-3 h-3 text-subtle" />
            )}
          </div>

          {openSections.view && (
            <div className="space-y-2 pt-1 font-mono text-xs">
              {/* Group by folder */}
              <label className="flex items-center justify-between p-2 rounded bg-raised/50 hover:bg-raised border border-line cursor-pointer transition-colors">
                <span className="text-text">Group by folder</span>
                <input
                  type="checkbox"
                  checked={filters.groupByFolder}
                  onChange={e =>
                    onChangeFilters({ ...filters, groupByFolder: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-green rounded cursor-pointer"
                />
              </label>

              {/* Show isolated files */}
              <label className="flex items-center justify-between p-2 rounded bg-raised/50 hover:bg-raised border border-line cursor-pointer transition-colors">
                <span className="text-text">Show isolated files</span>
                <input
                  type="checkbox"
                  checked={filters.showIsolated}
                  onChange={e =>
                    onChangeFilters({ ...filters, showIsolated: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-green rounded cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {/* 3. RELATIONSHIPS SECTION (Custom checkboxes with line samples) */}
        <div className="p-3 space-y-2">
          <div
            onClick={() => toggleSection('relationships')}
            className="flex items-center justify-between cursor-pointer text-muted hover:text-text font-mono text-[11px] font-semibold uppercase tracking-wider"
          >
            <span>Relationships</span>
            {openSections.relationships ? (
              <ChevronDown className="w-3 h-3 text-subtle" />
            ) : (
              <ChevronRight className="w-3 h-3 text-subtle" />
            )}
          </div>

          {openSections.relationships && (
            <div className="space-y-1.5 pt-1 font-mono text-xs">
              {/* Calls: Green line */}
              <label className="flex items-center justify-between p-2 rounded bg-raised/50 hover:bg-raised border border-line cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-0.5 bg-green rounded-full inline-block" />
                  <span className="text-text">Calls</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.showCalls}
                  onChange={e =>
                    onChangeFilters({ ...filters, showCalls: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-green rounded cursor-pointer"
                />
              </label>

              {/* Imports: Slate line */}
              <label className="flex items-center justify-between p-2 rounded bg-raised/50 hover:bg-raised border border-line cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-0.5 bg-slate rounded-full inline-block" />
                  <span className="text-text">Imports</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.showImports}
                  onChange={e =>
                    onChangeFilters({ ...filters, showImports: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-green rounded cursor-pointer"
                />
              </label>

              {/* Inherits: Terracotta line */}
              <label className="flex items-center justify-between p-2 rounded bg-raised/50 hover:bg-raised border border-line cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-0.5 bg-terracotta rounded-full inline-block" />
                  <span className="text-text">Inherits</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.showInherits}
                  onChange={e =>
                    onChangeFilters({ ...filters, showInherits: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-green rounded cursor-pointer"
                />
              </label>

              {/* Unresolved: Dashed line */}
              <label className="flex items-center justify-between p-2 rounded bg-raised/50 hover:bg-raised border border-line cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-5 border-b border-dashed border-subtle inline-block" />
                  <span className="text-text">Unresolved</span>
                </div>
                <input
                  type="checkbox"
                  checked={filters.showUnresolved}
                  onChange={e =>
                    onChangeFilters({ ...filters, showUnresolved: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-green rounded cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {/* 4. FILES SECTION (Tri-state checkbox tree by folder) */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div
              onClick={() => toggleSection('files')}
              className="flex items-center gap-1.5 cursor-pointer text-muted hover:text-text font-mono text-[11px] font-semibold uppercase tracking-wider"
            >
              <span>Files Tree</span>
              {openSections.files ? (
                <ChevronDown className="w-3 h-3 text-subtle" />
              ) : (
                <ChevronRight className="w-3 h-3 text-subtle" />
              )}
            </div>

            <div className="flex items-center gap-2 font-mono text-[10px]">
              <button
                type="button"
                onClick={onSelectAllFiles}
                className="text-subtle hover:text-green-bright transition-colors"
              >
                All
              </button>
              <span className="text-line-strong">|</span>
              <button
                type="button"
                onClick={onSelectNoneFiles}
                className="text-subtle hover:text-text transition-colors"
              >
                None
              </button>
            </div>
          </div>

          {openSections.files && (
            <div className="space-y-2.5 pt-1 font-mono text-xs">
              {Object.entries(folderStructure).map(([folderName, files]) => {
                const selectedCount = files.filter(f =>
                  filters.selectedFilePaths.has(f.path)
                ).length;
                const isAllSelected = selectedCount === files.length && files.length > 0;
                const isSomeSelected = selectedCount > 0 && selectedCount < files.length;

                return (
                  <div key={folderName} className="space-y-1">
                    {/* Tri-state Folder Header */}
                    <div
                      onClick={() => handleToggleFolder(folderName)}
                      className="flex items-center justify-between p-1.5 rounded bg-raised/60 hover:bg-raised border border-line cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isAllSelected ? (
                          <div className="w-3.5 h-3.5 rounded bg-green flex items-center justify-center text-black">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : isSomeSelected ? (
                          <div className="w-3.5 h-3.5 rounded bg-green-soft border border-green flex items-center justify-center text-green-bright">
                            <Minus className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded border border-line-strong bg-ide" />
                        )}

                        <Folder className="w-3.5 h-3.5 text-slate shrink-0" />
                        <span className="text-text font-semibold truncate uppercase text-[11px]">
                          {folderName}
                        </span>
                      </div>

                      <span className="text-[10px] text-subtle shrink-0">
                        {selectedCount}/{files.length}
                      </span>
                    </div>

                    {/* Files in Folder */}
                    <div className="pl-4 space-y-0.5">
                      {files.map(file => {
                        const isChecked = filters.selectedFilePaths.has(file.path);
                        return (
                          <div
                            key={file.path}
                            onClick={() => handleToggleFile(file.path)}
                            className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer transition-colors text-[11px] ${
                              isChecked
                                ? 'text-text hover:bg-raised/70'
                                : 'text-subtle hover:bg-raised/40 hover:text-muted line-through opacity-70'
                            }`}
                          >
                            <span className="truncate">{file.name}</span>
                            <div
                              className={`w-3 h-3 rounded flex items-center justify-center ${
                                isChecked
                                  ? 'bg-green text-black'
                                  : 'border border-line bg-ide'
                              }`}
                            >
                              {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default GraphControlsSidebar;
