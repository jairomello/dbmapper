import type { Hono } from 'hono'
import { z } from 'zod'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import type { Persistence } from '../persistence/ports'
import type { AppEnv } from '../types'

export const MAX_EVENTS_LIMIT = 500
export const DEFAULT_EVENTS_LIMIT = 100

const eventQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(200).optional(),
    projectId: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .strict()

export function registerEventRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const requireAdmin = requireRole('ADMIN')

  app.get('/api/events', requireAdmin, (c) => {
    const parsed = eventQuerySchema.safeParse({
      action: c.req.query('action'),
      projectId: c.req.query('projectId'),
      limit: c.req.query('limit'),
    })
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Os filtros de auditoria são inválidos.')
    }

    const limit = Math.min(parsed.data.limit ?? DEFAULT_EVENTS_LIMIT, MAX_EVENTS_LIMIT)
    const events = persistence.agent.events.listEvents({
      action: parsed.data.action,
      projectId: parsed.data.projectId,
      limit,
    })

    return c.json({ events })
  })
}
