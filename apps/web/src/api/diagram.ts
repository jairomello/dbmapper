import { jsonRequest, request } from './client'
import type { DiagramLayout, DiagramLayoutInput } from './types'

function diagramPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/diagram`
}

export const diagramApi = {
  get(projectId: string): Promise<DiagramLayout> {
    return request<DiagramLayout>(diagramPath(projectId))
  },
  save(projectId: string, layout: DiagramLayoutInput): Promise<DiagramLayout> {
    return jsonRequest<DiagramLayout>(diagramPath(projectId), 'PUT', layout)
  },
}
