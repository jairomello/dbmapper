import { Position } from '@xyflow/react'

export interface Direction {
  x: number
  y: number
}

export interface Point {
  x: number
  y: number
}

const FOOT_LENGTH = 16
const TICK_LENGTH = 15
const SPREAD = 7

export function outward(position: Position | undefined): Direction {
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

/** Pé de galinha (lado "muitos"): três hastes partindo do ápice e abrindo na borda da tabela. */
export function manyFoot(x: number, y: number, direction: Direction): string {
  const apex = { x: x + direction.x * FOOT_LENGTH, y: y + direction.y * FOOT_LENGTH }
  const perp = { x: -direction.y, y: direction.x }
  const tips: Point[] = [
    { x: x + perp.x * SPREAD, y: y + perp.y * SPREAD },
    { x, y },
    { x: x - perp.x * SPREAD, y: y - perp.y * SPREAD },
  ]
  return tips.map((tip) => `M ${apex.x} ${apex.y} L ${tip.x} ${tip.y}`).join(' ')
}

/** Traço único (lado "um"). */
export function oneTick(x: number, y: number, direction: Direction): string {
  const point = { x: x + direction.x * TICK_LENGTH, y: y + direction.y * TICK_LENGTH }
  const perp = { x: -direction.y, y: direction.x }
  return `M ${point.x + perp.x * SPREAD} ${point.y + perp.y * SPREAD} L ${point.x - perp.x * SPREAD} ${
    point.y - perp.y * SPREAD
  }`
}
