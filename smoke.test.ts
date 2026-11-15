import { existsSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

describe('smoke do workspace', () => {
  test('a entrada da API sobe e responde GET /health', async () => {
    process.env.DATABASE_URL = ':memory:'
    const { app } = await import('./apps/api/src/index')
    const response = await app.request('/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test('o teste de migração do apps/api é descoberto', () => {
    expect(existsSync(new URL('./apps/api/src/db/migration.test.ts', import.meta.url))).toBe(true)
  })
})
