import type { TableModel } from '@dbmapper/domain'
import type { DiagramPosition } from '../api/types'

export const DIAGRAM_NODE_WIDTH = 260
export const NODE_HEADER_HEIGHT = 37
export const NODE_COLUMN_HEIGHT = 28
export const GRID_COLUMNS = 3
export const GRID_ORIGIN_X = 80
export const GRID_ORIGIN_Y = 80
export const GRID_GAP_X = 80
export const GRID_ROW_HEIGHT = 260
export const LAYOUT_MIN_GAP = 40

export function estimatedTableHeight(table: TableModel): number {
  return NODE_HEADER_HEIGHT + table.columns.length * NODE_COLUMN_HEIGHT + 2
}

export function compareNames(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function sortTablesByName(tables: readonly TableModel[]): TableModel[] {
  return [...tables].sort((a, b) => compareNames(a.name, b.name) || b.columns.length - a.columns.length)
}

function uniqueTablesByName(tables: readonly TableModel[]): TableModel[] {
  const unique: TableModel[] = []
  let previous: string | null = null
  for (const table of sortTablesByName(tables)) {
    if (previous === table.name) continue
    unique.push(table)
    previous = table.name
  }
  return unique
}

export function gridPosition(index: number): DiagramPosition {
  return {
    x: GRID_ORIGIN_X + (index % GRID_COLUMNS) * (DIAGRAM_NODE_WIDTH + GRID_GAP_X),
    y: GRID_ORIGIN_Y + Math.floor(index / GRID_COLUMNS) * GRID_ROW_HEIGHT,
  }
}

export interface GridLayoutOptions {
  originX?: number
  originY?: number
  columns?: number
  gapX?: number
  gapY?: number
}

export interface LayoutRelationship {
  source: string
  target: string
}

export interface StarLayoutOptions {
  originX?: number
  originY?: number
  gap?: number
}

interface LayoutBox {
  name: string
  x: number
  y: number
  width: number
  height: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function overlaps(a: LayoutBox, b: LayoutBox, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
  )
}

function resolveOverlaps(boxes: LayoutBox[], gap: number): void {
  const placed: LayoutBox[] = []

  for (const box of boxes) {
    let y = box.y
    let collision = true

    while (collision) {
      collision = false
      for (const other of placed) {
        if (overlaps({ ...box, y }, other, gap)) {
          y = other.y + other.height + gap
          collision = true
        }
      }
    }

    box.y = y
    placed.push(box)
  }
}

function toPositions(boxes: readonly LayoutBox[]): Record<string, DiagramPosition> {
  const positions: Record<string, DiagramPosition> = {}
  for (const box of boxes) positions[box.name] = { x: round(box.x), y: round(box.y) }
  return positions
}

export function layoutGrid(
  tables: readonly TableModel[],
  options: GridLayoutOptions = {},
): Record<string, DiagramPosition> {
  const originX = options.originX ?? GRID_ORIGIN_X
  const originY = options.originY ?? GRID_ORIGIN_Y
  const columns = Math.max(1, Math.floor(options.columns ?? GRID_COLUMNS))
  const gapX = options.gapX ?? GRID_GAP_X
  const gapY = options.gapY ?? LAYOUT_MIN_GAP
  const ordered = uniqueTablesByName(tables)
  const boxes: LayoutBox[] = []
  let y = originY

  for (let start = 0; start < ordered.length; start += columns) {
    const row = ordered.slice(start, start + columns)
    const rowHeight = Math.max(0, ...row.map(estimatedTableHeight))
    row.forEach((table, index) => {
      boxes.push({
        name: table.name,
        x: originX + index * (DIAGRAM_NODE_WIDTH + gapX),
        y,
        width: DIAGRAM_NODE_WIDTH,
        height: estimatedTableHeight(table),
      })
    })
    y += Math.max(GRID_ROW_HEIGHT, rowHeight + gapY)
  }

  resolveOverlaps(boxes, gapY)
  return toPositions(boxes)
}

export function layoutStar(
  tables: readonly TableModel[],
  relationships: readonly LayoutRelationship[],
  options: StarLayoutOptions = {},
): Record<string, DiagramPosition> {
  const originX = options.originX ?? GRID_ORIGIN_X
  const originY = options.originY ?? GRID_ORIGIN_Y
  const gap = options.gap ?? LAYOUT_MIN_GAP
  const ordered = uniqueTablesByName(tables)
  if (ordered.length === 0) return {}

  const byName = new Map(ordered.map((table) => [table.name, table]))
  const names = new Set(byName.keys())
  const adjacency = new Map<string, Set<string>>()
  for (const table of ordered) adjacency.set(table.name, new Set())

  const usable = relationships.filter(
    (relationship) =>
      names.has(relationship.source) && names.has(relationship.target) && relationship.source !== relationship.target,
  )

  if (usable.length === 0) return layoutGrid(tables, options)

  for (const relationship of usable) {
    adjacency.get(relationship.source)?.add(relationship.target)
    adjacency.get(relationship.target)?.add(relationship.source)
  }

  let hub = ordered[0]?.name ?? ''
  let hubDegree = -1
  for (const table of ordered) {
    const degree = adjacency.get(table.name)?.size ?? 0
    if (degree > hubDegree) {
      hub = table.name
      hubDegree = degree
    }
  }

  if (hubDegree === 0) return layoutGrid(tables, options)

  const levels: string[][] = [[hub]]
  const visited = new Set<string>([hub])
  let frontier = [hub]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const name of frontier) {
      const neighbors = [...(adjacency.get(name) ?? [])].sort(compareNames)
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        next.push(neighbor)
      }
    }
    if (next.length === 0) break
    levels.push(next)
    frontier = next
  }

  const levelExtent = (level: readonly string[]): number =>
    Math.max(DIAGRAM_NODE_WIDTH, ...level.map((name) => estimatedTableHeight(byName.get(name)!)))

  const levelBoundingRadius = (level: readonly string[]): number =>
    Math.max(...level.map((name) => Math.hypot(DIAGRAM_NODE_WIDTH / 2, estimatedTableHeight(byName.get(name)!) / 2)))

  const hubExtent = levelExtent(levels[0] ?? [])
  const ringRadii: number[] = []
  let previousRadius = 0
  let previousExtent = levelBoundingRadius(levels[0] ?? [])

  for (let ring = 1; ring < levels.length; ring++) {
    const extent = levelBoundingRadius(levels[ring])
    const radiusByGap = previousRadius + previousExtent + gap + extent
    const count = levels[ring].length
    const radiusByCircumference = count > 1 ? (2 * extent + gap) / (2 * Math.sin(Math.PI / count)) : 0
    const radius = Math.max(radiusByGap, radiusByCircumference)
    ringRadii[ring] = radius
    previousRadius = radius
    previousExtent = extent
  }

  const outerRadius = levels.length > 1 ? ringRadii[levels.length - 1] : hubExtent / 2
  const maxExtent = Math.max(...levels.map((level) => levelExtent(level)))
  const centerX = originX + outerRadius + DIAGRAM_NODE_WIDTH / 2
  const centerY = originY + outerRadius + maxExtent / 2
  const boxes: LayoutBox[] = []
  const hubHeight = estimatedTableHeight(byName.get(hub)!)
  boxes.push({
    name: hub,
    x: centerX - DIAGRAM_NODE_WIDTH / 2,
    y: centerY - hubHeight / 2,
    width: DIAGRAM_NODE_WIDTH,
    height: hubHeight,
  })

  for (let ring = 1; ring < levels.length; ring++) {
    const radius = ringRadii[ring]
    const step = (2 * Math.PI) / levels[ring].length
    levels[ring].forEach((name, index) => {
      const angle = -Math.PI / 2 + index * step
      const height = estimatedTableHeight(byName.get(name)!)
      boxes.push({
        name,
        x: centerX + radius * Math.cos(angle) - DIAGRAM_NODE_WIDTH / 2,
        y: centerY + radius * Math.sin(angle) - height / 2,
        width: DIAGRAM_NODE_WIDTH,
        height,
      })
    })
  }

  const remaining = ordered.map((table) => table.name).filter((name) => !visited.has(name))
  const stripX = centerX + outerRadius + DIAGRAM_NODE_WIDTH / 2 + gap
  let stripY = originY
  for (const name of remaining) {
    const height = estimatedTableHeight(byName.get(name)!)
    boxes.push({ name, x: stripX, y: stripY, width: DIAGRAM_NODE_WIDTH, height })
    stripY += height + gap
  }

  resolveOverlaps(boxes, 0)
  return toPositions(boxes)
}
