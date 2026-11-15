import { Hono } from 'hono'
import { errorHandler, notFoundHandler } from './errors'
import { requireSession } from './middleware/session'
import type { Persistence } from './persistence/ports'
import { registerAuthRoutes } from './routes/auth'
import { registerImportRoutes } from './routes/imports'
import { registerProjectRoutes } from './routes/projects'
import { registerUserRoutes } from './routes/users'
import { createAuthConfig, type AuthConfig } from './services/auth'
import type { AppEnv } from './types'

export interface CreateAppOptions {
  auth?: AuthConfig
}

export function createApp(persistence: Persistence, options: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const auth = options.auth ?? createAuthConfig()

  app.onError(errorHandler)
  app.notFound(notFoundHandler)
  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.use('/api/*', requireSession(auth))

  registerAuthRoutes(app, persistence, auth)
  registerProjectRoutes(app, persistence)
  registerImportRoutes(app, persistence)
  registerUserRoutes(app, persistence)

  return app
}
