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
