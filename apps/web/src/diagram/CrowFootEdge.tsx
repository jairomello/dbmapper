import { BaseEdge, type EdgeProps, getSmoothStepPath } from '@xyflow/react'
import { manyFoot, oneTick, outward } from './crowfoot'

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
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
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
    </>
  )
}
