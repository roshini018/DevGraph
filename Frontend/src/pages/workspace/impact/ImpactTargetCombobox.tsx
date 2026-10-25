import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, FileCode, Box, Layers, Check } from 'lucide-react';
import { MOCK_FILES, MOCK_SYMBOLS } from '../../../mocks/repo';

export interface TargetOption {
  id: string;
  label: string;
  sublabel: string;
  group: 'Files' | 'Functions' | 'Classes';
}

interface ImpactTargetComboboxProps {
  selectedTargets: string[];
  onChange: (targets: string[]) => void;
  options?: TargetOption[];
}

export const ImpactTargetCombobox: React.FC<ImpactTargetComboboxProps> = ({
  selectedTargets,
  onChange,
  options,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compile all available options
  const allOptions = useMemo<TargetOption[]>(() => {
    if (options !== undefined) return options;

    const fileOptions: TargetOption[] = MOCK_FILES.map(f => {
      const parts = f.path.split('/');
      const fileName = parts[parts.length - 1];
      return {
        id: f.path,
        label: fileName,
        sublabel: f.path,
        group: 'Files',
      };
    });

    const functionOptions: TargetOption[] = MOCK_SYMBOLS.filter(
      s => s.kind === 'function' || s.kind === 'method'
    ).map(s => ({
      id: s.id,
      label: s.label,
      sublabel: `${s.file}:${s.start_line}`,
      group: 'Functions',
    }));

    const classOptions: TargetOption[] = MOCK_SYMBOLS.filter(
      s => s.kind === 'class'
    ).map(s => ({
      id: s.id,
      label: s.label,
      sublabel: `${s.file}:${s.start_line}`,
      group: 'Classes',
    }));

    return [...fileOptions, ...functionOptions, ...classOptions];
  }, [options]);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      opt =>
        opt.label.toLowerCase().includes(q) ||
        opt.id.toLowerCase().includes(q) ||
        opt.sublabel.toLowerCase().includes(q)
    );
  }, [allOptions, query]);

  // Group filtered options
  const grouped = useMemo(() => {
    const files = filteredOptions.filter(o => o.group === 'Files');
    const functions = filteredOptions.filter(o => o.group === 'Functions');
    const classes = filteredOptions.filter(o => o.group === 'Classes');
    return { Files: files, Functions: functions, Classes: classes };
  }, [filteredOptions]);

  // Handle outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToggle = (id: string) => {
    if (selectedTargets.includes(id)) {
      if (selectedTargets.length > 1) {
        onChange(selectedTargets.filter(t => t !== id));
      }
    } else {
      onChange([...selectedTargets, id]);
    }
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedTargets.length > 1) {
      onChange(selectedTargets.filter(t => t !== id));
    }
  };

  const getTargetIcon = (id: string) => {
    const opt = allOptions.find(o => o.id === id);
    if (!opt) return <Box className="w-3 h-3 text-green-bright" />;
    if (opt.group === 'Files') return <FileCode className="w-3 h-3 text-muted" />;
    if (opt.group === 'Classes') return <Layers className="w-3 h-3 text-slate" />;
    return <Box className="w-3 h-3 text-green-bright" />;
  };

  const getTargetLabel = (id: string) => {
    const opt = allOptions.find(o => o.id === id);
    if (opt) return opt.label;
    if (id.includes('/')) {
      const parts = id.split('/');
      return parts[parts.length - 1];
    }
    return id;
  };

  return (
    <div className="relative font-sans" ref={containerRef}>
      {/* Selected Chips */}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {selectedTargets.map(targetId => (
          <span
            key={targetId}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface border border-line-strong text-xs font-mono text-text select-none group hover:border-green transition-colors"
          >
            {getTargetIcon(targetId)}
            <span className="truncate max-w-[200px]" title={targetId}>
              {getTargetLabel(targetId)}
            </span>
            {selectedTargets.length > 1 && (
              <button
                type="button"
                onClick={e => handleRemove(targetId, e)}
                className="text-subtle hover:text-danger p-0.5 rounded transition-colors"
                aria-label={`Remove target ${targetId}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Input bar */}
      <div
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        className={`flex items-center gap-2 px-2.5 py-1.5 bg-surface border rounded text-xs cursor-text transition-colors ${
          isOpen ? 'border-green-bright ring-1 ring-green-bright/40' : 'border-line hover:border-line-strong'
        }`}
      >
        <Search className="w-3.5 h-3.5 text-subtle shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search files, functions, classes..."
          className="bg-transparent border-none outline-none text-xs text-text placeholder-subtle w-full font-mono"
        />
        {query && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setQuery('');
            }}
            className="text-subtle hover:text-text p-0.5 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto bg-surface border border-line-strong rounded-lg shadow-2xl z-50 divide-y divide-line font-sans select-none animate-in fade-in-50 duration-100">
          {(['Functions', 'Classes', 'Files'] as const).map(groupName => {
            const list = grouped[groupName];
            if (list.length === 0) return null;
            return (
              <div key={groupName} className="p-1">
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-subtle font-semibold">
                  {groupName} ({list.length})
                </div>
                {list.map(opt => {
                  const isSelected = selectedTargets.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleToggle(opt.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left text-xs transition-colors font-mono ${
                        isSelected
                          ? 'bg-green-soft/40 text-text'
                          : 'hover:bg-raised text-muted hover:text-text'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {groupName === 'Files' && (
                          <FileCode className="w-3.5 h-3.5 text-muted shrink-0" />
                        )}
                        {groupName === 'Classes' && (
                          <Layers className="w-3.5 h-3.5 text-slate shrink-0" />
                        )}
                        {groupName === 'Functions' && (
                          <Box className="w-3.5 h-3.5 text-green-bright shrink-0" />
                        )}
                        <div className="truncate">
                          <span className={isSelected ? 'text-green-bright font-medium' : 'text-text'}>
                            {opt.label}
                          </span>
                          <span className="text-[10px] text-subtle ml-2 truncate">
                            {opt.sublabel}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-green-bright shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {filteredOptions.length === 0 && (
            <div className="p-4 text-center text-xs text-subtle font-mono">
              No matching files or symbols found
            </div>
          )}
        </div>
      )}
    </div>
  );
};
