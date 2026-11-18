import type { Hono } from 'hono'
import { z } from 'zod'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import type { Persistence } from '../persistence/ports'
import type { AppEnv } from '../types'
import { descriptionItemTypes, itemDescriptionSchema, parseJsonBody } from '../validation'

const itemTypeSchema = z.enum(descriptionItemTypes)

export function registerItemRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const requireMember = requireRole('MEMBER')

  app.patch(
    '/api/projects/:projectId/items/:itemType/:itemId/description',
    requireMember,
    async (c) => {
      const parsedItemType = itemTypeSchema.safeParse(c.req.param('itemType'))
      if (!parsedItemType.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Tipo de item inválido.')
      }

      const body = await parseJsonBody(c, itemDescriptionSchema)
      const actor = c.get('user')
      const source = c.get('credential') === 'api_key' ? 'mcp' : 'human'

      const updated = persistence.projects.setItemDescription({
        projectId: c.req.param('projectId'),
        itemType: parsedItemType.data,
        itemId: c.req.param('itemId'),
        description: body.description,
        source,
        actorUserId: actor.sub,
      })

      if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Item não encontrado neste projeto.')
      return c.json({ item: updated })
    },
  )
}
