import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react'
import { manyFoot, oneTick, outward } from './crowfoot'
import type { DiagramEdge } from './layout'

export function CrowFootEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  interactionWidth,
  data,
}: EdgeProps<DiagramEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: 24,
  })

  const stroke = style?.stroke ?? '#94a3b8'
  const relationship = data?.relationship
  const onDelete = data?.onDelete
  const table = data?.table

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} interactionWidth={interactionWidth} />
      <path
        d={`${manyFoot(sourceX, sourceY, outward(sourcePosition))} ${oneTick(targetX, targetY, outward(targetPosition))}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        pointerEvents="none"
      />
      {data?.canEdit && relationship && table && onDelete ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-red-600 shadow-sm hover:bg-red-50"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            data-testid={`diagram-edge-delete-${id}`}
            onClick={(event) => {
              event.stopPropagation()
              onDelete(table, relationship)
            }}
            aria-label={`Excluir relacionamento ${table} → ${relationship.table}`}
            title="Excluir relacionamento"
          >
            ×
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
