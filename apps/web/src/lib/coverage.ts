import type { DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'

export interface CoverageStats {
  totalTables: number
  totalCols: number
  descTables: number
  descCols: number
  revTables: number
  revCols: number
  pendingTotal: number
  pct: number
  dbName: string
  totalFks: number
  fksDesc: number
  fksRev: number
}

export function hasDescription(item: { description?: string }): boolean {
  return Boolean(item.description && item.description.trim() !== '')
}

export function computeStats(database: DatabaseModel): CoverageStats {
  const tables = database.tables.filter((table) => table.status !== 'REMOVED')

  const totalTables = tables.length
  const totalCols = tables.reduce((sum, table) => sum + table.columns.length, 0)

  const descTables = tables.filter(hasDescription).length
  const descCols = tables.reduce((sum, table) => sum + table.columns.filter(hasDescription).length, 0)

  const revTables = tables.filter((table) => hasDescription(table) && table.reviewed).length
  const revCols = tables.reduce(
    (sum, table) => sum + table.columns.filter((column) => hasDescription(column) && column.reviewed).length,
    0,
  )

  const pendingTotal = totalTables - revTables + (totalCols - revCols)

  const reviewable = totalTables + totalCols
  const reviewed = revTables + revCols
  const pct = reviewable > 0 ? Math.round((reviewed / reviewable) * 100) : 0

  const allParents = tables.flatMap((table: TableModel) => table.relationships?.parents ?? [])
  const totalFks = allParents.length
  const fksDesc = allParents.filter(hasDescription).length
  const fksRev = allParents.filter((relationship: RelationshipModel) => hasDescription(relationship) && relationship.reviewed).length

  return {
    totalTables,
    totalCols,
    descTables,
    descCols,
    revTables,
    revCols,
    pendingTotal,
    pct,
    dbName: database.name,
    totalFks,
    fksDesc,
    fksRev,
  }
}

export function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}
