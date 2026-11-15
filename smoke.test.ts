import { existsSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { app } from './apps/api/src/index'

describe('smoke do workspace', () => {
  test('a entrada da API sobe e responde GET /health', async () => {
    const response = await app.request('/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test('o teste de migração do apps/api é descoberto', () => {
    expect(existsSync(new URL('./apps/api/src/db/migration.test.ts', import.meta.url))).toBe(true)
  })
})
