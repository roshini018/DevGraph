import React from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  Globe,
  Layers,
  Database,
  Wrench,
  FlaskConical,
  Folder,
} from 'lucide-react';

export interface SwimlaneGroupData extends Record<string, unknown> {
  label: string;
  fileCount: number;
  width: number;
  height: number;
}

const folderMeta: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  api: {
    icon: <Globe className="w-3.5 h-3.5" />,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/5',
    border: 'border-indigo-500/25',
  },
  services: {
    icon: <Layers className="w-3.5 h-3.5" />,
    color: 'text-violet-400',
    bg: 'bg-violet-500/5',
    border: 'border-violet-500/25',
  },
  models: {
    icon: <Database className="w-3.5 h-3.5" />,
    color: 'text-sky-400',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/25',
  },
  utils: {
    icon: <Wrench className="w-3.5 h-3.5" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/25',
  },
  tests: {
    icon: <FlaskConical className="w-3.5 h-3.5" />,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/25',
  },
};

export const SwimlaneGroupNode: React.FC<NodeProps> = ({ data }) => {
  const groupData = data as unknown as SwimlaneGroupData;
  const meta = folderMeta[groupData.label] ?? {
    icon: <Folder className="w-3.5 h-3.5" />,
    color: 'text-slate-400',
    bg: 'bg-slate-500/5',
    border: 'border-slate-500/25',
  };

  return (
    <div
      style={{ width: `${groupData.width}px`, height: `${groupData.height}px` }}
      className={`rounded-2xl border ${meta.border} ${meta.bg} select-none relative pointer-events-none transition-all duration-150`}
    >
      {/* Header strip */}
      <div
        className={`absolute top-0 inset-x-0 h-9 px-4 flex items-center justify-between rounded-t-2xl border-b ${meta.border} bg-slate-900/50 backdrop-blur-sm`}
      >
        <div className={`flex items-center gap-2 font-mono font-semibold text-xs tracking-widest uppercase ${meta.color}`}>
          {meta.icon}
          <span>{groupData.label}</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          {groupData.fileCount} {groupData.fileCount === 1 ? 'file' : 'files'}
        </span>
      </div>
    </div>
  );
};

export default SwimlaneGroupNode;
