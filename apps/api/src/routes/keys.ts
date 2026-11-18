import type { Hono } from 'hono'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import type { Persistence } from '../persistence/ports'
import { displayPrefix, generateApiKey, hashApiKey, publicApiKey } from '../services/api-keys'
import type { AppEnv } from '../types'
import { createApiKeySchema, parseJsonBody } from '../validation'

export function registerApiKeyRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const requireMember = requireRole('MEMBER')

  app.post('/api/keys', requireMember, async (c) => {
    const input = await parseJsonBody(c, createApiKeySchema)
    const owner = c.get('user')
    const plaintext = generateApiKey()

    const created = persistence.apiKeys.create(
      {
        ownerId: owner.sub,
        name: input.name,
        keyHash: hashApiKey(plaintext),
        keyPrefix: displayPrefix(plaintext),
        projectScope: input.projectScope ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      {
        audit: {
          projectId: input.projectScope ?? null,
          action: 'api_key.created',
          subjectType: 'api_key',
          subjectId: '',
          payload: {
            name: input.name,
            keyPrefix: displayPrefix(plaintext),
            projectScope: input.projectScope ?? null,
          },
        },
      },
    )

    return c.json({ key: plaintext, apiKey: publicApiKey(created) }, 201)
  })

  app.get('/api/keys', requireMember, (c) => {
    const owner = c.get('user')
    const now = new Date().toISOString()
    return c.json({ keys: persistence.apiKeys.listByOwner(owner.sub).map((key) => publicApiKey(key, now)) })
  })

  app.delete('/api/keys/:id', requireMember, (c) => {
    const owner = c.get('user')
    const revoked = persistence.apiKeys.revoke(owner.sub, c.req.param('id'), {
      audit: {
        action: 'api_key.revoked',
        subjectType: 'api_key',
        subjectId: c.req.param('id'),
      },
    })
    if (!revoked) throw new ApiError(404, 'NOT_FOUND', 'Chave de API não encontrada.')
    return c.json({ apiKey: publicApiKey(revoked) })
  })
}
