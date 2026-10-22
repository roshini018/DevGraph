import React, { useState, useRef, useEffect } from 'react';
import { Command } from 'cmdk';
import { Check, Search, ChevronDown, X } from 'lucide-react';

export interface ComboboxItem {
  id: string;
  label: string;
  group?: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

export interface ComboboxProps {
  items: ComboboxItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  multiSelect?: boolean;
  className?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({
  items,
  selectedIds,
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search items...',
  multiSelect = true,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Group items
  const groups = Array.from(new Set(items.map(i => i.group || 'General')));

  const toggleItem = (id: string) => {
    if (multiSelect) {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter(i => i !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange([id]);
      setOpen(false);
    }
  };

  const selectedItems = items.filter(i => selectedIds.includes(i.id));

  return (
    <div ref={wrapperRef} className={`relative font-sans text-xs ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-surface border border-line hover:border-line-strong text-text focus-visible:outline-none cursor-pointer transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1.5 overflow-hidden flex-wrap">
          {selectedItems.length === 0 ? (
            <span className="text-subtle">{placeholder}</span>
          ) : multiSelect ? (
            selectedItems.map(item => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-raised border border-line text-[11px] font-mono text-muted"
              >
                <span>{item.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    toggleItem(item.id);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      toggleItem(item.id);
                    }
                  }}
                  className="hover:text-text cursor-pointer"
                  aria-label={`Deselect ${item.label}`}
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </span>
            ))
          ) : (
            <span className="text-text font-medium">{selectedItems[0].label}</span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface border border-line-strong rounded-md shadow-xl overflow-hidden max-h-72 flex flex-col">
          <Command
            className="flex flex-col h-full bg-surface"
            filter={(value, searchStr) => {
              const item = items.find(i => i.id === value);
              if (!item) return 0;
              const text = `${item.label} ${item.sublabel || ''} ${item.group || ''}`.toLowerCase();
              return text.includes(searchStr.toLowerCase()) ? 1 : 0;
            }}
          >
            {/* Search Input */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-raised/30">
              <Search className="w-3.5 h-3.5 text-subtle shrink-0" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-text placeholder:text-subtle focus:outline-none"
              />
            </div>

            <Command.List className="overflow-y-auto p-1 max-h-56">
              <Command.Empty className="px-3 py-3 text-center text-subtle text-xs">
                No results found.
              </Command.Empty>

              {groups.map(groupName => {
                const groupItems = items.filter(
                  i => (i.group || 'General') === groupName
                );
                if (groupItems.length === 0) return null;

                return (
                  <Command.Group
                    key={groupName}
                    heading={groupName}
                    className="py-1 text-[10px] font-mono font-semibold text-subtle uppercase px-2"
                  >
                    {groupItems.map(item => {
                      const isSelected = selectedIds.includes(item.id);

                      return (
                        <Command.Item
                          key={item.id}
                          value={item.id}
                          onSelect={() => toggleItem(item.id)}
                          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-xs select-none ${
                            isSelected
                              ? 'bg-raised text-text font-medium'
                              : 'text-muted hover:bg-raised hover:text-text'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {item.icon && (
                              <span className="text-subtle shrink-0">
                                {item.icon}
                              </span>
                            )}
                            <span className="truncate">{item.label}</span>
                            {item.sublabel && (
                              <span className="text-subtle text-[10px] font-mono truncate">
                                {item.sublabel}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-green-bright shrink-0" />
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
};
