export type ReviewStatus = 'NEW' | 'UNCHANGED' | 'REMOVED' | 'RENAMED' | 'CHANGED'

export type DescriptionSource = 'human' | 'agent' | 'mcp'

export interface Project {
  id: string
  name: string
  description?: string
  businessTerms: string[]
  createdAt: string
}

export interface TableDefinition {
  id: string
  projectId: string
  name: string
  description?: string
  businessTerms: string[]
  status: ReviewStatus
}

export interface ColumnDefinition {
  id: string
  tableId: string
  name: string
  type: string
  primaryKey: boolean
  foreignKey: boolean
  description?: string
  businessTerms: string[]
  status: ReviewStatus
}

export interface Relationship {
  id: string
  tableId: string
  localColumns: string[]
  referencedColumns: string[]
  constraintName: string
  description?: string
  reviewed: boolean
}

/**
 * The v1 JSON contract model. These shapes are shared by the SQL parser, the
 * update-wizard diff and the API export/import mappers. Field names stay in
 * snake_case because they are the serialized contract consumed by DBViewer and
 * other v1 readers.
 */
export interface RelationshipModel {
  table: string
  local_columns: string[]
  referenced_columns: string[]
  constraint_name: string
  description: string
  reviewed: boolean
}

export interface ColumnModel {
  name: string
  type: string
  primary_key: boolean
  foreign_key: boolean
  description: string
  business_terms: string[]
  reviewed: boolean
  status: ReviewStatus
}

export interface TableRelationshipsModel {
  parents: RelationshipModel[]
  children: RelationshipModel[]
}

export interface TableModel {
  name: string
  description: string
  business_terms: string[]
  reviewed: boolean
  status: ReviewStatus
  relationships: TableRelationshipsModel
  columns: ColumnModel[]
}

export interface DatabaseModel {
  name: string
  description: string
  business_terms: string[]
  reviewed: boolean
  tables: TableModel[]
}

export interface ProjectDocument {
  database: DatabaseModel
}

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'NEW',
  'UNCHANGED',
  'REMOVED',
  'RENAMED',
  'CHANGED',
] as const
