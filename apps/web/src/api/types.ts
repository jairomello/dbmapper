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
  table_ids: Record<string, string>
  database: DatabaseModel
  sources: ExportSources
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

export type DescriptionSource = 'human' | 'agent' | 'mcp'

export interface ExportSources {
  project: DescriptionSource
  tables: Record<string, DescriptionSource>
  columns: Record<string, Record<string, DescriptionSource>>
}

export interface ProjectDocument {
  database: DatabaseModel
  sources?: ExportSources
}

export type DdlDialect = 'postgres' | 'mysql'

export type DdlMode = 'create' | 'migration'

export interface DdlRenameMapping {
  tables: Record<string, string>
  columns: Record<string, string>
}

export interface DdlGeneration {
  dialect: DdlDialect
  mode: DdlMode
  script: string
  statements: string[]
  destructive: string[]
  warnings: string[]
}

export interface DdlBaseline {
  projectId: string
  capturedAt: string
  capturedBy: string | null
}

export interface DdlBaselineSnapshot extends DdlBaseline {
  database: DatabaseModel
}

export interface DdlBaselineResult {
  baseline: DdlBaseline
}

export interface DdlBaselineReadResult {
  baseline: DdlBaselineSnapshot | null
}

export interface AuditEvent {
  id: string
  projectId: string | null
  actorUserId: string | null
  actorEmail: string | null
  action: string
  subjectType: string
  subjectId: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface EventListFilters {
  action?: string
  projectId?: string
  limit?: number
}

export interface DiagramPosition {
  x: number
  y: number
}

export interface DiagramZone {
  name: string
  tabOrder: number
  members: string[]
}

export interface DiagramZoneLayout {
  zoneName: string
  positions: Record<string, DiagramPosition>
  viewport: DiagramPosition
  zoom: number
  updatedAt: string | null
  updatedBy: string | null
}

export interface DiagramLayout {
  projectId: string
  zones: DiagramZone[]
  layouts: DiagramZoneLayout[]
}

export type DiagramDocument = DiagramLayout

export interface DiagramZoneInput {
  name: string
  tabOrder?: number
  members?: string[]
}

export interface DiagramZoneLayoutInput {
  zoneName: string
  positions?: Record<string, DiagramPosition>
  viewport?: DiagramPosition
  zoom?: number
}

export interface DiagramLayoutInput {
  zones?: DiagramZoneInput[]
  layouts: DiagramZoneLayoutInput[]
}
