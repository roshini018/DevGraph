import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

/**
 * Data fields expected in the edge `data` object.
 * All optional — falls back to sensible defaults.
 */
export interface LabeledEdgeData extends Record<string, unknown> {
  primaryKind?: string;
  calls?: number;
  imports?: number;
  inherits?: number;
  unresolved?: number;
  summary?: string;
  sourceName?: string;
  targetName?: string;
  /** Set true when the edge is being hovered (controlled by parent) */
  isHovered?: boolean;
  /** Set true when either endpoint node is selected */
  isSelected?: boolean;
}

// Color tokens matching GraphViewPage's EDGE_COLORS palette
const KIND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  calls:     { bg: 'rgba(34,211,238,0.12)', text: '#67e8f9', border: 'rgba(34,211,238,0.35)' },
  imports:   { bg: 'rgba(129,140,248,0.12)', text: '#a5b4fc', border: 'rgba(129,140,248,0.35)' },
  inherits:  { bg: 'rgba(245,158,11,0.12)', text: '#fcd34d', border: 'rgba(245,158,11,0.35)' },
  defines:   { bg: 'rgba(52,211,153,0.12)', text: '#6ee7b7', border: 'rgba(52,211,153,0.35)' },
  unresolved:{ bg: 'rgba(75,85,99,0.12)',  text: '#9ca3af', border: 'rgba(75,85,99,0.35)'   },
};

function getKindColors(kind: string) {
  return KIND_COLORS[kind] ?? KIND_COLORS['unresolved'];
}

export const LabeledEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const d = (data ?? {}) as LabeledEdgeData;
  const kind = d.primaryKind || 'dependency';
  const label = kind.toUpperCase();
  const showLabel = Boolean(d.isHovered || d.isSelected);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 20,
  });

  const colors = getKindColors(kind);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              zIndex: 10,
              background: d.isHovered
                ? 'rgba(8,13,20,0.96)'
                : 'rgba(15,23,42,0.88)',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: '2px 7px',
              fontSize: 10,
              fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: colors.text,
              backdropFilter: 'blur(6px)',
              boxShadow: d.isHovered
                ? `0 0 0 1px ${colors.border}, 0 4px 12px rgba(0,0,0,0.5)`
                : `0 1px 4px rgba(0,0,0,0.35)`,
              transition: 'box-shadow 120ms ease, opacity 120ms ease',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default LabeledEdge;
