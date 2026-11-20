import type { ColumnModel, DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'
import type { DiagramPosition } from '../api/types'

export type CanvasAction =
  | 'table.create'
  | 'table.delete'
  | 'table.rename'
  | 'column.create'
  | 'column.delete'
  | 'column.update'
  | 'relationship.create'
  | 'relationship.delete'

export interface ReferencingRelationship {
  table: string
  relationship: RelationshipModel
}

export interface TableCreateParams {
  table: TableModel
  index: number
  referencingRelationships: ReferencingRelationship[]
}

export interface TableDeleteParams {
  table: TableModel
  index: number
  referencingRelationships: ReferencingRelationship[]
}

export interface TableRenameParams {
  from: string
  to: string
}

export interface ColumnCreateParams {
  table: string
  column: ColumnModel
  index: number
  relationships: RelationshipModel[]
}

export interface ColumnDeleteParams {
  table: string
  column: ColumnModel
  index: number
  relationships: RelationshipModel[]
}

export interface ColumnUpdateParams {
  table: string
  before: ColumnModel
  after: ColumnModel
}

export interface RelationshipCreateParams {
  table: string
  relationship: RelationshipModel
  columns: ColumnModel[]
}

export interface RelationshipDeleteParams {
  table: string
  relationship: RelationshipModel
  removeColumns: ColumnModel[]
}

export type CanvasCommand =
  | {
      action: 'table.create'
      params: TableCreateParams
      reverse_action: 'table.delete'
      reverse_params: TableDeleteParams
    }
  | {
      action: 'table.delete'
      params: TableDeleteParams
      reverse_action: 'table.create'
      reverse_params: TableCreateParams
    }
  | {
      action: 'table.rename'
      params: TableRenameParams
      reverse_action: 'table.rename'
      reverse_params: TableRenameParams
    }
  | {
      action: 'column.create'
      params: ColumnCreateParams
      reverse_action: 'column.delete'
      reverse_params: ColumnDeleteParams
    }
  | {
      action: 'column.delete'
      params: ColumnDeleteParams
      reverse_action: 'column.create'
      reverse_params: ColumnCreateParams
    }
  | {
      action: 'column.update'
      params: ColumnUpdateParams
      reverse_action: 'column.update'
      reverse_params: ColumnUpdateParams
    }
  | {
      action: 'relationship.create'
      params: RelationshipCreateParams
      reverse_action: 'relationship.delete'
      reverse_params: RelationshipDeleteParams
    }
  | {
      action: 'relationship.delete'
      params: RelationshipDeleteParams
      reverse_action: 'relationship.create'
      reverse_params: RelationshipCreateParams
    }

export type CommandParams =
  | TableCreateParams
  | TableDeleteParams
  | TableRenameParams
  | ColumnCreateParams
  | ColumnDeleteParams
  | ColumnUpdateParams
  | RelationshipCreateParams
  | RelationshipDeleteParams

export function newCommand(
  action: CanvasAction,
  params: CommandParams,
  reverse_action: CanvasAction,
  reverse_params: CommandParams,
): CanvasCommand {
  return { action, params, reverse_action, reverse_params } as CanvasCommand
}

function cloneDatabase(database: DatabaseModel): DatabaseModel {
  return JSON.parse(JSON.stringify(database)) as DatabaseModel
}

function findTable(database: DatabaseModel, name: string): TableModel | undefined {
  return database.tables.find((table) => table.name === name)
}

export function targetPrimaryColumn(table: TableModel | undefined): string | null {
  if (!table) return null
  return table.columns.find((column) => column.primary_key)?.name ?? null
}

export function suggestForeignKeyName(target: string): string {
  return `${target}_id`
}

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let index = 2
  while (existing.includes(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

export function uniqueTableName(database: DatabaseModel, base = 'nova_tabela'): string {
  return uniqueName(
    base,
    database.tables.map((table) => table.name),
  )
}

export function uniqueColumnName(table: TableModel | undefined, base = 'nova_coluna'): string {
  return uniqueName(
    base,
    (table?.columns ?? []).map((column) => column.name),
  )
}

export function tableNameError(database: DatabaseModel, name: string, ignore?: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Informe o nome da tabela.'
  const duplicated = database.tables.some((table) => table.name !== ignore && table.name === trimmed)
  if (duplicated) return `Já existe uma tabela chamada ${trimmed}.`
  return null
}

export function columnNameError(
  database: DatabaseModel,
  tableName: string,
  name: string,
  ignore?: string,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Informe o nome da coluna.'
  const table = findTable(database, tableName)
  if (!table) return 'Tabela não encontrada.'
  const duplicated = table.columns.some((column) => column.name !== ignore && column.name === trimmed)
  if (duplicated) return `A coluna ${trimmed} já existe em ${tableName}.`
  return null
}

export function relationshipConflict(
  database: DatabaseModel,
  source: string,
  target: string,
  fkColumnName: string,
): string | null {
  if (source === target) return 'Escolha tabelas diferentes para o relacionamento.'
  const sourceTable = findTable(database, source)
  const targetTable = findTable(database, target)
  if (!sourceTable) return 'Tabela de origem não encontrada.'
  if (!targetTable) return 'Tabela de destino não encontrada.'
  if (!targetPrimaryColumn(targetTable) && targetTable.columns.length === 0) {
    return 'A tabela de destino não possui coluna para referenciar.'
  }

  const name = fkColumnName.trim()
  if (!name) return 'Informe o nome da coluna estrangeira.'

  const existing = sourceTable.columns.find((column) => column.name === name)
  if (!existing) return null
  if (existing.primary_key) {
    return `A coluna ${name} já existe em ${source} como chave primária.`
  }

  const usedByOtherRelationship = (sourceTable.relationships?.parents ?? []).some(
    (relationship) => relationship.table !== target && relationship.local_columns.includes(name),
  )
  if (usedByOtherRelationship) {
    return `A coluna ${name} já é usada por outro relacionamento.`
  }

  return null
}

export function columnUsedByOtherRelationship(
  table: TableModel,
  columnName: string,
  relationship: RelationshipModel,
): boolean {
  return (table.relationships?.parents ?? []).some(
    (candidate) => candidate !== relationship && candidate.local_columns.includes(columnName),
  )
}

function makeColumn(input: { name: string; type: string; primaryKey?: boolean; foreignKey?: boolean }): ColumnModel {
  return {
    name: input.name,
    type: input.type,
    primary_key: input.primaryKey ?? false,
    foreign_key: input.foreignKey ?? false,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'NEW',
  }
}

export function createTableCommand(
  database: DatabaseModel,
  options: { name?: string; position?: DiagramPosition; columns?: ColumnModel[] } = {},
): CanvasCommand {
  const name = uniqueTableName(database, options.name?.trim() || 'nova_tabela')
  const table: TableModel = {
    name,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'NEW',
    relationships: { parents: [], children: [] },
    columns: options.columns ?? [makeColumn({ name: 'id', type: 'serial', primaryKey: true })],
  }
  const index = database.tables.length
  return newCommand('table.create', { table, index, referencingRelationships: [] }, 'table.delete', {
    table,
    index,
    referencingRelationships: [],
  })
}

export function deleteTableCommand(database: DatabaseModel, tableName: string): CanvasCommand {
  const table = findTable(database, tableName)
  if (!table) throw new Error(`Tabela ${tableName} não encontrada.`)
  const index = database.tables.findIndex((candidate) => candidate.name === tableName)
  const referencingRelationships: ReferencingRelationship[] = []
  for (const candidate of database.tables) {
    if (candidate.name === tableName) continue
    for (const relationship of candidate.relationships?.parents ?? []) {
      if (relationship.table === tableName) {
        referencingRelationships.push({ table: candidate.name, relationship })
      }
    }
  }

  const params: TableDeleteParams = { table, index, referencingRelationships }
  return newCommand('table.delete', params, 'table.create', params)
}

export function renameTableCommand(database: DatabaseModel, from: string, to: string): CanvasCommand {
  if (!findTable(database, from)) throw new Error(`Tabela ${from} não encontrada.`)
  const params: TableRenameParams = { from, to: to.trim() }
  const reverse: TableRenameParams = { from: to.trim(), to: from }
  return newCommand('table.rename', params, 'table.rename', reverse)
}

export function createColumnCommand(
  database: DatabaseModel,
  tableName: string,
  input: { name: string; type: string; primaryKey?: boolean; foreignKey?: boolean },
): CanvasCommand {
  const table = findTable(database, tableName)
  if (!table) throw new Error(`Tabela ${tableName} não encontrada.`)
  const column = makeColumn(input)
  const index = table.columns.length
  const params: ColumnCreateParams = { table: tableName, column, index, relationships: [] }
  const reverse: ColumnDeleteParams = { table: tableName, column, index, relationships: [] }
  return newCommand('column.create', params, 'column.delete', reverse)
}

export function deleteColumnCommand(database: DatabaseModel, tableName: string, columnName: string): CanvasCommand {
  const table = findTable(database, tableName)
  if (!table) throw new Error(`Tabela ${tableName} não encontrada.`)
  const index = table.columns.findIndex((column) => column.name === columnName)
  if (index < 0) throw new Error(`Coluna ${tableName}.${columnName} não encontrada.`)
  const column = table.columns[index]
  const relationships = (table.relationships?.parents ?? []).filter((relationship) =>
    relationship.local_columns.includes(columnName),
  )
  const params: ColumnDeleteParams = { table: tableName, column, index, relationships }
  const reverse: ColumnCreateParams = { table: tableName, column, index, relationships }
  return newCommand('column.delete', params, 'column.create', reverse)
}

export function updateColumnCommand(
  _database: DatabaseModel,
  tableName: string,
  before: ColumnModel,
  after: ColumnModel,
): CanvasCommand {
  const params: ColumnUpdateParams = { table: tableName, before, after }
  const reverse: ColumnUpdateParams = { table: tableName, before: after, after: before }
  return newCommand('column.update', params, 'column.update', reverse)
}

export function createRelationshipCommand(
  database: DatabaseModel,
  options: {
    source: string
    target: string
    fkColumnName?: string
    referencedColumn?: string
    createFkColumn?: boolean
  },
): CanvasCommand {
  const sourceTable = findTable(database, options.source)
  const targetTable = findTable(database, options.target)
  if (!sourceTable) throw new Error(`Tabela ${options.source} não encontrada.`)
  if (!targetTable) throw new Error(`Tabela ${options.target} não encontrada.`)

  const referencedColumn = options.referencedColumn ?? targetPrimaryColumn(targetTable) ?? targetTable.columns[0]?.name
  if (!referencedColumn) throw new Error('A tabela de destino não possui coluna para referenciar.')

  const name = options.fkColumnName?.trim() || suggestForeignKeyName(options.target)
  const referenced = targetTable.columns.find((column) => column.name === referencedColumn)
  const existing = sourceTable.columns.find((column) => column.name === name)
  const columns: ColumnModel[] = []
  if (options.createFkColumn !== false && !existing) {
    columns.push(
      makeColumn({
        name,
        type: referenced?.type ?? 'int',
        foreignKey: true,
      }),
    )
  }

  const relationship: RelationshipModel = {
    table: options.target,
    local_columns: [name],
    referenced_columns: [referencedColumn],
    constraint_name: `fk_${options.source}_${options.target}`,
    description: '',
    reviewed: false,
  }

  const params: RelationshipCreateParams = { table: options.source, relationship, columns }
  const reverse: RelationshipDeleteParams = { table: options.source, relationship, removeColumns: columns }
  return newCommand('relationship.create', params, 'relationship.delete', reverse)
}

export function deleteRelationshipCommand(
  database: DatabaseModel,
  tableName: string,
  relationship: RelationshipModel,
): CanvasCommand {
  const table = findTable(database, tableName)
  if (!table) throw new Error(`Tabela ${tableName} não encontrada.`)
  const removeColumns = table.columns.filter(
    (column) =>
      relationship.local_columns.includes(column.name) &&
      !columnUsedByOtherRelationship(table, column.name, relationship),
  )
  const params: RelationshipDeleteParams = { table: tableName, relationship, removeColumns }
  const reverse: RelationshipCreateParams = {
    table: tableName,
    relationship,
    columns: removeColumns,
  }
  return newCommand('relationship.delete', params, 'relationship.create', reverse)
}

function relationshipKey(relationship: RelationshipModel): string {
  return [relationship.table, relationship.local_columns.join(','), relationship.referenced_columns.join(',')].join('|')
}

function normalizeModel(database: DatabaseModel): DatabaseModel {
  const byName = new Map(database.tables.map((table) => [table.name, table]))

  for (const table of database.tables) {
    table.relationships = table.relationships ?? { parents: [], children: [] }
    table.relationships.parents = table.relationships.parents ?? []
    table.relationships.children = []
    for (const relationship of table.relationships.parents) {
      for (const columnName of relationship.local_columns) {
        const column = table.columns.find((candidate) => candidate.name === columnName)
        if (column) column.foreign_key = true
      }
    }
  }

  for (const child of database.tables) {
    for (const parentRelationship of child.relationships.parents) {
      const parent = byName.get(parentRelationship.table)
      if (!parent) continue
      parent.relationships.children.push({
        table: child.name,
        local_columns: [...parentRelationship.referenced_columns],
        referenced_columns: [...parentRelationship.local_columns],
        constraint_name: parentRelationship.constraint_name,
        description: parentRelationship.description ?? '',
        reviewed: parentRelationship.reviewed ?? false,
      })
    }
  }

  for (const table of database.tables) {
    const seenParents = new Set<string>()
    table.relationships.parents = table.relationships.parents.filter((relationship) => {
      const key = relationshipKey(relationship)
      if (seenParents.has(key)) return false
      seenParents.add(key)
      return true
    })
    const seenChildren = new Set<string>()
    table.relationships.children = table.relationships.children.filter((relationship) => {
      const key = relationshipKey(relationship)
      if (seenChildren.has(key)) return false
      seenChildren.add(key)
      return true
    })
  }

  return database
}

function insertTable(
  database: DatabaseModel,
  table: TableModel,
  index: number,
  referencing: ReferencingRelationship[],
): void {
  if (database.tables.some((candidate) => candidate.name === table.name)) return
  const position = Math.min(Math.max(index, 0), database.tables.length)
  database.tables.splice(position, 0, table)
  for (const entry of referencing) {
    const candidate = findTable(database, entry.table)
    if (!candidate) continue
    candidate.relationships = candidate.relationships ?? { parents: [], children: [] }
    if (!candidate.relationships.parents.some((rel) => relationshipKey(rel) === relationshipKey(entry.relationship))) {
      candidate.relationships.parents.push(entry.relationship)
    }
  }
}

function removeRelationshipFromTable(table: TableModel, relationship: RelationshipModel): void {
  const key = relationshipKey(relationship)
  table.relationships = table.relationships ?? { parents: [], children: [] }
  table.relationships.parents = table.relationships.parents.filter((candidate) => relationshipKey(candidate) !== key)
}

function addRelationshipToTable(table: TableModel, relationship: RelationshipModel): void {
  table.relationships = table.relationships ?? { parents: [], children: [] }
  if (!table.relationships.parents.some((candidate) => relationshipKey(candidate) === relationshipKey(relationship))) {
    table.relationships.parents.push(relationship)
  }
}

export function applyCanvasAction(
  database: DatabaseModel,
  action: CanvasAction,
  rawParams: CommandParams,
): DatabaseModel {
  const next = cloneDatabase(database)

  switch (action) {
    case 'table.create': {
      const params = rawParams as TableCreateParams
      insertTable(next, params.table, params.index, params.referencingRelationships)
      break
    }
    case 'table.delete': {
      const params = rawParams as TableDeleteParams
      next.tables = next.tables.filter((table) => table.name !== params.table.name)
      for (const table of next.tables) {
        table.relationships = table.relationships ?? { parents: [], children: [] }
        table.relationships.parents = table.relationships.parents.filter(
          (relationship) => relationship.table !== params.table.name,
        )
      }
      break
    }
    case 'table.rename': {
      const params = rawParams as TableRenameParams
      const table = findTable(next, params.from)
      if (table) table.name = params.to
      for (const candidate of next.tables) {
        for (const relationship of candidate.relationships?.parents ?? []) {
          if (relationship.table === params.from) relationship.table = params.to
        }
      }
      break
    }
    case 'column.create': {
      const params = rawParams as ColumnCreateParams
      const table = findTable(next, params.table)
      if (table) {
        if (!table.columns.some((column) => column.name === params.column.name)) {
          const position = Math.min(Math.max(params.index, 0), table.columns.length)
          table.columns.splice(position, 0, { ...params.column })
        }
        for (const relationship of params.relationships ?? []) addRelationshipToTable(table, relationship)
      }
      break
    }
    case 'column.delete': {
      const params = rawParams as ColumnDeleteParams
      const table = findTable(next, params.table)
      if (table) {
        table.columns = table.columns.filter((column) => column.name !== params.column.name)
        for (const relationship of params.relationships ?? []) removeRelationshipFromTable(table, relationship)
        table.relationships.parents = table.relationships.parents.filter(
          (relationship) => !relationship.local_columns.includes(params.column.name),
        )
      }
      break
    }
    case 'column.update': {
      const params = rawParams as ColumnUpdateParams
      const table = findTable(next, params.table)
      if (table) {
        const index = table.columns.findIndex((column) => column.name === params.before.name)
        if (index >= 0) table.columns[index] = { ...params.after }
        if (params.before.name !== params.after.name) {
          for (const candidate of next.tables) {
            for (const relationship of candidate.relationships?.parents ?? []) {
              relationship.local_columns = relationship.local_columns.map((name) =>
                name === params.before.name ? params.after.name : name,
              )
              relationship.referenced_columns = relationship.referenced_columns.map((name) =>
                name === params.before.name ? params.after.name : name,
              )
            }
          }
        }
      }
      break
    }
    case 'relationship.create': {
      const params = rawParams as RelationshipCreateParams
      const table = findTable(next, params.table)
      if (table) {
        for (const column of params.columns ?? []) {
          if (!table.columns.some((candidate) => candidate.name === column.name)) {
            table.columns.push({ ...column })
          }
        }
        addRelationshipToTable(table, params.relationship)
      }
      break
    }
    case 'relationship.delete': {
      const params = rawParams as RelationshipDeleteParams
      const table = findTable(next, params.table)
      if (table) {
        removeRelationshipFromTable(table, params.relationship)
        const removed = new Set((params.removeColumns ?? []).map((column) => column.name))
        table.columns = table.columns.filter((column) => !removed.has(column.name))
      }
      break
    }
  }

  return normalizeModel(next)
}

export function applyCommand(database: DatabaseModel, command: CanvasCommand): DatabaseModel {
  return applyCanvasAction(database, command.action, command.params)
}

export function applyReverseCommand(database: DatabaseModel, command: CanvasCommand): DatabaseModel {
  return applyCanvasAction(database, command.reverse_action, command.reverse_params)
}
