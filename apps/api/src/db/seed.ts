import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Persistence, UserRepository } from '../persistence/ports'
import { createSqlitePersistence } from '../persistence/sqlite/adapter'
import { hashPassword } from '../services/auth'

export const DEFAULT_ADMIN_EMAIL = 'admin@dbmapper.local'

export interface SeedOptions {
  email?: string
  password?: string
}

export interface SeedResult {
  email: string
  created: boolean
  promoted: boolean
  generatedPassword: string | null
}

function createInitialPassword(): string {
  return randomBytes(18).toString('base64url')
}

export async function seedInitialAdmin(users: UserRepository, options: SeedOptions = {}): Promise<SeedResult> {
  const email = (options.email?.trim() || DEFAULT_ADMIN_EMAIL).toLowerCase()
  const existing = users.findByEmail(email)

  if (existing) {
    if (existing.role !== 'ADMIN') {
      users.updateRole(existing.id, 'ADMIN')
      return { email, created: false, promoted: true, generatedPassword: null }
    }
    return { email, created: false, promoted: false, generatedPassword: null }
  }

  const providedPassword = options.password ? options.password : null
  const generatedPassword = providedPassword ? null : createInitialPassword()
  const password = providedPassword ?? generatedPassword!
  users.create({ email, passwordHash: await hashPassword(password), role: 'ADMIN' })

  return { email, created: true, promoted: false, generatedPassword }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? './dev.db'
  const persistence: Persistence = createSqlitePersistence(databaseUrl, { migrate: true })

  try {
    const result = await seedInitialAdmin(persistence.users, {
      email: process.env.DBMAPPER_ADMIN_EMAIL,
      password: process.env.DBMAPPER_ADMIN_PASSWORD,
    })

    if (result.created) {
      console.log(`Admin inicial criado: ${result.email}`)
      if (result.generatedPassword) {
        console.log(`Senha gerada (exibida apenas uma vez): ${result.generatedPassword}`)
      }
    } else if (result.promoted) {
      console.log(`Usuário existente promovido a ADMIN: ${result.email}`)
    } else {
      console.log(`Admin inicial já existe: ${result.email}`)
    }
  } finally {
    persistence.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
