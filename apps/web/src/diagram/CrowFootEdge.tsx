import { BaseEdge, type EdgeProps, getSmoothStepPath, Position } from '@xyflow/react'

function outward(position: Position | undefined): { x: number; y: number } {
  switch (position) {
    case Position.Left:
      return { x: -1, y: 0 }
    case Position.Right:
      return { x: 1, y: 0 }
    case Position.Top:
      return { x: 0, y: -1 }
    case Position.Bottom:
      return { x: 0, y: 1 }
    default:
      return { x: 0, y: 0 }
  }
}

function manyFoot(x: number, y: number, direction: { x: number; y: number }): string {
  const apex = { x: x + direction.x * 16, y: y + direction.y * 16 }
  const perp = { x: -direction.y, y: direction.x }
  const spread = 7
  const tips = [
    { x: x + perp.x * spread, y: y + perp.y * spread },
    { x, y },
    { x: -perp.x * spread, y: -perp.y * spread },
  ]
  return tips.map((tip) => `M ${apex.x} ${apex.y} L ${tip.x} ${tip.y}`).join(' ')
}

function oneTick(x: number, y: number, direction: { x: number; y: number }): string {
  const point = { x: x + direction.x * 15, y: y + direction.y * 15 }
  const perp = { x: -direction.y, y: direction.x }
  const spread = 7
  return `M ${point.x + perp.x * spread} ${point.y + perp.y * spread} L ${point.x - perp.x * spread} ${
    point.y - perp.y * spread
  }`
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
