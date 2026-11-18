import type { Hono } from 'hono'
import { z } from 'zod'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import { USER_ROLES, type Persistence } from '../persistence/ports'
import { hashPassword, publicUser } from '../services/auth'
import type { AppEnv } from '../types'
import { parseJsonBody } from '../validation'

export const USER_PASSWORD_MIN_LENGTH = 8

const emailSchema = z.string().trim().toLowerCase().email().max(320)

const createUserSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(USER_PASSWORD_MIN_LENGTH).max(1024),
    role: z.enum(USER_ROLES),
  })
  .strict()

const updateRoleSchema = z
  .object({
    role: z.enum(USER_ROLES),
  })
  .strict()

export function registerUserRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const users = persistence.users
  const requireAdmin = requireRole('ADMIN')

  app.post('/api/users', requireAdmin, async (c) => {
    const input = await parseJsonBody(c, createUserSchema)
    if (users.findByEmail(input.email)) {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Já existe um usuário com este email.')
    }

    const created = users.create(
      {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
      },
      {
        audit: {
          actorUserId: c.get('user').sub,
          action: 'user.created',
          subjectType: 'user',
          subjectId: '',
          payload: { email: input.email, role: input.role },
        },
      },
    )
    return c.json(publicUser(created), 201)
  })

  app.get('/api/users', requireAdmin, (c) => c.json(users.list().map(publicUser)))

  app.patch('/api/users/:id', requireAdmin, async (c) => {
    const input = await parseJsonBody(c, updateRoleSchema)
    const target = users.findById(c.req.param('id'))
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado.')

    if (target.role === 'ADMIN' && input.role !== 'ADMIN' && users.countByRole('ADMIN') <= 1) {
      throw new ApiError(400, 'LAST_ADMIN', 'Não é possível remover o último ADMIN do sistema.')
    }

    const updated = users.updateRole(target.id, input.role, {
      audit: {
        actorUserId: c.get('user').sub,
        action: 'user.role_changed',
        subjectType: 'user',
        subjectId: target.id,
        payload: { from: target.role, to: input.role },
      },
    })
    if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Usuário não encontrado.')
    return c.json(publicUser(updated))
  })
}
