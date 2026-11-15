import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'
import { verifyPassword } from '../services/auth'

const apiRoot = fileURLToPath(new URL('../../', import.meta.url))

interface SeedRun {
  stdout: string
  stderr: string
  exitCode: number
}

async function runSeed(databasePath: string, env: Record<string, string>): Promise<SeedRun> {
  const child = Bun.spawn(['bun', 'run', 'src/db/seed.ts'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databasePath, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { stdout, stderr, exitCode }
}

function readUsers(databasePath: string): Array<{ email: string; role: string; password_hash: string }> {
  const sqlite = new Database(databasePath)
  try {
    return sqlite.query('SELECT email, role, password_hash FROM users ORDER BY email').all() as Array<{
      email: string
      role: string
      password_hash: string
    }>
  } finally {
    sqlite.close()
  }
}

describe('db:seed', () => {
  test('cria exatamente um ADMIN a partir do env e é idempotente na segunda execução', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dbmapper-seed-'))
    const databasePath = join(directory, 'seed.db')
    const env = {
      DBMAPPER_ADMIN_EMAIL: 'admin@example.com',
      DBMAPPER_ADMIN_PASSWORD: 'senha-inicial-forte',
    }

    try {
      const first = await runSeed(databasePath, env)
      expect(first.exitCode).toBe(0)
      expect(first.stderr).toBe('')
      expect(first.stdout).toContain('Admin inicial criado: admin@example.com')
      expect(first.stdout).not.toContain('senha-inicial-forte')

      const users = readUsers(databasePath)
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('admin@example.com')
      expect(users[0].role).toBe('ADMIN')
      expect(users[0].password_hash).not.toBe('senha-inicial-forte')
      await expect(verifyPassword('senha-inicial-forte', users[0].password_hash)).resolves.toBe(true)

      const second = await runSeed(databasePath, env)
      expect(second.exitCode).toBe(0)
      expect(second.stdout).toContain('Admin inicial já existe: admin@example.com')
      expect(readUsers(databasePath)).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)

  test('gera e imprime uma senha aleatória quando DBMAPPER_ADMIN_PASSWORD não é informado', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dbmapper-seed-'))
    const databasePath = join(directory, 'seed.db')

    try {
      const result = await runSeed(databasePath, {
        DBMAPPER_ADMIN_EMAIL: 'random@example.com',
        DBMAPPER_ADMIN_PASSWORD: '',
      })
      expect(result.exitCode).toBe(0)

      const match = result.stdout.match(/Senha gerada \(exibida apenas uma vez\): (.+)/)
      expect(match).toBeTruthy()
      const generated = match![1].trim()
      expect(generated.length).toBeGreaterThanOrEqual(16)

      const users = readUsers(databasePath)
      expect(users).toHaveLength(1)
      expect(users[0].role).toBe('ADMIN')
      await expect(verifyPassword(generated, users[0].password_hash)).resolves.toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
