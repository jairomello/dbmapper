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

export const AGENT_JOB_SCOPES = ['project', 'table'] as const
export type AgentJobScope = (typeof AGENT_JOB_SCOPES)[number]

export const AGENT_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const
export type AgentJobStatus = (typeof AGENT_JOB_STATUSES)[number]

export const AI_SUGGESTION_ITEM_TYPES = ['table', 'column'] as const
export type AiSuggestionItemType = (typeof AI_SUGGESTION_ITEM_TYPES)[number]

export const AI_SUGGESTION_STATUSES = ['pending', 'applied', 'rejected'] as const
export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number]

export interface AgentJobRecord {
  id: string
  projectId: string
  scope: AgentJobScope
  tableId: string | null
  status: AgentJobStatus
  attempts: number
  leaseExpiresAt: string | null
  requestedBy: string
  error: string | null
  stats: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AiSuggestionRecord {
  id: string
  projectId: string
  jobId: string
  itemType: AiSuggestionItemType
  itemId: string
  tableId: string | null
  suggestedDescription: string
  context: Record<string, unknown>
  status: AiSuggestionStatus
  requestedBy: string
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EventRecord {
  id: string
  projectId: string
  actorUserId: string | null
  action: string
  subjectType: string
  subjectId: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface InsertEventInput {
  projectId: string
  actorUserId?: string | null
  action: string
  subjectType: string
  subjectId: string
  payload?: Record<string, unknown>
  createdAt?: string
}

export interface CreateAgentJobInput {
  id?: string
  projectId: string
  scope: AgentJobScope
  tableId?: string | null
  requestedBy: string
  stats?: Record<string, unknown>
}

export interface CreateAgentJobOptions {
  now?: string
  audit?: InsertEventInput
}

export interface CreateAiSuggestionInput {
  projectId: string
  jobId: string
  itemType: AiSuggestionItemType
  itemId: string
  tableId?: string | null
  suggestedDescription: string
  context?: Record<string, unknown>
  requestedBy: string
}

export interface DecisionAudit {
  projectId: string
  action: string
  subjectType: string
  subjectId: string
  payload?: Record<string, unknown>
}

export interface SuggestionDecisionResult {
  decided: AiSuggestionRecord[]
  skipped: string[]
}

export interface AgentJobRepository {
  create(input: CreateAgentJobInput, options?: CreateAgentJobOptions): AgentJobRecord
  get(id: string): AgentJobRecord | null
  listByProject(projectId: string): AgentJobRecord[]
  claimNext(now: string, leaseExpiresAt: string): AgentJobRecord | null
  heartbeat(id: string, leaseExpiresAt: string, now: string): void
  succeed(id: string, stats: Record<string, unknown>, now: string): AgentJobRecord | null
  fail(id: string, error: string, stats: Record<string, unknown>, now: string): AgentJobRecord | null
}

export interface SuggestionRepository {
  replacePending(inputs: CreateAiSuggestionInput[], now: string): AiSuggestionRecord[]
  get(id: string): AiSuggestionRecord | null
  list(projectId: string, status?: AiSuggestionStatus): AiSuggestionRecord[]
  editPending(
    projectId: string,
    id: string,
    text: string,
    actorUserId: string,
    now: string,
    audit: DecisionAudit,
  ): AiSuggestionRecord | null
  apply(
    projectId: string,
    ids: string[],
    actorUserId: string,
    now: string,
    audit: DecisionAudit,
  ): SuggestionDecisionResult
  reject(
    projectId: string,
    ids: string[],
    actorUserId: string,
    now: string,
    audit: DecisionAudit,
  ): SuggestionDecisionResult
}

export interface EventRepository {
  insert(input: InsertEventInput): EventRecord
  list(projectId: string): EventRecord[]
}

export interface AgentRepositories {
  jobs: AgentJobRepository
  suggestions: SuggestionRepository
  events: EventRepository
}

export interface Persistence {
  projects: ProjectRepository
  users: UserRepository
  loginAttempts: LoginAttemptRepository
  agent: AgentRepositories
  close(): void
}
