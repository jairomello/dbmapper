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

interface ForeignKeyRow {
  table: string
  from: string
  to: string
  on_delete: string
}

describe('migração do domínio do dicionário', () => {
  test('aplica as migrações em um SQLite temporário e cria todas as tabelas do domínio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dbmapper-migrations-'))
    const databasePath = join(directory, 'test.db')
    const sqlite = new Database(databasePath, { create: true })

    try {
      const db = drizzle(sqlite, { schema })
      migrate(db, { migrationsFolder })

      const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string
      }>
      const tableNames = tables.map((table) => table.name)
      for (const expected of [
        'projects',
        'tables',
        'columns',
        'relationships',
        'import_runs',
        'users',
        'login_attempts',
      ]) {
        expect(tableNames).toContain(expected)
      }

      const projectColumns = sqlite.query("PRAGMA table_info('projects')").all() as Array<{ name: string }>
      expect(projectColumns.map((column) => column.name).sort()).toEqual([
        'business_terms',
        'created_at',
        'description',
        'description_source',
        'id',
        'name',
        'reviewed',
        'reviewed_at',
        'reviewed_by',
        'updated_at',
      ])

      const tableColumns = sqlite.query("PRAGMA table_info('tables')").all() as Array<{ name: string }>
      for (const expected of [
        'id',
        'project_id',
        'name',
        'description',
        'business_terms',
        'status',
        'reviewed',
        'description_source',
        'reviewed_by',
        'reviewed_at',
        'created_at',
        'updated_at',
      ]) {
        expect(tableColumns.map((column) => column.name)).toContain(expected)
      }

      const columnColumns = sqlite.query("PRAGMA table_info('columns')").all() as Array<{ name: string }>
      for (const expected of [
        'id',
        'table_id',
        'name',
        'type',
        'primary_key',
        'foreign_key',
        'description',
        'business_terms',
        'status',
        'reviewed',
        'description_source',
        'reviewed_by',
        'reviewed_at',
      ]) {
        expect(columnColumns.map((column) => column.name)).toContain(expected)
      }

      const relationshipColumns = sqlite.query("PRAGMA table_info('relationships')").all() as Array<{ name: string }>
      for (const expected of [
        'id',
        'table_id',
        'target_table',
        'local_columns',
        'referenced_columns',
        'constraint_name',
        'description',
        'reviewed',
        'description_source',
        'reviewed_by',
        'reviewed_at',
      ]) {
        expect(relationshipColumns.map((column) => column.name)).toContain(expected)
      }

      const importRunColumns = sqlite.query("PRAGMA table_info('import_runs')").all() as Array<{ name: string }>
      expect(importRunColumns.map((column) => column.name).sort()).toEqual([
        'created_at',
        'id',
        'plan_snapshot',
        'project_id',
        'sql_hash',
      ])

      const userColumns = sqlite.query("PRAGMA table_info('users')").all() as Array<{ name: string }>
      expect(userColumns.map((column) => column.name).sort()).toEqual([
        'created_at',
        'email',
        'id',
        'password_hash',
        'role',
        'updated_at',
      ])

      const loginAttemptColumns = sqlite.query("PRAGMA table_info('login_attempts')").all() as Array<{ name: string }>
      expect(loginAttemptColumns.map((column) => column.name).sort()).toEqual(['attempted_at', 'id', 'identity', 'ip'])

      const userIndexes = sqlite.query("PRAGMA index_list('users')").all() as Array<{
        name: string
        unique: number
      }>
      const emailIndex = userIndexes.find((indexRow) => indexRow.name === 'users_email_uq')
      expect(emailIndex).toBeTruthy()
      expect(emailIndex!.unique).toBe(1)
      const emailIndexColumns = sqlite.query("PRAGMA index_info('users_email_uq')").all() as Array<{
        name: string
      }>
      expect(emailIndexColumns.map((column) => column.name)).toEqual(['email'])

      const insertUser = (id: string, email: string, role: string) =>
        sqlite.run("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'hash', ?)", [id, email, role])

      expect(() => insertUser('u1', 'admin@example.com', 'OWNER')).toThrow()
      expect(() => insertUser('u1', 'admin@example.com', 'ADMIN')).not.toThrow()
      expect(() => insertUser('u2', 'admin@example.com', 'MEMBER')).toThrow()

      const expectForeignKey = (table: string, from: string, to: string) => {
        const foreignKeys = sqlite.query(`PRAGMA foreign_key_list('${table}')`).all() as ForeignKeyRow[]
        const foreignKey = foreignKeys.find((row) => row.from === from)
        expect(foreignKey).toBeTruthy()
        expect(foreignKey!.table).toBe(to)
        expect(foreignKey!.on_delete).toBe('CASCADE')
      }

      expectForeignKey('tables', 'project_id', 'projects')
      expectForeignKey('columns', 'table_id', 'tables')
      expectForeignKey('relationships', 'table_id', 'tables')
      expectForeignKey('import_runs', 'project_id', 'projects')
    } finally {
      sqlite.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
