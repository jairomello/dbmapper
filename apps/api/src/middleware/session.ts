import type { Context, MiddlewareHandler } from 'hono'
import type { UserRole } from '../persistence/ports'
import {
  buildSessionCookie,
  readSessionCookie,
  shouldRenewSession,
  signJwt,
  verifyJwt,
  type AuthConfig,
} from '../services/auth'
import { ApiError } from '../errors'
import type { AppEnv } from '../types'

const ROLE_RANK: Record<UserRole, number> = { VIEWER: 1, MEMBER: 2, ADMIN: 3 }

function isLoginRequest(c: Context<AppEnv>): boolean {
  return c.req.method === 'POST' && c.req.path === '/api/auth/login'
}

function unauthorized(message = 'Sessão inválida ou expirada.'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message)
}

export function requireSession(auth: AuthConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (isLoginRequest(c)) {
      await next()
      return
    }

    const token = readSessionCookie(c.req.header('cookie'))
    if (!token) throw unauthorized()

    const user = await verifyJwt(token, auth.secret)
    if (!user) throw unauthorized()

    c.set('user', user)

    if (shouldRenewSession(user.iat, Date.now(), auth.renewAfterSeconds)) {
      const renewed = await signJwt(user, auth.secret, auth.sessionTtlSeconds)
      c.header('Set-Cookie', buildSessionCookie(renewed, auth.sessionTtlSeconds))
    }

    await next()
  }
}

export function requireRole(role: UserRole): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw unauthorized()

    if (ROLE_RANK[user.role] < ROLE_RANK[role]) {
      throw new ApiError(403, 'FORBIDDEN', 'Seu usuário não tem permissão para esta operação.')
    }

    await next()
  }
}
