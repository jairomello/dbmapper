import bcrypt from 'bcryptjs'
import { describe, expect, test } from 'bun:test'
import type { JwtPayload } from '@dbmapper/contracts'
import {
  BCRYPT_COST,
  buildClearedSessionCookie,
  buildSessionCookie,
  createAuthConfig,
  DEV_JWT_SECRET,
  hashPassword,
  readSessionCookie,
  resolveJwtSecret,
  SESSION_TTL_SECONDS,
  shouldRenewSession,
  signJwt,
  toJwtPayload,
  verifyJwt,
  verifyPassword,
} from '../services/auth'

const user = {
  id: 'user-1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
}

describe('auth: senhas', () => {
  test('hash e verify fazem round-trip e usam custo 12', async () => {
    const hash = await hashPassword('senha-secreta')
    expect(hash).not.toBe('senha-secreta')
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST)
    await expect(verifyPassword('senha-secreta', hash)).resolves.toBe(true)
    await expect(verifyPassword('senha-errada', hash)).resolves.toBe(false)
  })
})

describe('auth: JWT de sessão', () => {
  test('assina e verifica o payload do usuário', async () => {
    const token = await signJwt(toJwtPayload(user), 'test-secret')
    const payload = await verifyJwt(token, 'test-secret')
    expect(payload).toMatchObject({ sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' })
  })

  test('rejeita token adulterado, segredo errado e token expirado', async () => {
    const token = await signJwt(toJwtPayload(user), 'test-secret')
    expect(await verifyJwt(`${token}x`, 'test-secret')).toBeNull()
    expect(await verifyJwt(token, 'outro-segredo')).toBeNull()
    const expired = await signJwt(toJwtPayload(user), 'test-secret', -10)
    expect(await verifyJwt(expired, 'test-secret')).toBeNull()
  })

  test('renova a sessão ao atingir 50% do TTL', () => {
    const issuedAt = 1_000_000
    expect(shouldRenewSession(issuedAt, issuedAt * 1000 + 1000)).toBe(false)
    expect(shouldRenewSession(issuedAt, issuedAt * 1000 + (SESSION_TTL_SECONDS / 2) * 1000)).toBe(true)
    expect(shouldRenewSession(undefined)).toBe(true)
  })
})

describe('auth: segredo e cookie', () => {
  test('usa JWT_SECRET configurado sem avisar', () => {
    const warnings: string[] = []
    expect(resolveJwtSecret({ JWT_SECRET: 'segredo-real' }, (message) => warnings.push(message))).toBe('segredo-real')
    expect(warnings).toEqual([])
  })

  test('fallback de desenvolvimento avisa e é recusado em produção', () => {
    const warnings: string[] = []
    expect(resolveJwtSecret({}, (message) => warnings.push(message))).toBe(DEV_JWT_SECRET)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('JWT_SECRET')

    expect(() => createAuthConfig({ NODE_ENV: 'production' }, (message) => warnings.push(message))).toThrow(
      'JWT_SECRET',
    )
  })

  test('cookie de sessão é HttpOnly, SameSite e expira em 24h', () => {
    const cookie = buildSessionCookie('token-abc')
    expect(cookie).toContain('session=token-abc')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`)
    expect(readSessionCookie(cookie)).toBe('token-abc')
    expect(buildClearedSessionCookie()).toContain('Max-Age=0')
    expect(readSessionCookie(undefined)).toBeNull()
  })
})

describe('auth: payload', () => {
  test('toJwtPayload não inclui o hash', () => {
    const withHash = { ...user, passwordHash: 'hash' }
    const payload: JwtPayload = toJwtPayload(withHash)
    expect(payload).toEqual({ sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' })
    expect(JSON.stringify(payload)).not.toContain('hash')
  })
})
