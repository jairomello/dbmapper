import type { RelationshipModel } from '@dbmapper/domain'

export type DdlDialect = 'postgres' | 'mysql'

export interface DdlRenameMapping {
  tables?: Record<string, string>
  columns?: Record<string, string>
}

export interface DdlOptions {
  dialect: DdlDialect
  renames?: DdlRenameMapping
}

export interface DdlDiffOptions {
  renames?: DdlRenameMapping
}

export interface DdlGenerationResult {
  statements: string[]
  destructive: string[]
  warnings: string[]
}

export interface DdlTableChange {
  name: string
  kind: 'created' | 'removed'
}

export interface DdlColumnChange {
  table: string
  column: string
  kind: 'created' | 'removed' | 'typeChanged'
  previousType: string | null
  currentType: string | null
}

export interface DdlForeignKeyChange {
  table: string
  kind: 'created' | 'removed'
  relationship: RelationshipModel
}

export interface DdlTableRename {
  kind: 'table'
  from: string
  to: string
}

export interface DdlColumnRename {
  kind: 'column'
  table: string
  from: string
  to: string
}

export type DdlRenameChange = DdlTableRename | DdlColumnRename

export interface DdlStructuralDiff {
  tables: DdlTableChange[]
  columns: DdlColumnChange[]
  foreignKeys: DdlForeignKeyChange[]
  renames: DdlRenameChange[]
  warnings: string[]
}
