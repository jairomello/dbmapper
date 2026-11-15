import type { Hono } from 'hono'
import { ApiError } from '../errors'
import type { Persistence } from '../persistence/ports'
import { databaseFromAggregate, normalizeDatabaseModel, projectView } from '../services/model-mapper'
import { createProjectSchema, parseJsonBody, projectDocumentSchema } from '../validation'

export function registerProjectRoutes(app: Hono, persistence: Persistence): void {
  const repository = persistence.projects

  app.post('/api/projects', async (c) => {
    const input = await parseJsonBody(c, createProjectSchema)
    const created = repository.create(input)
    const aggregate = repository.get(created.id)
    if (!aggregate) throw new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível carregar o projeto criado.')
    return c.json(projectView(aggregate), 201)
  })

  app.get('/api/projects', (c) => c.json(repository.list()))

  app.post('/api/projects/import', async (c) => {
    const document = await parseJsonBody(c, projectDocumentSchema)
    const database = normalizeDatabaseModel(document.database)
    const created = repository.create({ name: database.name, description: database.description })
    const saved = repository.replaceModel(created.id, database)
    if (!saved) throw new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível importar o projeto.')
    return c.json(projectView(saved), 201)
  })

  app.get('/api/projects/:id', (c) => {
    const aggregate = repository.get(c.req.param('id'))
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(projectView(aggregate))
  })

  app.put('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    const document = await parseJsonBody(c, projectDocumentSchema)
    const database = normalizeDatabaseModel(document.database)
    const saved = repository.replaceModel(id, database)
    if (!saved) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json(projectView(saved))
  })

  app.get('/api/projects/:id/export', (c) => {
    const aggregate = repository.get(c.req.param('id'))
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')
    return c.json({ database: databaseFromAggregate(aggregate) })
  })
}
