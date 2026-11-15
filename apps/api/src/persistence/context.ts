import type {
  ColumnRecord,
  ProjectAggregate,
  RelationshipRecord,
  TableRecord,
} from './ports'

export interface ProjectContext {
  aggregate: ProjectAggregate
  tableById: ReadonlyMap<string, TableRecord>
  columnsByTableId: ReadonlyMap<string, ColumnRecord[]>
  relationshipsByTableId: ReadonlyMap<string, RelationshipRecord[]>
}

export function buildProjectContext(aggregate: ProjectAggregate): ProjectContext {
  const tableById = new Map(aggregate.tables.map((table) => [table.id, table]))
  const columnsByTableId = new Map<string, ColumnRecord[]>()
  const relationshipsByTableId = new Map<string, RelationshipRecord[]>()

  for (const column of aggregate.columns) {
    const list = columnsByTableId.get(column.tableId) ?? []
    list.push(column)
    columnsByTableId.set(column.tableId, list)
  }

  for (const relationship of aggregate.relationships) {
    const list = relationshipsByTableId.get(relationship.tableId) ?? []
    list.push(relationship)
    relationshipsByTableId.set(relationship.tableId, list)
  }

  return {
    aggregate,
    tableById,
    columnsByTableId,
    relationshipsByTableId,
  }
}
