import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

describe('migração inicial do scaffold', () => {
  test('aplica as migrações em um SQLite temporário e cria a tabela projects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dbmapper-migrations-'))
    const databasePath = join(directory, 'test.db')
    const sqlite = new Database(databasePath, { create: true })

    try {
      const db = drizzle(sqlite, { schema })
      migrate(db, { migrationsFolder })

      const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string
      }>
      expect(tables.map((table) => table.name)).toContain('projects')

      const columns = sqlite.query("PRAGMA table_info('projects')").all() as Array<{ name: string }>
      expect(columns.map((column) => column.name).sort()).toEqual(['created_at', 'id', 'name'])
    } finally {
      sqlite.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
