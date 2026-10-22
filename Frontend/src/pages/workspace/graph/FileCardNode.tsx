import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileCode, Layers } from 'lucide-react';

export interface FileCardData extends Record<string, unknown> {
  fileName: string;
  folderPrefix?: string;
  fullPath: string;
  connCount: number;
  symbols: Array<{ name: string; kind: 'function' | 'class' | 'method' | 'variable' }>;
  showSymbols: boolean;
  isSelected?: boolean;
  isNeighbor?: boolean;
  isDimmed?: boolean;
}

export const FileCardNode: React.FC<NodeProps> = ({ data, selected }) => {
  const cardData = data as unknown as FileCardData;
  const isSelected = selected || cardData.isSelected;
  const isDimmed = cardData.isDimmed && !isSelected && !cardData.isNeighbor;

  return (
    <div
      className={`relative rounded-lg bg-surface border transition-all duration-150 select-none min-w-[170px] max-w-[240px] shadow-sm font-sans ${
        isSelected
          ? 'border-green-bright ring-1 ring-green-bright bg-raised'
          : cardData.isNeighbor
          ? 'border-line-strong bg-raised'
          : 'border-line hover:border-line-strong hover:bg-raised/70'
      } ${isDimmed ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
    >
      {/* Target & Source Handles on all sides for clean edge routing */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-line-strong !border-line !opacity-0 group-hover:!opacity-100"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-line-strong !border-line !opacity-0 group-hover:!opacity-100"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-line-strong !border-line !opacity-0 group-hover:!opacity-100"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-line-strong !border-line !opacity-0 group-hover:!opacity-100"
      />

      {/* Card Header Content */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          {/* File Icon & Name with dim parent prefix */}
          <div className="flex items-center gap-1.5 min-w-0">
            <FileCode
              className={`w-3.5 h-3.5 shrink-0 ${
                isSelected ? 'text-green-bright' : 'text-slate'
              }`}
            />
            <div className="truncate text-xs font-mono">
              {cardData.folderPrefix && (
                <span className="text-subtle text-[10px] mr-0.5">
                  {cardData.folderPrefix}
                </span>
              )}
              <span className="text-text font-semibold">{cardData.fileName}</span>
            </div>
          </div>

          {/* Connection Count Badge */}
          <span
            className={`px-1.5 py-0.2 rounded text-[10px] font-mono border shrink-0 ${
              isSelected
                ? 'bg-green-soft text-green-bright border-green/40 font-semibold'
                : 'bg-raised text-subtle border-line'
            }`}
            title={`${cardData.connCount} AST connections`}
          >
            {cardData.connCount} conn
          </span>
        </div>

        {/* In Symbol Mode: small pills inside their file card */}
        {cardData.showSymbols && cardData.symbols.length > 0 && (
          <div className="pt-1.5 border-t border-line space-y-1">
            <div className="flex items-center gap-1 text-[9px] font-mono text-subtle uppercase tracking-wider">
              <Layers className="w-2.5 h-2.5 text-green-bright" />
              <span>Symbols ({cardData.symbols.length})</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-hidden">
              {cardData.symbols.slice(0, 4).map((sym, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-raised border border-line text-[10px] font-mono text-muted truncate max-w-[130px]"
                >
                  {sym.name}
                </span>
              ))}
              {cardData.symbols.length > 4 && (
                <span className="px-1 py-0.5 rounded bg-raised border border-line text-[9px] font-mono text-subtle">
                  +{cardData.symbols.length - 4}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileCardNode;
