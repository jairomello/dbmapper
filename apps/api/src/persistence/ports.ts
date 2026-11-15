import type {
  DatabaseModel,
  DescriptionSource,
  ReviewStatus,
} from '@dbmapper/domain'

export interface ProjectRecord {
  id: string
  name: string
  description: string
  businessTerms: string[]
  reviewed: boolean
  descriptionSource: DescriptionSource
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TableRecord {
  id: string
  projectId: string
  name: string
  description: string
  businessTerms: string[]
  status: ReviewStatus
  reviewed: boolean
  descriptionSource: DescriptionSource
  reviewedBy: string | null
  reviewedAt: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface ColumnRecord {
  id: string
  tableId: string
  name: string
  type: string
  primaryKey: boolean
  foreignKey: boolean
  description: string
  businessTerms: string[]
  status: ReviewStatus
  reviewed: boolean
  descriptionSource: DescriptionSource
  reviewedBy: string | null
  reviewedAt: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface RelationshipRecord {
  id: string
  tableId: string
  targetTable: string
  localColumns: string[]
  referencedColumns: string[]
  constraintName: string
  description: string
  reviewed: boolean
  descriptionSource: DescriptionSource
  reviewedBy: string | null
  reviewedAt: string | null
  position: number
  createdAt: string
  updatedAt: string
}

export interface ProjectAggregate {
  project: ProjectRecord
  tables: TableRecord[]
  columns: ColumnRecord[]
  relationships: RelationshipRecord[]
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description?: string
}

export interface ImportRunRecord {
  id: string
  projectId: string
  sqlHash: string
  planSnapshot: string
  createdAt: string
}

export interface CreateImportRunInput {
  sqlHash: string
  planSnapshot: string
}

export interface ApplyModelResult {
  model: ProjectAggregate
  run: ImportRunRecord
}

export interface ProjectRepository {
  create(input: CreateProjectInput): ProjectRecord
  list(): ProjectSummary[]
  get(id: string): ProjectAggregate | null
  replaceModel(id: string, database: DatabaseModel): ProjectAggregate | null
  applyModel(id: string, database: DatabaseModel, run: CreateImportRunInput): ApplyModelResult | null
  listImportRuns(projectId: string): ImportRunRecord[]
}

export interface Persistence {
  projects: ProjectRepository
  close(): void
}
