import type { DatabaseModel } from '@dbmapper/domain'
import { jsonRequest, request } from './client'
import type {
  ApplyImportResult,
  CreateProjectInput,
  ImportPlan,
  ImportPreviewResult,
  ProjectDocument,
  ProjectSummary,
  ProjectView,
  RenameMapping,
} from './types'

const EMPTY_RENAMES: RenameMapping = { tables: [], columns: [] }

function projectPath(id: string): string {
  return `/api/projects/${encodeURIComponent(id)}`
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
  applyImport(
    id: string,
    sql: string,
    renames: RenameMapping,
    plan: ImportPlan,
  ): Promise<ApplyImportResult> {
    return jsonRequest<ApplyImportResult>(`${projectPath(id)}/imports/apply`, 'POST', { sql, renames, plan })
  },
  exportProject(id: string): Promise<ProjectDocument> {
    return request<ProjectDocument>(`${projectPath(id)}/export`)
  },
  importProject(document: ProjectDocument): Promise<ProjectView> {
    return jsonRequest<ProjectView>('/api/projects/import', 'POST', document)
  },
}
