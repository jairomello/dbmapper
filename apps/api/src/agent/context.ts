import { buildProjectContext } from '../persistence/context'
import type { AgentJobScope, ColumnRecord, ProjectAggregate, RelationshipRecord, TableRecord } from '../persistence/ports'

export interface AgentTargetColumn {
  type: string
  primaryKey: boolean
  foreignKey: boolean
}

export interface AgentTargetItem {
  itemType: 'table' | 'column'
  itemId: string
  name: string
  tableId: string
  tableName: string
  column?: AgentTargetColumn
}

export interface AgentTableContext {
  table: TableRecord
  targets: AgentTargetItem[]
  describedColumns: Array<{ name: string; type: string; description: string }>
  foreignKeys: Array<{ column: string; targetTable: string }>
}

export interface AgentContext {
  targets: AgentTargetItem[]
  tables: AgentTableContext[]
}

function needsDescription(description: string): boolean {
  return description.trim().length === 0
}

function foreignKeysOf(relationships: RelationshipRecord[]): Array<{ column: string; targetTable: string }> {
  return relationships.map((relationship) => ({
    column: relationship.localColumns.join(', '),
    targetTable: relationship.targetTable,
  }))
}

function tableTarget(table: TableRecord): AgentTargetItem {
  return {
    itemType: 'table',
    itemId: table.id,
    name: table.name,
    tableId: table.id,
    tableName: table.name,
  }
}

function columnTarget(table: TableRecord, column: ColumnRecord): AgentTargetItem {
  return {
    itemType: 'column',
    itemId: column.id,
    name: column.name,
    tableId: table.id,
    tableName: table.name,
    column: {
      type: column.type,
      primaryKey: column.primaryKey,
      foreignKey: column.foreignKey,
    },
  }
}

export function buildAgentContext(
  aggregate: ProjectAggregate,
  scope: AgentJobScope,
  tableId?: string | null,
): AgentContext | null {
  const context = buildProjectContext(aggregate)
  const selectedTables =
    scope === 'table' ? aggregate.tables.filter((table) => table.id === tableId) : aggregate.tables

  if (scope === 'table' && selectedTables.length === 0) return null

  const tables: AgentTableContext[] = []
  const targets: AgentTargetItem[] = []

  for (const table of selectedTables) {
    const columns = context.columnsByTableId.get(table.id) ?? []
    const tableTargets: AgentTargetItem[] = []

    if (needsDescription(table.description)) {
      tableTargets.push(tableTarget(table))
    }

    for (const column of columns) {
      if (needsDescription(column.description)) {
        tableTargets.push(columnTarget(table, column))
      }
    }

    if (tableTargets.length === 0) continue

    targets.push(...tableTargets)
    tables.push({
      table,
      targets: tableTargets,
      describedColumns: columns
        .filter((column) => !needsDescription(column.description))
        .map((column) => ({ name: column.name, type: column.type, description: column.description })),
      foreignKeys: foreignKeysOf(context.relationshipsByTableId.get(table.id) ?? []),
    })
  }

  return { targets, tables }
}
