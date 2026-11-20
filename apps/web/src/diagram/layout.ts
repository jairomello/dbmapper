import type { DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'
import { type Edge, type Node, type NodeHandle, Position } from '@xyflow/react'
import type { DiagramPosition } from '../api/types'
import type { Selection } from '../lib/selection'

export const DIAGRAM_NODE_WIDTH = 260
const GRID_COLUMNS = 3
const GRID_ORIGIN_X = 80
const GRID_ORIGIN_Y = 80
const GRID_GAP_X = 80
const GRID_ROW_HEIGHT = 260
const NODE_HEADER_HEIGHT = 37
const NODE_COLUMN_HEIGHT = 28
const HANDLE_SIZE = 8

export interface DiagramRelationshipKey {
  table: string
  direction: 'outgoing' | 'incoming'
  localColumns: string[]
  referencedColumns: string[]
  constraintName: string
}

export interface DiagramRelationshipKeys {
  crossZone: DiagramRelationshipKey[]
  foreign: DiagramRelationshipKey[]
}

export const EMPTY_RELATIONSHIP_KEYS: DiagramRelationshipKeys = { crossZone: [], foreign: [] }

export interface DiagramNodeData extends Record<string, unknown> {
  table: TableModel
  active: boolean
  activeColumn: string | null
  tableMatch: boolean
  columnMatches: string[]
  searchActive: boolean
  draggable: boolean
  keys: DiagramRelationshipKeys
  canEdit?: boolean
  relationshipMode?: boolean
  onSelect: (selection: Selection) => void
  onPickTable?: (table: string) => void
  onAddColumn?: (table: string) => void
  onEditTable?: (table: string) => void
  onEditColumn?: (table: string, column: string) => void
  onDeleteColumn?: (table: string, column: string) => void
  onDeleteRelationship?: (table: string, relationship: RelationshipModel) => void
}

export type DiagramNode = Node<DiagramNodeData, 'table'>

export interface DiagramEdgeData extends Record<string, unknown> {
  constraintName: string
  localColumns: string[]
  referencedColumns: string[]
  sourceHandleId?: string
  targetHandleId?: string
  table?: string
  relationship?: RelationshipModel
  canEdit?: boolean
  onDelete?: (table: string, relationship: RelationshipModel) => void
}

export type DiagramEdge = Edge<DiagramEdgeData, 'crowsfoot'>

function estimatedNodeHeight(table: TableModel): number {
  return NODE_HEADER_HEIGHT + table.columns.length * NODE_COLUMN_HEIGHT + 2
}

function initialHandles(table: TableModel): NodeHandle[] {
  return table.columns.flatMap((column, index) => {
    const y = NODE_HEADER_HEIGHT + index * NODE_COLUMN_HEIGHT + NODE_COLUMN_HEIGHT / 2 - HANDLE_SIZE / 2
    return [
      {
        id: `col:${column.name}`,
        type: 'target' as const,
        position: Position.Left,
        x: 0,
        y,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
      {
        id: `col:${column.name}`,
        type: 'source' as const,
        position: Position.Right,
        x: DIAGRAM_NODE_WIDTH - HANDLE_SIZE,
        y,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
      },
    ]
  })
}

export function visibleTables(database: DatabaseModel): TableModel[] {
  return database.tables.filter((table) => table.status !== 'REMOVED')
}

export function buildRelationshipKeys(
  database: DatabaseModel,
  zoneOf: (table: string) => string | null,
): Record<string, DiagramRelationshipKeys> {
  const visible = visibleTables(database)
  const visibleNames = new Set(visible.map((table) => table.name))
  const keys: Record<string, DiagramRelationshipKeys> = {}

  function entry(table: string): DiagramRelationshipKeys {
    keys[table] ??= { crossZone: [], foreign: [] }
    return keys[table]
  }

  for (const table of visible) {
    const sourceZone = zoneOf(table.name)

    for (const relationship of table.relationships?.parents ?? []) {
      if (!visibleNames.has(relationship.table)) continue
      const targetZone = zoneOf(relationship.table)
      const crossZone = sourceZone !== null && targetZone !== null && sourceZone !== targetZone
      const shared = {
        localColumns: relationship.local_columns,
        referencedColumns: relationship.referenced_columns,
        constraintName: relationship.constraint_name,
      }

      const sourceKeys = entry(table.name)
      const targetKeys = entry(relationship.table)
      const target = crossZone ? 'crossZone' : 'foreign'

      sourceKeys[target].push({ ...shared, table: relationship.table, direction: 'outgoing' })
      targetKeys[target].push({ ...shared, table: table.name, direction: 'incoming' })
    }
  }

  return keys
}

export function gridPosition(index: number): DiagramPosition {
  return {
    x: GRID_ORIGIN_X + (index % GRID_COLUMNS) * (DIAGRAM_NODE_WIDTH + GRID_GAP_X),
    y: GRID_ORIGIN_Y + Math.floor(index / GRID_COLUMNS) * GRID_ROW_HEIGHT,
  }
}

export function isDiagramPosition(value: unknown): value is DiagramPosition {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  )
}

export function buildPositions(
  database: DatabaseModel,
  savedPositions: Record<string, DiagramPosition> = {},
): Record<string, DiagramPosition> {
  const positions: Record<string, DiagramPosition> = {}
  visibleTables(database).forEach((table, index) => {
    const saved = savedPositions[table.name]
    positions[table.name] = isDiagramPosition(saved) ? { x: saved.x, y: saved.y } : gridPosition(index)
  })
  return positions
}

export function buildZonePositions(
  members: readonly string[],
  savedPositions: Record<string, DiagramPosition> = {},
): Record<string, DiagramPosition> {
  const positions: Record<string, DiagramPosition> = {}
  members.forEach((name, index) => {
    const saved = savedPositions[name]
    positions[name] = isDiagramPosition(saved) ? { x: saved.x, y: saved.y } : gridPosition(index)
  })
  return positions
}

export function tableMatchKey(table: string): string {
  return `table:${table}`
}

export function columnMatchKey(table: string, column: string): string {
  return `column:${table}.${column}`
}

export function diagramMatches(database: DatabaseModel, query: string): Set<string> {
  const matches = new Set<string>()
  const needle = query.trim().toLowerCase()
  if (!needle) return matches

  for (const table of visibleTables(database)) {
    if (table.name.toLowerCase().includes(needle) || table.description.toLowerCase().includes(needle)) {
      matches.add(tableMatchKey(table.name))
    }
    for (const column of table.columns) {
      if (
        column.name.toLowerCase().includes(needle) ||
        column.description.toLowerCase().includes(needle) ||
        column.type.toLowerCase().includes(needle)
      ) {
        matches.add(columnMatchKey(table.name, column.name))
      }
    }
  }

  return matches
}

export function createDiagramNodes(options: {
  database: DatabaseModel
  positions: Record<string, DiagramPosition>
  selection: Selection
  matches: Set<string>
  query: string
  draggable: boolean
  keys?: Record<string, DiagramRelationshipKeys>
  onSelect: (selection: Selection) => void
  canEdit?: boolean
  relationshipMode?: boolean
  onPickTable?: (table: string) => void
  onAddColumn?: (table: string) => void
  onEditTable?: (table: string) => void
  onEditColumn?: (table: string, column: string) => void
  onDeleteColumn?: (table: string, column: string) => void
  onDeleteRelationship?: (table: string, relationship: RelationshipModel) => void
}): DiagramNode[] {
  const {
    database,
    positions,
    selection,
    matches,
    query,
    draggable,
    keys,
    onSelect,
    canEdit,
    relationshipMode,
    onPickTable,
    onAddColumn,
    onEditTable,
    onEditColumn,
    onDeleteColumn,
    onDeleteRelationship,
  } = options
  const searchActive = query.trim().length > 0
  const diagramKeys = keys ?? buildRelationshipKeys(database, () => null)

  return visibleTables(database).map((table, index) => {
    const active =
      (selection.type === 'table' && selection.table === table.name) ||
      (selection.type === 'column' && selection.table === table.name)
    const activeColumn = selection.type === 'column' && selection.table === table.name ? selection.column : null
    const columnMatches = table.columns
      .filter((column) => matches.has(columnMatchKey(table.name, column.name)))
      .map((column) => column.name)
    const tableMatch = matches.has(tableMatchKey(table.name)) || columnMatches.length > 0
    const position = isDiagramPosition(positions[table.name]) ? positions[table.name] : gridPosition(index)

    return {
      id: table.name,
      type: 'table',
      position,
      width: DIAGRAM_NODE_WIDTH,
      height: estimatedNodeHeight(table),
      measured: { width: DIAGRAM_NODE_WIDTH, height: estimatedNodeHeight(table) },
      handles: initialHandles(table),
      data: {
        table,
        active,
        activeColumn,
        tableMatch,
        columnMatches,
        searchActive,
        draggable,
        keys: diagramKeys[table.name] ?? EMPTY_RELATIONSHIP_KEYS,
        canEdit,
        relationshipMode,
        onSelect,
        onPickTable,
        onAddColumn,
        onEditTable,
        onEditColumn,
        onDeleteColumn,
        onDeleteRelationship,
      },
      draggable,
      dragHandle: '.diagram-drag-handle',
      selected: active,
    }
  })
}

export function createDiagramEdges(
  database: DatabaseModel,
  options: { canEdit?: boolean; onDelete?: (table: string, relationship: RelationshipModel) => void } = {},
): DiagramEdge[] {
  const { canEdit, onDelete } = options
  const tables = visibleTables(database)
  const byName = new Map(tables.map((table) => [table.name, table]))
  const edges: DiagramEdge[] = []
  const seen = new Set<string>()

  for (const table of tables) {
    const sourceColumns = new Set(table.columns.map((column) => column.name))

    for (const relationship of table.relationships?.parents ?? []) {
      const target = byName.get(relationship.table)
      if (!target) continue

      const targetColumns = new Set(target.columns.map((column) => column.name))
      const localColumn = relationship.local_columns.find((column) => sourceColumns.has(column))
      const referencedColumn = relationship.referenced_columns.find((column) => targetColumns.has(column))
      const sourceHandleId = localColumn ? `col:${localColumn}` : undefined
      const targetHandleId = referencedColumn ? `col:${referencedColumn}` : undefined
      const id = [
        'relationship',
        table.name,
        relationship.table,
        relationship.constraint_name || 'unamed',
        relationship.local_columns.join('+'),
      ].join(':')
      if (seen.has(id)) continue
      seen.add(id)

      edges.push({
        id,
        type: 'crowsfoot',
        source: table.name,
        target: relationship.table,
        sourceHandle: sourceHandleId,
        targetHandle: targetHandleId,
        ariaLabel: `Relacionamento ${table.name} → ${relationship.table} (${relationship.constraint_name})`,
        data: {
          constraintName: relationship.constraint_name,
          localColumns: relationship.local_columns,
          referencedColumns: relationship.referenced_columns,
          sourceHandleId,
          targetHandleId,
          table: table.name,
          relationship,
          canEdit,
          onDelete,
        },
      })
    }
  }

  return edges
}
