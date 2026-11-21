import type { DatabaseModel } from '@dbmapper/domain'
import { jsonRequest, request } from './client'
import type {
  ApplyImportResult,
  CreateProjectInput,
  DdlBaselineReadResult,
  DdlBaselineResult,
  DdlDialect,
  DdlGeneration,
  DdlMode,
  DdlRenameMapping,
  ImportPlan,
  ImportPreviewResult,
  ProjectDocument,
  ProjectSummary,
  ProjectView,
  RenameMapping,
} from './types'

const EMPTY_RENAMES: RenameMapping = { tables: [], columns: [] }

export interface GenerateDdlOptions {
  dialect: DdlDialect
  mode: DdlMode
  renames?: DdlRenameMapping
}

function projectPath(id: string): string {
  return `/api/projects/${encodeURIComponent(id)}`
}

function hasRenames(renames: DdlRenameMapping): boolean {
  return Object.keys(renames.tables).length > 0 || Object.keys(renames.columns).length > 0
}

function ddlPath(id: string, options: GenerateDdlOptions): string {
  const params = new URLSearchParams({ dialect: options.dialect, mode: options.mode })
  if (options.renames && hasRenames(options.renames)) {
    params.set('renames', JSON.stringify(options.renames))
  }
  return `${projectPath(id)}/ddl?${params.toString()}`
}

export const projectsApi = {
  list(): Promise<ProjectSummary[]> {
    return request<ProjectSummary[]>('/api/projects')
  },
  get(id: string): Promise<ProjectView> {
    return request<ProjectView>(projectPath(id))
  },
  create(input: CreateProjectInput): Promise<ProjectView> {
    return jsonRequest<ProjectView>('/api/projects', 'POST', input)
  },
  save(id: string, database: DatabaseModel): Promise<ProjectView> {
    return jsonRequest<ProjectView>(projectPath(id), 'PUT', { database })
  },
  previewImport(id: string, sql: string, renames: RenameMapping = EMPTY_RENAMES): Promise<ImportPreviewResult> {
    return jsonRequest<ImportPreviewResult>(`${projectPath(id)}/imports/preview`, 'POST', { sql, renames })
  },
  applyImport(id: string, sql: string, renames: RenameMapping, plan: ImportPlan): Promise<ApplyImportResult> {
    return jsonRequest<ApplyImportResult>(`${projectPath(id)}/imports/apply`, 'POST', { sql, renames, plan })
  },
  generateDdl(id: string, options: GenerateDdlOptions): Promise<DdlGeneration> {
    return request<DdlGeneration>(ddlPath(id, options))
  },
  captureDdlBaseline(id: string): Promise<DdlBaselineResult> {
    return request<DdlBaselineResult>(`${projectPath(id)}/ddl/baseline`, { method: 'PUT' })
  },
  readDdlBaseline(id: string): Promise<DdlBaselineReadResult> {
    return request<DdlBaselineReadResult>(`${projectPath(id)}/ddl/baseline`)
  },
  exportProject(id: string): Promise<ProjectDocument> {
    return request<ProjectDocument>(`${projectPath(id)}/export`)
  },
  importProject(document: ProjectDocument): Promise<ProjectView> {
    return jsonRequest<ProjectView>('/api/projects/import', 'POST', document)
  },
}
