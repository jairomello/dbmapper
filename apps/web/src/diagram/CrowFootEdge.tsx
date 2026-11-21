import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { manyFoot, oneTick, outward } from './crowfoot'
import type { DiagramEdge } from './layout'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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

  const relationship = data?.relationship
  const onDelete = data?.onDelete
  const table = data?.table
  const emphasis = data?.emphasis ?? 'none'
  const muted = data?.muted ?? false
  const directed = emphasis === 'outgoing' || emphasis === 'incoming'
  const animated = directed && !prefersReducedMotion()
  const stroke =
    emphasis === 'outgoing'
      ? 'var(--diagram-edge-out)'
      : emphasis === 'incoming'
        ? 'var(--diagram-edge-in)'
        : 'var(--diagram-edge-color)'
  const strokeWidth = directed ? 'var(--diagram-edge-strong-width)' : 'var(--diagram-edge-width)'
  const edgeStyle: CSSProperties = { ...style, stroke, strokeWidth }
  const edgeClassName = [
    'diagram-edge',
    directed ? `diagram-edge--${emphasis}` : '',
    muted ? 'diagram-edge--muted' : '',
    animated ? 'diagram-edge--animated' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const markScale = directed ? 1.4 : 1
  const markStyle: CSSProperties = { stroke, strokeWidth, opacity: muted ? 0.25 : 1 }

  function markTransform(x: number, y: number): string {
    return `translate(${x} ${y}) scale(${markScale}) translate(${-x} ${-y})`
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        className={edgeClassName}
        interactionWidth={interactionWidth}
      />
      <path
        d={manyFoot(sourceX, sourceY, outward(sourcePosition))}
        fill="none"
        style={markStyle}
        transform={markTransform(sourceX, sourceY)}
        pointerEvents="none"
      />
      <path
        d={oneTick(targetX, targetY, outward(targetPosition))}
        fill="none"
        style={markStyle}
        transform={markTransform(targetX, targetY)}
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
