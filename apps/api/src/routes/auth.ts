import type { Hono } from 'hono'
import { z } from 'zod'
import { ApiError, errorEnvelope } from '../errors'
import type { Persistence } from '../persistence/ports'
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  publicUser,
  signJwt,
  toJwtPayload,
  verifyPassword,
  type AuthConfig,
} from '../services/auth'
import { createLoginThrottle } from '../services/loginThrottle'
import type { AppEnv } from '../types'
import { parseJsonBody } from '../validation'

const DUMMY_PASSWORD_HASH = '$2b$12$w9EP7qBKMD2PpvvYdH4GT.M5bLN0fjrSAo1zEFOb4Xslic06AjRBG'

const loginSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(1024),
  })
  .strict()

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? ''
  return c.req.header('x-real-ip') ?? ''
}

export function registerAuthRoutes(app: Hono<AppEnv>, persistence: Persistence, auth: AuthConfig): void {
  const users = persistence.users
  const throttle = createLoginThrottle(persistence.loginAttempts)

  app.post('/api/auth/login', async (c) => {
    const input = await parseJsonBody(c, loginSchema)
    const identity = input.email.trim().toLowerCase()

    const status = throttle.status(identity)
    if (status.blocked) {
      c.header('Retry-After', String(status.retryAfterSeconds))
      return c.json(
        errorEnvelope(
          new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas de login. Tente novamente mais tarde.', {
            retryable: true,
            details: { retryAfterSeconds: status.retryAfterSeconds },
          }),
        ),
        429,
      )
    }

    const user = users.findByEmail(identity)
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)

    if (!user || !valid) {
      throttle.recordFailure(identity, clientIp(c))
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas.')
    }

    throttle.recordSuccess(identity)
    const token = await signJwt(toJwtPayload(user), auth.secret, auth.sessionTtlSeconds)
    c.header('Set-Cookie', buildSessionCookie(token, auth.sessionTtlSeconds))
    return c.json(publicUser(user))
  })

  app.get('/api/auth/me', (c) => {
    const user = c.get('user')
    return c.json({ id: user.sub, email: user.email, role: user.role })
  })

  app.post('/api/auth/logout', (c) => {
    c.header('Set-Cookie', buildClearedSessionCookie())
    return c.json({ status: 'ok' })
  })
}
