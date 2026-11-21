import type { TableModel } from '@dbmapper/domain'
import type { DiagramPosition } from '../api/types'

export const DIAGRAM_NODE_WIDTH = 260
export const NODE_HEADER_HEIGHT = 38
export const NODE_COLUMN_HEIGHT = 29
export const GRID_COLUMNS = 3
export const GRID_ORIGIN_X = 80
export const GRID_ORIGIN_Y = 80
export const GRID_GAP_X = 80
export const GRID_ROW_HEIGHT = 260
export const LAYOUT_MIN_GAP = 40
export const NODE_FOOTER_HEADER_HEIGHT = 20
export const NODE_FOOTER_ROW_HEIGHT = 20
export const NODE_FOOTER_PADDING = 16

export function estimatedFooterHeight(table: TableModel): number {
  const rows = (table.relationships?.parents.length ?? 0) + (table.relationships?.children.length ?? 0)
  if (rows === 0) return 0
  const sections = 2
  return NODE_FOOTER_PADDING + sections * NODE_FOOTER_HEADER_HEIGHT + rows * NODE_FOOTER_ROW_HEIGHT
}

export function estimatedTableHeight(table: TableModel): number {
  return NODE_HEADER_HEIGHT + table.columns.length * NODE_COLUMN_HEIGHT + estimatedFooterHeight(table) + 2
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
  columns?: number
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

export function adaptiveColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))))
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

  const connected = levels.flat()
  const isolated = ordered.map((table) => table.name).filter((name) => !visited.has(name))

  interface ConnectedPlacement {
    boxes: LayoutBox[]
    width: number
    height: number
    right: number
  }

  function placeConnected(columns: number): ConnectedPlacement {
    const rows = Math.ceil(connected.length / columns)
    const centerRow = Math.floor((rows - 1) / 2)
    const centerColumn = Math.floor((columns - 1) / 2)

    const cells: Array<{ row: number; column: number; ring: number }> = []
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        cells.push({
          row,
          column,
          ring: Math.max(Math.abs(row - centerRow), Math.abs(column - centerColumn)),
        })
      }
    }
    cells.sort((a, b) => a.ring - b.ring || a.row - b.row || a.column - b.column)

    const placement = new Map<string, { row: number; column: number }>()
    connected.forEach((name, index) => {
      const cell = cells[index]
      if (cell) placement.set(name, { row: cell.row, column: cell.column })
    })

    const rowHeights: number[] = Array.from({ length: rows }, () => 0)
    for (const [name, cell] of placement) {
      const height = estimatedTableHeight(byName.get(name)!)
      rowHeights[cell.row] = Math.max(rowHeights[cell.row] ?? 0, height)
    }

    const rowTops: number[] = []
    let nextRowTop = originY
    for (let row = 0; row < rows; row++) {
      rowTops[row] = nextRowTop
      nextRowTop += (rowHeights[row] ?? 0) + gap
    }

    const boxes: LayoutBox[] = []
    for (const [name, cell] of placement) {
      const height = estimatedTableHeight(byName.get(name)!)
      const rowTop = rowTops[cell.row] ?? originY
      const rowHeight = rowHeights[cell.row] ?? height
      boxes.push({
        name,
        x: originX + cell.column * (DIAGRAM_NODE_WIDTH + GRID_GAP_X),
        y: rowTop + (rowHeight - height) / 2,
        width: DIAGRAM_NODE_WIDTH,
        height,
      })
    }

    const width = columns * (DIAGRAM_NODE_WIDTH + GRID_GAP_X) - GRID_GAP_X
    const height = Math.max(0, nextRowTop - gap - originY)
    return { boxes, width, height, right: originX + width }
  }

  const baseColumns = Math.ceil(Math.sqrt(connected.length))
  const candidateColumns = options.columns
    ? [Math.max(1, Math.floor(options.columns))]
    : Array.from({ length: baseColumns * 2 }, (_value, index) => Math.max(2, Math.floor(baseColumns / 2) + index))
        .filter((value) => value <= connected.length)
        .concat(connected.length === 1 ? [1] : [])

  let chosen = placeConnected(candidateColumns[0] ?? 1)
  for (const columns of candidateColumns.slice(1)) {
    const candidate = placeConnected(columns)
    if (Math.max(candidate.width, candidate.height) < Math.max(chosen.width, chosen.height)) chosen = candidate
  }

  const boxes = [...chosen.boxes]
  const stripX = chosen.right + GRID_GAP_X
  let stripY = originY
  for (const name of isolated) {
    const height = estimatedTableHeight(byName.get(name)!)
    boxes.push({ name, x: stripX, y: stripY, width: DIAGRAM_NODE_WIDTH, height })
    stripY += height + gap
  }

  return toPositions(boxes)
}
