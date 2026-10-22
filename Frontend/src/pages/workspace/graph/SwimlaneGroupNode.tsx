import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { Folder } from 'lucide-react';

export interface SwimlaneGroupData extends Record<string, unknown> {
  label: string;
  fileCount: number;
  width: number;
  height: number;
}

export const SwimlaneGroupNode: React.FC<NodeProps> = ({ data }) => {
  const groupData = data as unknown as SwimlaneGroupData;

  return (
    <div
      style={{
        width: `${groupData.width}px`,
        height: `${groupData.height}px`,
      }}
      className="rounded-xl border border-dashed border-line-strong bg-surface/25 select-none relative pointer-events-none transition-all duration-150"
    >
      {/* Header Strip with Folder Name in Geist Mono */}
      <div className="h-8 px-3.5 border-b border-dashed border-line-strong bg-raised/60 flex items-center justify-between text-subtle font-mono text-[11px] font-semibold uppercase tracking-wider rounded-t-xl">
        <div className="flex items-center gap-2 text-text">
          <Folder className="w-3.5 h-3.5 text-slate" />
          <span>{groupData.label}</span>
        </div>
        <span className="text-[10px] text-subtle font-normal lowercase">
          {groupData.fileCount} {groupData.fileCount === 1 ? 'file' : 'files'}
        </span>
      </div>
    </div>
  );
};

export default SwimlaneGroupNode;
