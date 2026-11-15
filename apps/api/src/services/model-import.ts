import { createHash } from 'node:crypto'
import type { DatabaseModel, RelationshipModel } from '@dbmapper/domain'
import type { ColumnGroup, TableRow, UpdateWizardState } from '@dbmapper/model-diff'
import {
  applyUpdateWizardState,
  buildColumnGroups,
  buildRelationshipGroups,
  buildTablePlans,
  createUpdateWizardState,
} from '@dbmapper/model-diff'
import { parseSQLToTables } from '@dbmapper/sql-parser'
import { ApiError } from '../errors'

export interface TableRename {
  from: string
  to: string
}

export interface ColumnRename {
  table: string
  from: string
  to: string
}

export interface RenameMapping {
  tables: TableRename[]
  columns: ColumnRename[]
}

export interface RelationshipChange {
  table: string
  target: string
  local_columns: string[]
  referenced_columns: string[]
  constraint_name: string
}

export interface ImportPlan {
  planHash: string
  baseModelHash: string
  sqlHash: string
  tables: {
    kept: string[]
    added: string[]
    removed: string[]
    renamed: Array<{ from: string; to: string }>
  }
  columns: {
    kept: Array<{ table: string; name: string }>
    added: Array<{ table: string; name: string; type: string }>
    removed: Array<{ table: string; name: string }>
    renamed: Array<{ table: string; from: string; to: string }>
    changed: Array<{ table: string; name: string; from: string; to: string }>
  }
  relationships: {
    kept: RelationshipChange[]
    added: RelationshipChange[]
    removed: RelationshipChange[]
  }
}

export interface ImportPlanResult {
  plan: ImportPlan
  state: UpdateWizardState
}

export interface ApplyImportResult {
  database: DatabaseModel
  plan: ImportPlan
}

export function emptyRenameMapping(): RenameMapping {
  return { tables: [], columns: [] }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      result[key] = canonicalize(record[key])
    }
    return result
  }
  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function baseModelHash(database: DatabaseModel): string {
  return sha256(stableStringify(database))
}

function invalidMapping(message: string): never {
  throw new ApiError(400, 'INVALID_RENAME_MAPPING', message)
}

function applyTableRenames(state: UpdateWizardState, mappings: TableRename[]): void {
  const usedTargets = new Set<string>()
  const usedSources = new Set<string>()

  for (const mapping of mappings) {
    if (mapping.from === mapping.to) {
      invalidMapping(`O mapeamento de tabela "${mapping.from}" não pode apontar para o mesmo nome.`)
    }
    if (usedSources.has(mapping.from)) {
      invalidMapping(`A tabela "${mapping.from}" aparece mais de uma vez no mapeamento.`)
    }
    if (usedTargets.has(mapping.to)) {
      invalidMapping(`O destino de renomeação "${mapping.to}" é usado por mais de uma tabela.`)
    }

    const row: TableRow | undefined = state.tableRows.find(
      (candidate) => candidate.kind === 'oldOnly' && candidate.oldName === mapping.from,
    )
    if (!row) {
      invalidMapping(`A tabela "${mapping.from}" não existe no modelo atual ou já foi preservada.`)
    }

    const targetExists = state.tableRows.some(
      (candidate) => candidate.kind === 'newOnly' && candidate.newName === mapping.to,
    )
    if (!targetExists) {
      invalidMapping(`A tabela "${mapping.to}" não existe no SQL novo.`)
    }

    row.action = 'rename'
    row.renameTo = mapping.to
    usedSources.add(mapping.from)
    usedTargets.add(mapping.to)
  }
}

function applyColumnRenames(state: UpdateWizardState, mappings: ColumnRename[]): void {
  const usedTargets = new Map<string, Set<string>>()
  const usedSources = new Set<string>()

  for (const mapping of mappings) {
    const group: ColumnGroup | undefined = state.columnGroups.find(
      (candidate) => candidate.oldTableName === mapping.table || candidate.newTableName === mapping.table,
    )
    if (!group || group.tableKind === 'add' || group.tableKind === 'delete') {
      invalidMapping(
        `A tabela "${mapping.table}" não está sendo preservada e não pode ter colunas renomeadas.`,
      )
    }

    const sourceKey = `${group.oldTableName}:${mapping.from}`
    if (usedSources.has(sourceKey)) {
      invalidMapping(`A coluna "${mapping.from}" de "${mapping.table}" aparece mais de uma vez no mapeamento.`)
    }

    const row = group.rows.find((candidate) => candidate.kind === 'oldOnly' && candidate.oldName === mapping.from)
    if (!row) {
      invalidMapping(`A coluna "${mapping.from}" não existe no modelo atual de "${mapping.table}".`)
    }

    const target = group.rows.find((candidate) => candidate.kind === 'newOnly' && candidate.newName === mapping.to)
    if (!target) {
      invalidMapping(`A coluna "${mapping.to}" não existe como coluna nova em "${mapping.table}".`)
    }

    const groupTargets = usedTargets.get(group.oldTableName) ?? new Set<string>()
    if (groupTargets.has(mapping.to)) {
      invalidMapping(`O destino de renomeação "${mapping.to}" é usado por mais de uma coluna em "${mapping.table}".`)
    }

    row.action = 'rename'
    row.renameTo = mapping.to
    groupTargets.add(mapping.to)
    usedTargets.set(group.oldTableName, groupTargets)
    usedSources.add(sourceKey)
  }
}

function relationshipChange(table: string, relationship: RelationshipModel): RelationshipChange {
  return {
    table,
    target: relationship.table,
    local_columns: [...relationship.local_columns],
    referenced_columns: [...relationship.referenced_columns],
    constraint_name: relationship.constraint_name,
  }
}

function summarizePlan(current: DatabaseModel, sql: string, state: UpdateWizardState): ImportPlan {
  const tables: ImportPlan['tables'] = { kept: [], added: [], removed: [], renamed: [] }

  for (const plan of buildTablePlans(state)) {
    if (plan.kind === 'matched') tables.kept.push(plan.oldName)
    if (plan.kind === 'add') tables.added.push(plan.newName)
    if (plan.kind === 'delete') tables.removed.push(plan.oldName)
    if (plan.kind === 'renamed') tables.renamed.push({ from: plan.oldName, to: plan.newName })
  }

  const columns: ImportPlan['columns'] = { kept: [], added: [], removed: [], renamed: [], changed: [] }

  for (const group of state.columnGroups) {
    const tableName = group.newTableName || group.oldTableName

    for (const row of group.rows) {
      if (row.kind === 'same') {
        columns.kept.push({ table: tableName, name: row.newName })
      } else if (row.kind === 'changed') {
        columns.changed.push({ table: tableName, name: row.newName, from: row.oldType, to: row.newType })
      } else if (row.kind === 'newOnly') {
        columns.added.push({ table: tableName, name: row.newName, type: row.newType })
      } else if (row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo) {
        columns.renamed.push({ table: tableName, from: row.oldName, to: row.renameTo })
      } else if (row.kind === 'oldOnly') {
        columns.removed.push({ table: tableName, name: row.oldName })
      }
    }
  }

  const relationships: ImportPlan['relationships'] = { kept: [], added: [], removed: [] }
  for (const group of state.relationshipGroups) {
    for (const row of group.rows) {
      if (row.kind === 'same') {
        relationships.kept.push(relationshipChange(group.tableName, row.newRelationship ?? row.oldRelationship!))
      } else if (row.kind === 'newOnly' && row.newRelationship) {
        relationships.added.push(relationshipChange(group.tableName, row.newRelationship))
      } else if (row.kind === 'oldOnly' && row.oldRelationship) {
        relationships.removed.push(relationshipChange(group.tableName, row.oldRelationship))
      }
    }
  }

  const planWithoutHash = {
    baseModelHash: baseModelHash(current),
    sqlHash: sha256(sql),
    tables,
    columns,
    relationships,
  }

  return {
    planHash: sha256(stableStringify(planWithoutHash)),
    ...planWithoutHash,
  }
}

function parseNewTables(sql: string) {
  try {
    return parseSQLToTables(sql)
  } catch (error) {
    throw new ApiError(
      400,
      'INVALID_SQL',
      error instanceof Error ? error.message : 'Não foi possível interpretar o SQL informado.',
    )
  }
}

export function buildImportPlan(
  current: DatabaseModel,
  sql: string,
  renames: RenameMapping = emptyRenameMapping(),
): ImportPlanResult {
  const newTables = parseNewTables(sql)
  const state = createUpdateWizardState(current, newTables)

  applyTableRenames(state, renames.tables)
  state.columnGroups = buildColumnGroups(state)
  applyColumnRenames(state, renames.columns)
  state.relationshipGroups = buildRelationshipGroups(state)

  return {
    plan: summarizePlan(current, sql, state),
    state,
  }
}

export function applyImportPlan(
  current: DatabaseModel,
  sql: string,
  renames: RenameMapping,
  submittedPlan: ImportPlan,
): ApplyImportResult {
  const { plan, state } = buildImportPlan(current, sql, renames)

  if (
    submittedPlan.baseModelHash !== plan.baseModelHash ||
    submittedPlan.sqlHash !== plan.sqlHash ||
    submittedPlan.planHash !== plan.planHash
  ) {
    throw new ApiError(
      409,
      'STALE_PLAN',
      'O plano de importação está desatualizado. Gere um novo preview antes de aplicar.',
      { retryable: true },
    )
  }

  const database = structuredClone(current)
  applyUpdateWizardState(database, state)

  return { database, plan }
}
