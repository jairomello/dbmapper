import type { DatabaseModel } from '@dbmapper/domain'

export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

export interface LoginInput {
  email: string
  password: string
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface ProjectView {
  id: string
  name: string
  description: string
  businessTerms: string[]
  reviewed: boolean
  createdAt: string
  updatedAt: string
  database: DatabaseModel
}

export interface CreateProjectInput {
  name: string
  description?: string
}

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

export interface ImportPreviewResult {
  plan: ImportPlan
}

export interface ImportRun {
  id: string
  projectId: string
  sqlHash: string
  planSnapshot: string
  createdAt: string
}

export interface ApplyImportResult {
  project: ProjectView
  plan: ImportPlan
  run: ImportRun
}

export interface ProjectDocument {
  database: DatabaseModel
}
