import { Hono } from 'hono'
import { errorHandler, notFoundHandler } from './errors'
import type { Persistence } from './persistence/ports'
import { registerImportRoutes } from './routes/imports'
import { registerProjectRoutes } from './routes/projects'

export function createApp(persistence: Persistence): Hono {
  const app = new Hono()

  app.onError(errorHandler)
  app.notFound(notFoundHandler)
  app.get('/health', (c) => c.json({ status: 'ok' }))

  registerProjectRoutes(app, persistence)
  registerImportRoutes(app, persistence)

  return app
}
