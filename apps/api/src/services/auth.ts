import type { JwtPayload } from '@dbmapper/contracts'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import type { UserRecord, UserRole } from '../persistence/ports'

export const BCRYPT_COST = 12
export const SESSION_COOKIE_NAME = 'session'
export const SESSION_TTL_SECONDS = 24 * 60 * 60
export const SESSION_RENEW_AFTER_SECONDS = SESSION_TTL_SECONDS / 2
export const DEV_JWT_SECRET = 'dbmapper-dev-secret-do-not-use-in-production'

const JWT_ISSUER = 'dbmapper'
const JWT_AUDIENCE = 'dbmapper-api'

export interface AuthConfig {
  secret: string
  sessionTtlSeconds: number
  renewAfterSeconds: number
}

export type AuthWarn = (message: string) => void

export function resolveJwtSecret(
  env: Record<string, string | undefined> = process.env,
  warn: AuthWarn = console.warn,
): string {
  const configured = env.JWT_SECRET?.trim()
  if (configured) return configured

  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET é obrigatório quando NODE_ENV=production.')
  }

  warn('JWT_SECRET não definido: usando o segredo de desenvolvimento. Defina JWT_SECRET antes de qualquer deploy.')
  return DEV_JWT_SECRET
}

export function createAuthConfig(
  env: Record<string, string | undefined> = process.env,
  warn: AuthWarn = console.warn,
): AuthConfig {
  return {
    secret: resolveJwtSecret(env, warn),
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    renewAfterSeconds: SESSION_RENEW_AFTER_SECONDS,
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

export function toJwtPayload(user: Pick<UserRecord, 'id' | 'email' | 'role'>): JwtPayload {
  return { sub: user.id, email: user.email, role: user.role }
}

export async function signJwt(
  payload: JwtPayload,
  secret: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(new TextEncoder().encode(secret))
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })

    if (!payload.sub || typeof payload.email !== 'string') return null
    if (payload.role !== 'ADMIN' && payload.role !== 'MEMBER' && payload.role !== 'VIEWER') return null

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

export function shouldRenewSession(
  issuedAtSeconds: number | undefined,
  nowMs: number = Date.now(),
  renewAfterSeconds: number = SESSION_RENEW_AFTER_SECONDS,
): boolean {
  if (!issuedAtSeconds) return true
  return nowMs / 1000 - issuedAtSeconds >= renewAfterSeconds
}

export function buildSessionCookie(token: string, maxAgeSeconds: number = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
}

export function buildClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readSessionCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === SESSION_COOKIE_NAME) {
      const value = valueParts.join('=').trim()
      return value.length > 0 ? value : null
    }
  }
  return null
}

export function publicUser(user: UserRecord): { id: string; email: string; role: UserRole } {
  return { id: user.id, email: user.email, role: user.role }
}
