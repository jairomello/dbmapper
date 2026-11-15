import { Database } from 'bun:sqlite'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

const databaseUrl = process.env.DATABASE_URL ?? './dev.db'
const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('./migrations', import.meta.url))

const sqlite = new Database(databaseUrl)

try {
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  console.log(`Migrações aplicadas em ${databaseUrl}`)
} finally {
  sqlite.close()
}
