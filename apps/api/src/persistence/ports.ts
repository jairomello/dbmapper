import type { DatabaseModel, DescriptionSource, ReviewStatus } from '@dbmapper/domain'

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

export interface MutationContext {
  actorUserId?: string | null
}

export const USER_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const
export type UserRole = (typeof USER_ROLES)[number]

export interface UserRecord {
  id: string
  email: string
  passwordHash: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  role: UserRole
}

export interface UserRepository {
  create(input: CreateUserInput): UserRecord
  findByEmail(email: string): UserRecord | null
  findById(id: string): UserRecord | null
  list(): UserRecord[]
  updateRole(id: string, role: UserRole): UserRecord | null
  countByRole(role: UserRole): number
}

export interface LoginAttemptRepository {
  record(identity: string, ip: string, attemptedAt: string): void
  listSince(identity: string, since: string): string[]
  pruneBefore(before: string): void
  clear(identity: string): void
}

export interface ProjectRepository {
  create(input: CreateProjectInput): ProjectRecord
  list(): ProjectSummary[]
  get(id: string): ProjectAggregate | null
  replaceModel(id: string, database: DatabaseModel, context?: MutationContext): ProjectAggregate | null
  applyModel(
    id: string,
    database: DatabaseModel,
    run: CreateImportRunInput,
    context?: MutationContext,
  ): ApplyModelResult | null
  listImportRuns(projectId: string): ImportRunRecord[]
}

export interface Persistence {
  projects: ProjectRepository
  users: UserRepository
  loginAttempts: LoginAttemptRepository
  close(): void
}
