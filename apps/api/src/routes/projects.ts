import type { Hono } from 'hono'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import {
  DEFAULT_DIAGRAM_ZONE,
  DiagramDocumentValidationError,
  type DiagramDocumentRecord,
  type Persistence,
  type PutDiagramDocumentInput,
} from '../persistence/ports'
import { normalizeDatabaseModel, projectExport, projectView } from '../services/model-mapper'
import type { AppEnv } from '../types'
import {
  createDiagramRequestSchema,
  createProjectSchema,
  parseJsonBody,
  projectDocumentSchema,
  renameProjectSchema,
} from '../validation'

function diagramDocumentView(document: DiagramDocumentRecord) {
  return {
    projectId: document.projectId,
    zones: document.zones.map((zone) => ({
      name: zone.name,
      tabOrder: zone.tabOrder,
      members: zone.members,
    })),
    layouts: document.layouts.map((layout) => ({
      zoneName: layout.zoneName,
      positions: layout.positions,
      viewport: { x: layout.viewportX, y: layout.viewportY },
      zoom: layout.zoom,
      updatedAt: layout.updatedAt,
      updatedBy: layout.updatedBy,
    })),
  }
}

export function registerProjectRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const repository = persistence.projects
  const requireMember = requireRole('MEMBER')

  app.post('/api/projects', requireMember, async (c) => {
    const input = await parseJsonBody(c, createProjectSchema)
    const created = repository.create(input, {
      audit: {
        actorUserId: c.get('user').sub,
        action: 'project.created',
        subjectType: 'project',
        subjectId: '',
        payload: { name: input.name },
      },
    })
    const aggregate = repository.get(created.id)
    if (!aggregate) throw new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível carregar o projeto criado.')
    return c.json(projectView(aggregate), 201)
  })

  app.get('/api/projects', (c) => c.json(repository.list()))

  app.post('/api/projects/import', requireMember, async (c) => {
    const document = await parseJsonBody(c, projectDocumentSchema)
    const database = normalizeDatabaseModel(document.database)
    const created = repository.create({ name: database.name, description: database.description })
    const saved = repository.replaceModel(created.id, database, {
      actorUserId: c.get('user').sub,
      audit: {
        actorUserId: c.get('user').sub,
        action: 'project.imported',
        subjectType: 'project',
        subjectId: created.id,
        payload: { name: database.name },
      },
    })
    if (!saved) throw new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível importar o projeto.')
    return c.json(projectView(saved), 201)
  })

  app.get('/api/projects/:id', (c) => {
    const aggregate = repository.get(c.req.param('id'))
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(projectView(aggregate))
  })

  app.patch('/api/projects/:id', requireMember, async (c) => {
    const id = c.req.param('id')
    const input = await parseJsonBody(c, renameProjectSchema)
    const actorUserId = c.get('user').sub
    const updated = repository.updateName(id, input.name, {
      actorUserId,
      audit: {
        actorUserId,
        action: 'project.renamed',
        subjectType: 'project',
        subjectId: id,
        payload: { name: input.name },
      },
    })
    if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(updated)
  })

  app.put('/api/projects/:id', requireMember, async (c) => {
    const id = c.req.param('id')
    const document = await parseJsonBody(c, projectDocumentSchema)
    const database = normalizeDatabaseModel(document.database)
    const saved = repository.replaceModel(id, database, {
      actorUserId: c.get('user').sub,
      audit: {
        actorUserId: c.get('user').sub,
        action: 'project.saved',
        subjectType: 'project',
        subjectId: id,
        payload: {
          tables: database.tables.length,
          columns: database.tables.reduce((sum, table) => sum + table.columns.length, 0),
        },
      },
    })
    if (!saved) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(projectView(saved))
  })

  app.get('/api/projects/:id/export', (c) => {
    const aggregate = repository.get(c.req.param('id'))
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(projectExport(aggregate))
  })

  app.get('/api/projects/:id/diagram', (c) => {
    const document = repository.getDiagramDocument(c.req.param('id'))
    if (!document) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(diagramDocumentView(document))
  })

  app.put('/api/projects/:id/diagram', requireMember, async (c) => {
    const id = c.req.param('id')
    const aggregate = repository.get(id)
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const payload = await parseJsonBody(
      c,
      createDiagramRequestSchema(aggregate.tables.map((table) => table.name)),
    )
    const actorUserId = c.get('user').sub
    const isDocument = 'layouts' in payload
    const input: PutDiagramDocumentInput = isDocument
      ? {
          projectId: id,
          zones: payload.zones?.map((zone) => ({
            name: zone.name,
            tabOrder: zone.tabOrder,
            members: zone.members,
          })),
          layouts: payload.layouts.map((layout) => ({
            zoneName: layout.zoneName,
            positions: layout.positions,
            viewportX: layout.viewport.x,
            viewportY: layout.viewport.y,
            zoom: layout.zoom,
          })),
        }
      : {
          projectId: id,
          layouts: [
            {
              zoneName: DEFAULT_DIAGRAM_ZONE,
              positions: payload.positions,
              viewportX: payload.viewport.x,
              viewportY: payload.viewport.y,
              zoom: payload.zoom,
            },
          ],
        }

    let saved: DiagramDocumentRecord | null
    try {
      saved = repository.putDiagramDocument({
        ...input,
        actorUserId,
        audit: {
          actorUserId,
          action: 'diagram.layout_saved',
          subjectType: 'project',
          subjectId: id,
          payload: {
            zones: input.zones ? input.zones.map((zone) => zone.name) : [DEFAULT_DIAGRAM_ZONE],
            tables: input.layouts.reduce((total, layout) => total + Object.keys(layout.positions).length, 0),
          },
        },
      })
    } catch (error) {
      if (error instanceof DiagramDocumentValidationError) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'O payload da requisição é inválido.', {
          details: { issues: error.issues },
        })
      }
      throw error
    }

    if (!saved) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(diagramDocumentView(saved))
  })
}
