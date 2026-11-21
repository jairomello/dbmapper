import type { ColumnModel, DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'
import { normalizeTypeForComparison } from './dialects'
import type {
  DdlColumnChange,
  DdlDiffOptions,
  DdlForeignKeyChange,
  DdlRenameChange,
  DdlStructuralDiff,
  DdlTableChange,
} from './types'
import {
  invalidColumnRenameWarning,
  invalidTableRenameWarning,
  orphanForeignKeyWarning,
} from './warnings'

interface TablePair {
  baseline: TableModel
  model: TableModel
  renamed: boolean
}

interface ColumnPair {
  baseline: ColumnModel
  model: ColumnModel
  renamed: boolean
}

function activeTables(model: DatabaseModel): TableModel[] {
  return (model.tables || []).filter((table) => table.status !== 'REMOVED')
}

function activeColumns(table: TableModel): ColumnModel[] {
  return (table.columns || []).filter((column) => column.status !== 'REMOVED')
}

function relationshipKey(relationship: RelationshipModel): string {
  return [
    relationship.table,
    relationship.local_columns.join(','),
    relationship.referenced_columns.join(','),
  ].join('|')
}

export function diffModels(
  baseline: DatabaseModel,
  model: DatabaseModel,
  options: DdlDiffOptions = {},
): DdlStructuralDiff {
  const renames = options.renames || {}
  const warnings: string[] = []
  const tables: DdlTableChange[] = []
  const columns: DdlColumnChange[] = []
  const foreignKeys: DdlForeignKeyChange[] = []
  const renameChanges: DdlRenameChange[] = []

  const baselineTables = activeTables(baseline)
  const modelTables = activeTables(model)
  const modelTableByName = new Map(modelTables.map((table) => [table.name, table]))
  const usedModelTables = new Set<string>()
  const pairByBaseline = new Map<string, TablePair>()

  for (const baselineTable of baselineTables) {
    const modelTable = modelTableByName.get(baselineTable.name)
    if (!modelTable) continue
    usedModelTables.add(modelTable.name)
    pairByBaseline.set(baselineTable.name, { baseline: baselineTable, model: modelTable, renamed: false })
  }

  for (const baselineTable of baselineTables) {
    if (pairByBaseline.has(baselineTable.name)) continue
    const target = renames.tables?.[baselineTable.name]
    if (!target) continue

    const modelTable = modelTableByName.get(target)
    if (!modelTable) {
      warnings.push(
        invalidTableRenameWarning(baselineTable.name, target, 'a tabela de destino não existe no modelo'),
      )
      continue
    }
    if (usedModelTables.has(modelTable.name)) {
      warnings.push(
        invalidTableRenameWarning(baselineTable.name, target, 'a tabela de destino já foi associada'),
      )
      continue
    }

    usedModelTables.add(modelTable.name)
    pairByBaseline.set(baselineTable.name, { baseline: baselineTable, model: modelTable, renamed: true })
    renameChanges.push({ kind: 'table', from: baselineTable.name, to: modelTable.name })
  }

  const pairByModel = new Map([...pairByBaseline.values()].map((pair) => [pair.model.name, pair]))
  const tableNameMap = new Map([...pairByBaseline.values()].map((pair) => [pair.baseline.name, pair.model.name]))
  const columnNameMaps = new Map<string, Map<string, string>>()
  const createdColumns: DdlColumnChange[] = []
  const removedColumns: DdlColumnChange[] = []
  const changedColumns: DdlColumnChange[] = []

  for (const modelTable of modelTables) {
    const pair = pairByModel.get(modelTable.name)
    if (!pair) continue

    const baselineColumns = activeColumns(pair.baseline)
    const modelColumns = activeColumns(pair.model)
    const modelColumnByName = new Map(modelColumns.map((column) => [column.name, column]))
    const usedModelColumns = new Set<string>()
    const pairByBaselineColumn = new Map<string, ColumnPair>()

    for (const baselineColumn of baselineColumns) {
      const modelColumn = modelColumnByName.get(baselineColumn.name)
      if (!modelColumn) continue
      usedModelColumns.add(modelColumn.name)
      pairByBaselineColumn.set(baselineColumn.name, {
        baseline: baselineColumn,
        model: modelColumn,
        renamed: false,
      })
    }

    for (const baselineColumn of baselineColumns) {
      if (pairByBaselineColumn.has(baselineColumn.name)) continue
      const source = `${pair.baseline.name}.${baselineColumn.name}`
      const target = renames.columns?.[source]
      if (!target) continue

      const modelColumn = modelColumnByName.get(target)
      if (!modelColumn) {
        warnings.push(
          invalidColumnRenameWarning(
            source,
            target,
            `a coluna de destino não existe na tabela "${pair.model.name}"`,
          ),
        )
        continue
      }
      if (usedModelColumns.has(modelColumn.name)) {
        warnings.push(
          invalidColumnRenameWarning(source, target, 'a coluna de destino já foi associada'),
        )
        continue
      }

      usedModelColumns.add(modelColumn.name)
      pairByBaselineColumn.set(baselineColumn.name, {
        baseline: baselineColumn,
        model: modelColumn,
        renamed: true,
      })
      renameChanges.push({
        kind: 'column',
        table: pair.model.name,
        from: baselineColumn.name,
        to: modelColumn.name,
      })
    }

    const columnNameMap = new Map<string, string>()
    for (const baselineColumn of baselineColumns) {
      const columnPair = pairByBaselineColumn.get(baselineColumn.name)
      if (columnPair) columnNameMap.set(columnPair.baseline.name, columnPair.model.name)
    }
    columnNameMaps.set(pair.baseline.name, columnNameMap)

    for (const modelColumn of modelColumns) {
      if (!usedModelColumns.has(modelColumn.name)) {
        createdColumns.push({
          table: pair.model.name,
          column: modelColumn.name,
          kind: 'created',
          previousType: null,
          currentType: modelColumn.type,
        })
      }
    }

    for (const baselineColumn of baselineColumns) {
      const columnPair = pairByBaselineColumn.get(baselineColumn.name)
      if (!columnPair) {
        removedColumns.push({
          table: pair.model.name,
          column: baselineColumn.name,
          kind: 'removed',
          previousType: baselineColumn.type,
          currentType: null,
        })
        continue
      }
      if (normalizeTypeForComparison(baselineColumn.type) !== normalizeTypeForComparison(columnPair.model.type)) {
        changedColumns.push({
          table: pair.model.name,
          column: columnPair.model.name,
          kind: 'typeChanged',
          previousType: baselineColumn.type,
          currentType: columnPair.model.type,
        })
      }
    }
  }

  columns.push(...createdColumns, ...removedColumns, ...changedColumns)

  const removedTables = baselineTables.filter((table) => !pairByBaseline.has(table.name))
  const createdTables = modelTables.filter((table) => !usedModelTables.has(table.name))

  for (const table of createdTables) tables.push({ name: table.name, kind: 'created' })
  for (const table of removedTables) tables.push({ name: table.name, kind: 'removed' })

  const activeModelTableNames = new Set(modelTables.map((table) => table.name))
  const createdForeignKeys: DdlForeignKeyChange[] = []
  const removedForeignKeys: DdlForeignKeyChange[] = []

  for (const modelTable of modelTables) {
    const pair = pairByModel.get(modelTable.name)
    const baselineKeys = new Set<string>()
    if (pair) {
      for (const relationship of pair.baseline.relationships?.parents || []) {
        baselineKeys.add(
          relationshipKey(normalizeBaselineRelationship(pair, relationship, tableNameMap, columnNameMaps)),
        )
      }
    }

    for (const relationship of modelTable.relationships?.parents || []) {
      if (!baselineKeys.has(relationshipKey(relationship))) {
        createdForeignKeys.push({ table: modelTable.name, kind: 'created', relationship })
        if (!activeModelTableNames.has(relationship.table)) {
          warnings.push(orphanForeignKeyWarning(modelTable.name, relationship))
        }
      }
    }
  }

  for (const baselineTable of baselineTables) {
    const pair = pairByBaseline.get(baselineTable.name)
    if (!pair) continue

    const modelKeys = new Set(
      (pair.model.relationships?.parents || []).map((relationship) => relationshipKey(relationship)),
    )

    for (const relationship of baselineTable.relationships?.parents || []) {
      const normalized = normalizeBaselineRelationship(pair, relationship, tableNameMap, columnNameMaps)
      if (!modelKeys.has(relationshipKey(normalized))) {
        removedForeignKeys.push({ table: pair.model.name, kind: 'removed', relationship: normalized })
      }
    }
  }

  foreignKeys.push(...createdForeignKeys, ...removedForeignKeys)

  return {
    tables,
    columns,
    foreignKeys,
    renames: renameChanges,
    warnings,
  }
}

function normalizeBaselineRelationship(
  pair: TablePair,
  relationship: RelationshipModel,
  tableNameMap: Map<string, string>,
  columnNameMaps: Map<string, Map<string, string>>,
): RelationshipModel {
  const ownerColumnMap = columnNameMaps.get(pair.baseline.name)
  const targetColumnMap = columnNameMaps.get(relationship.table)

  return {
    table: tableNameMap.get(relationship.table) || relationship.table,
    local_columns: relationship.local_columns.map((column) => ownerColumnMap?.get(column) || column),
    referenced_columns: relationship.referenced_columns.map((column) => targetColumnMap?.get(column) || column),
    constraint_name: relationship.constraint_name,
    description: relationship.description,
    reviewed: relationship.reviewed,
  }
}
