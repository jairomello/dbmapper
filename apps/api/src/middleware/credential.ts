import type { Context, MiddlewareHandler } from 'hono'
import type { JwtPayload } from '@dbmapper/contracts'
import { ApiError } from '../errors'
import type { Persistence } from '../persistence/ports'
import {
  buildSessionCookie,
  readSessionCookie,
  shouldRenewSession,
  signJwt,
  verifyJwt,
  type AuthConfig,
} from '../services/auth'
import { hashApiKey } from '../services/api-keys'
import type { AppEnv } from '../types'

export interface KeyEnabledRoute {
  method: string
  pattern: RegExp
}

/**
 * Superfície autenticável por API key. Qualquer rota fora desta lista continua
 * exclusiva de sessão; o teste unitário fixa a lista para evitar ampliação
 * acidental da superfície.
 */
export const KEY_ENABLED: readonly KeyEnabledRoute[] = [
  { method: 'GET', pattern: /^\/api\/projects\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/projects\/[^/]+\/export$/ },
  { method: '*', pattern: /^\/api\/projects\/[^/]+\/agent(?:\/.*)?$/ },
  { method: 'PATCH', pattern: /^\/api\/projects\/[^/]+\/items\/[^/]+\/[^/]+\/description$/ },
]

const PROJECT_PATH = /^\/api\/projects\/([^/]+)/

export function isKeyEnabled(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase()
  return KEY_ENABLED.some(
    (route) =>
      (route.method === '*' || route.method === normalizedMethod) && route.pattern.test(path),
  )
}

function isLoginRequest(c: Context<AppEnv>): boolean {
  return c.req.method === 'POST' && c.req.path === '/api/auth/login'
}

function unauthorized(message = 'Sessão inválida ou expirada.'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message)
}

function invalidApiKey(): ApiError {
  return new ApiError(401, 'INVALID_API_KEY', 'Chave de API inválida, revogada ou expirada.')
}

function readBearer(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

async function authenticateSession(
  c: Context<AppEnv>,
  auth: AuthConfig,
): Promise<JwtPayload | null> {
  const token = readSessionCookie(c.req.header('cookie'))
  if (!token) return null

  const user = await verifyJwt(token, auth.secret)
  if (!user) return null

  if (shouldRenewSession(user.iat, Date.now(), auth.renewAfterSeconds)) {
    const renewed = await signJwt(user, auth.secret, auth.sessionTtlSeconds)
    c.header('Set-Cookie', buildSessionCookie(renewed, auth.sessionTtlSeconds))
  }

  return user
}

export function requireCredential(auth: AuthConfig, persistence: Persistence): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (isLoginRequest(c)) {
      await next()
      return
    }

    const bearer = readBearer(c.req.header('authorization'))

    if (bearer && isKeyEnabled(c.req.method, c.req.path)) {
      const now = new Date().toISOString()
      const key = persistence.apiKeys.findUsableByHash(hashApiKey(bearer), now)
      if (!key) throw invalidApiKey()

      const owner = persistence.users.findById(key.ownerId)
      if (!owner) throw invalidApiKey()

      if (key.projectScope) {
        const projectId = PROJECT_PATH.exec(c.req.path)?.[1]
        if (!projectId || projectId !== key.projectScope) {
          throw new ApiError(403, 'FORBIDDEN', 'Esta chave de API não tem acesso a este projeto.')
        }
      }

      c.set('user', {
        sub: owner.id,
        email: owner.email,
        role: owner.role,
      })
      c.set('credential', 'api_key')
      c.set('apiKey', key)

      persistence.apiKeys.touchLastUsed(key.id, now)
      await next()
      return
    }

    const user = await authenticateSession(c, auth)
    if (!user) throw unauthorized()

    c.set('user', user)
    c.set('credential', 'session')
    c.set('apiKey', null)

    await next()
  }
}
