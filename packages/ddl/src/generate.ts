import type { ColumnModel, DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'
import { diffModels } from './diff'
import { quoteIdentifier, resolveColumnType } from './dialects'
import type { DdlDialect, DdlGenerationResult, DdlOptions, DdlStructuralDiff } from './types'
import {
  orphanForeignKeyWarning,
  removedColumnWarning,
  removedTableWarning,
  typeChangeWarning,
  unnamedForeignKeyWarning,
  unknownTypeWarning,
} from './warnings'

function activeTables(model: DatabaseModel): TableModel[] {
  return (model.tables || []).filter((table) => table.status !== 'REMOVED')
}

function activeColumns(table: TableModel): ColumnModel[] {
  return (table.columns || []).filter((column) => column.status !== 'REMOVED')
}

function quote(name: string, dialect: DdlDialect): string {
  return quoteIdentifier(name, dialect)
}

function createTableStatement(table: TableModel, dialect: DdlDialect, warnings: string[]): string {
  const columns = activeColumns(table)
  const primaryKeyColumns = columns.filter((column) => column.primary_key).map((column) => column.name)
  const lines: string[] = []

  for (const column of columns) {
    const resolved = resolveColumnType(column.type, dialect, column.primary_key)
    if (!resolved.known) warnings.push(unknownTypeWarning(table.name, column.name, column.type))
    lines.push(`  ${quote(column.name, dialect)} ${resolved.sqlType}`)
  }

  if (primaryKeyColumns.length > 0) {
    lines.push(`  PRIMARY KEY (${primaryKeyColumns.map((column) => quote(column, dialect)).join(', ')})`)
  }

  const body = lines.length > 0 ? `\n${lines.join(',\n')}\n` : ''
  return `CREATE TABLE ${quote(table.name, dialect)} (${body})`
}

function addForeignKeyStatement(tableName: string, relationship: RelationshipModel, dialect: DdlDialect): string {
  const constraint = relationship.constraint_name
    ? `CONSTRAINT ${quote(relationship.constraint_name, dialect)} `
    : ''
  const localColumns = relationship.local_columns.map((column) => quote(column, dialect)).join(', ')
  const referencedColumns = relationship.referenced_columns.map((column) => quote(column, dialect)).join(', ')

  return `ALTER TABLE ${quote(tableName, dialect)} ADD ${constraint}FOREIGN KEY (${localColumns}) REFERENCES ${quote(relationship.table, dialect)} (${referencedColumns})`
}

function dropForeignKeyStatement(tableName: string, constraintName: string, dialect: DdlDialect): string {
  if (dialect === 'mysql') {
    return `ALTER TABLE ${quote(tableName, dialect)} DROP FOREIGN KEY ${quote(constraintName, dialect)}`
  }
  return `ALTER TABLE ${quote(tableName, dialect)} DROP CONSTRAINT ${quote(constraintName, dialect)}`
}

function addColumnStatement(tableName: string, column: ColumnModel, dialect: DdlDialect, warnings: string[]): string {
  const resolved = resolveColumnType(column.type, dialect, column.primary_key)
  if (!resolved.known) warnings.push(unknownTypeWarning(tableName, column.name, column.type))
  return `ALTER TABLE ${quote(tableName, dialect)} ADD COLUMN ${quote(column.name, dialect)} ${resolved.sqlType}`
}

function changeColumnTypeStatement(
  tableName: string,
  column: ColumnModel,
  dialect: DdlDialect,
  warnings: string[],
): string {
  const resolved = resolveColumnType(column.type, dialect, column.primary_key)
  if (!resolved.known) warnings.push(unknownTypeWarning(tableName, column.name, column.type))

  if (dialect === 'mysql') {
    return `ALTER TABLE ${quote(tableName, dialect)} MODIFY COLUMN ${quote(column.name, dialect)} ${resolved.sqlType}`
  }
  return `ALTER TABLE ${quote(tableName, dialect)} ALTER COLUMN ${quote(column.name, dialect)} TYPE ${resolved.sqlType}`
}

export function generateCreateScript(model: DatabaseModel, options: DdlOptions): DdlGenerationResult {
  const dialect = options.dialect
  const statements: string[] = []
  const warnings: string[] = []
  const tables = activeTables(model)
  const tableNames = new Set(tables.map((table) => table.name))

  for (const table of tables) {
    statements.push(createTableStatement(table, dialect, warnings))
  }

  for (const table of tables) {
    for (const relationship of table.relationships?.parents || []) {
      if (!tableNames.has(relationship.table)) {
        warnings.push(orphanForeignKeyWarning(table.name, relationship))
        continue
      }
      statements.push(addForeignKeyStatement(table.name, relationship, dialect))
    }
  }

  return { statements, destructive: [], warnings }
}

export function generateMigrationScript(
  baseline: DatabaseModel,
  model: DatabaseModel,
  options: DdlOptions,
): DdlGenerationResult {
  const dialect = options.dialect
  const diff: DdlStructuralDiff = diffModels(baseline, model, { renames: options.renames })
  const statements: string[] = []
  const destructive: string[] = []
  const warnings: string[] = [...diff.warnings]
  const modelTables = activeTables(model)
  const modelTableByName = new Map(modelTables.map((table) => [table.name, table]))

  for (const rename of diff.renames) {
    if (rename.kind === 'table') {
      statements.push(`ALTER TABLE ${quote(rename.from, dialect)} RENAME TO ${quote(rename.to, dialect)}`)
    }
  }

  for (const rename of diff.renames) {
    if (rename.kind === 'column') {
      statements.push(
        `ALTER TABLE ${quote(rename.table, dialect)} RENAME COLUMN ${quote(rename.from, dialect)} TO ${quote(rename.to, dialect)}`,
      )
    }
  }

  for (const change of diff.tables) {
    if (change.kind !== 'created') continue
    const table = modelTableByName.get(change.name)
    if (!table) continue
    statements.push(createTableStatement(table, dialect, warnings))
  }

  for (const change of diff.columns) {
    if (change.kind !== 'created') continue
    const table = modelTableByName.get(change.table)
    const column = table ? activeColumns(table).find((candidate) => candidate.name === change.column) : undefined
    if (!table || !column) continue
    statements.push(addColumnStatement(change.table, column, dialect, warnings))
  }

  for (const change of diff.columns) {
    if (change.kind !== 'typeChanged') continue
    const table = modelTableByName.get(change.table)
    const column = table ? activeColumns(table).find((candidate) => candidate.name === change.column) : undefined
    if (!table || !column) continue
    statements.push(changeColumnTypeStatement(change.table, column, dialect, warnings))
    warnings.push(
      typeChangeWarning(change.table, change.column, change.previousType || '', change.currentType || ''),
    )
  }

  for (const change of diff.foreignKeys) {
    if (change.kind !== 'removed') continue
    if (!change.relationship.constraint_name) {
      warnings.push(unnamedForeignKeyWarning(change.table, change.relationship))
      continue
    }
    statements.push(dropForeignKeyStatement(change.table, change.relationship.constraint_name, dialect))
  }

  const modelTableNames = new Set(modelTables.map((table) => table.name))
  for (const change of diff.foreignKeys) {
    if (change.kind !== 'created') continue
    if (!modelTableNames.has(change.relationship.table)) continue
    statements.push(addForeignKeyStatement(change.table, change.relationship, dialect))
  }

  for (const change of diff.columns) {
    if (change.kind !== 'removed') continue
    const statement = `ALTER TABLE ${quote(change.table, dialect)} DROP COLUMN ${quote(change.column, dialect)}`
    statements.push(statement)
    destructive.push(statement)
    warnings.push(removedColumnWarning(change.table, change.column))
  }

  for (const change of diff.tables) {
    if (change.kind !== 'removed') continue
    const statement = `DROP TABLE ${quote(change.name, dialect)}`
    statements.push(statement)
    destructive.push(statement)
    warnings.push(removedTableWarning(change.name))
  }

  return { statements, destructive, warnings }
}
