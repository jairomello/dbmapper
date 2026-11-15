import type { Persistence } from './ports'
import { createSqlitePersistence } from './sqlite/adapter'

export interface RuntimePersistenceOptions {
  databasePath?: string
}

export function createRuntimePersistence(options: RuntimePersistenceOptions = {}): Persistence {
  const databasePath = options.databasePath ?? process.env.DATABASE_URL ?? './dev.db'
  return createSqlitePersistence(databasePath)
}
