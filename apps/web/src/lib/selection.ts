import type { ColumnModel, DatabaseModel, TableModel } from '@dbmapper/domain'

export type Selection =
  | { type: 'database' }
  | { type: 'table'; table: string }
  | { type: 'column'; table: string; column: string }

export type SelectedItem = DatabaseModel | TableModel | ColumnModel

export interface ResolvedSelection {
  item: SelectedItem
  kind: Selection['type']
  table?: TableModel
  column?: ColumnModel
}

export function selectionKey(selection: Selection): string {
  if (selection.type === 'database') return 'database'
  if (selection.type === 'table') return `table:${selection.table}`
  return `column:${selection.table}.${selection.column}`
}

export function resolveSelection(database: DatabaseModel, selection: Selection): ResolvedSelection | null {
  if (selection.type === 'database') {
    return { item: database, kind: 'database' }
  }

  const table = database.tables.find((candidate) => candidate.name === selection.table && candidate.status !== 'REMOVED')
  if (!table) return null

  if (selection.type === 'table') {
    return { item: table, kind: 'table', table }
  }

  const column = table.columns.find((candidate) => candidate.name === selection.column)
  if (!column) return null

  return { item: column, kind: 'column', table, column }
}

export function selectionBreadcrumb(database: DatabaseModel, selection: Selection): string[] {
  if (selection.type === 'database') return [database.name]
  if (selection.type === 'table') return [database.name, selection.table]
  return [database.name, selection.table, selection.column]
}

export interface ItemDraft {
  description: string
  businessTerms: string[]
}

export interface ApplyDraftOptions {
  reopenOnEdit?: boolean
  reviewed?: boolean
}

function changedDescription(item: { description?: string }, description: string): boolean {
  return (item.description ?? '') !== description
}

function changedTerms(item: { business_terms: string[] }, businessTerms: string[]): boolean {
  const current = item.business_terms ?? []
  return current.length !== businessTerms.length || current.some((term, index) => term !== businessTerms[index])
}

export function applyDraft(
  database: DatabaseModel,
  selection: Selection,
  draft: ItemDraft,
  options: ApplyDraftOptions = {},
): DatabaseModel {
  const next = structuredClone(database)

  if (selection.type === 'database') {
    const shouldReopen =
      options.reopenOnEdit && next.reviewed && (changedDescription(next, draft.description) || changedTerms(next, draft.businessTerms))
    next.description = draft.description
    next.business_terms = [...draft.businessTerms]
    if (options.reviewed !== undefined) next.reviewed = options.reviewed
    else if (shouldReopen) next.reviewed = false
    return next
  }

  const table = next.tables.find((candidate) => candidate.name === selection.table)
  if (!table) return next

  if (selection.type === 'table') {
    const shouldReopen =
      options.reopenOnEdit && table.reviewed && (changedDescription(table, draft.description) || changedTerms(table, draft.businessTerms))
    table.description = draft.description
    table.business_terms = [...draft.businessTerms]
    if (options.reviewed !== undefined) table.reviewed = options.reviewed
    else if (shouldReopen) table.reviewed = false
    return next
  }

  const column = table.columns.find((candidate) => candidate.name === selection.column)
  if (!column) return next

  const shouldReopen =
    options.reopenOnEdit && column.reviewed && (changedDescription(column, draft.description) || changedTerms(column, draft.businessTerms))
  column.description = draft.description
  column.business_terms = [...draft.businessTerms]
  if (options.reviewed !== undefined) column.reviewed = options.reviewed
  else if (shouldReopen) column.reviewed = false

  return next
}
