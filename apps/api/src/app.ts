import { Hono } from 'hono'
import type { ModelProvider } from './agent/provider'
import { createAgentWorker } from './agent/worker'
import { errorHandler, notFoundHandler } from './errors'
import { requireSession } from './middleware/session'
import type { Persistence } from './persistence/ports'
import { registerAgentRoutes } from './routes/agent'
import { registerAuthRoutes } from './routes/auth'
import { registerImportRoutes } from './routes/imports'
import { registerProjectRoutes } from './routes/projects'
import { registerUserRoutes } from './routes/users'
import { createAuthConfig, type AuthConfig } from './services/auth'
import type { AppEnv } from './types'

export interface AgentAppOptions {
  provider: ModelProvider | null
  startWorker?: boolean
  workerIntervalMs?: number
  workerLeaseMs?: number
}

export interface CreateAppOptions {
  auth?: AuthConfig
  agent?: AgentAppOptions
}

export function createApp(persistence: Persistence, options: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const auth = options.auth ?? createAuthConfig()
  const agent = options.agent ?? { provider: null }

  app.onError(errorHandler)
  app.notFound(notFoundHandler)
  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.use('/api/*', requireSession(auth))

  registerAuthRoutes(app, persistence, auth)
  registerProjectRoutes(app, persistence)
  registerImportRoutes(app, persistence)
  registerUserRoutes(app, persistence)
  registerAgentRoutes(app, persistence, { provider: agent.provider })

  if (agent.provider && agent.startWorker !== false) {
    createAgentWorker({
      persistence,
      provider: agent.provider,
      intervalMs: agent.workerIntervalMs,
      leaseMs: agent.workerLeaseMs,
    }).start()
  }

  return app
}
