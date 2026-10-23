import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileCode, Braces, Hash, Zap, Box } from 'lucide-react';

export interface FileCardData extends Record<string, unknown> {
  fileName: string;
  folderPrefix?: string;
  fullPath: string;
  connCount: number;
  symbols: Array<{ name: string; kind: 'function' | 'class' | 'method' | 'variable' | string }>;
  showSymbols: boolean;
  isSelected?: boolean;
  isNeighbor?: boolean;
  isDimmed?: boolean;
}

const kindIcon = (kind: string) => {
  switch (kind) {
    case 'class':     return <Box className="w-2.5 h-2.5 text-amber-400" />;
    case 'method':    return <Zap className="w-2.5 h-2.5 text-violet-400" />;
    case 'variable':  return <Hash className="w-2.5 h-2.5 text-sky-400" />;
    default:          return <Braces className="w-2.5 h-2.5 text-emerald-400" />;
  }
};

const kindColor = (kind: string) => {
  switch (kind) {
    case 'class':    return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'method':   return 'bg-violet-500/10 text-violet-300 border-violet-500/20';
    case 'variable': return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
    default:         return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }
};

export const FileCardNode: React.FC<NodeProps> = ({ data, selected }) => {
  const cardData = data as unknown as FileCardData;
  const isSelected = selected || cardData.isSelected;
  const isDimmed = cardData.isDimmed && !isSelected && !cardData.isNeighbor;
  const isNeighbor = cardData.isNeighbor && !isSelected;

  // Determine file extension to color the icon
  const ext = cardData.fileName.split('.').pop()?.toLowerCase() || '';
  const isPy = ext === 'py';
  const isTs = ext === 'ts' || ext === 'tsx';
  const isJs = ext === 'js' || ext === 'jsx';
  const iconColor = isSelected
    ? 'text-indigo-300'
    : isPy
    ? 'text-blue-400'
    : isTs
    ? 'text-sky-400'
    : isJs
    ? 'text-yellow-400'
    : 'text-slate-400';

  return (
    <div
      className={[
        'relative rounded-xl border transition-all duration-200 select-none font-sans shadow-md',
        'min-w-[200px] max-w-[280px]',
        isSelected
          ? 'border-indigo-400 ring-2 ring-indigo-500/40 bg-indigo-950/60 shadow-indigo-500/20 shadow-lg'
          : isNeighbor
          ? 'border-indigo-700/60 bg-slate-900/80'
          : 'border-slate-700/60 bg-slate-900/70 hover:border-slate-500 hover:bg-slate-800/80',
        isDimmed ? 'opacity-20 pointer-events-none' : 'opacity-100',
      ].join(' ')}
    >
      {/* Handles — directional anchor points on all four sides */}
      <Handle id="top-target" type="target" position={Position.Top}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="top-source" type="source" position={Position.Top}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="bottom-target" type="target" position={Position.Bottom}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="bottom-source" type="source" position={Position.Bottom}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="left-target" type="target" position={Position.Left}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="left-source" type="source" position={Position.Left}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="right-target" type="target" position={Position.Right}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />
      <Handle id="right-source" type="source" position={Position.Right}
        className="!w-2 !h-2 !bg-transparent !border-0 !opacity-0" />

      {/* Top accent stripe */}
      {isSelected && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 rounded-t-xl" />
      )}

      {/* Card Header */}
      <div className="px-3 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`shrink-0 p-1 rounded-md ${isSelected ? 'bg-indigo-500/20' : 'bg-slate-800'}`}>
              <FileCode className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div className="min-w-0">
              {cardData.folderPrefix && (
                <div className="text-[10px] font-mono text-slate-500 truncate leading-none mb-0.5">
                  {cardData.folderPrefix}
                </div>
              )}
              <div className={`text-sm font-semibold font-mono truncate leading-tight ${
                isSelected ? 'text-indigo-200' : 'text-slate-100'
              }`}>
                {cardData.fileName}
              </div>
            </div>
          </div>

          {/* Connection count */}
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${
              isSelected
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : cardData.connCount > 5
                ? 'bg-slate-800 text-slate-300 border-slate-600'
                : 'bg-slate-800/60 text-slate-500 border-slate-700/60'
            }`}
            title={`${cardData.connCount} connections`}
          >
            {cardData.connCount}
          </span>
        </div>
      </div>

      {/* Symbol list — shown in symbols mode */}
      {cardData.showSymbols && cardData.symbols.length > 0 && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-700/40 mt-0.5">
          <div className="pt-2 space-y-1">
            {cardData.symbols.slice(0, 5).map((sym, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border text-[10px] font-mono ${kindColor(sym.kind)}`}>
                {kindIcon(sym.kind)}
                <span className="truncate">{sym.name}</span>
              </div>
            ))}
            {cardData.symbols.length > 5 && (
              <div className="text-[10px] font-mono text-slate-600 text-center pt-0.5">
                +{cardData.symbols.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileCardNode;
