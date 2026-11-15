import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

export const USER_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull().default('MEMBER'),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => ({
    emailUq: uniqueIndex('users_email_uq').on(table.email),
    roleCheck: check('users_role_check', sql`${table.role} in ('ADMIN', 'MEMBER', 'VIEWER')`),
  }),
)

export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: text('id').primaryKey(),
    identity: text('identity').notNull(),
    ip: text('ip').notNull().default(''),
    attemptedAt: text('attempted_at').notNull().default(isoNow),
  },
  (table) => ({
    identityIdx: index('login_attempts_identity_idx').on(table.identity, table.attemptedAt),
    attemptedAtIdx: index('login_attempts_attempted_at_idx').on(table.attemptedAt),
  }),
)

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  businessTerms: text('business_terms').notNull().default('[]'),
  reviewed: integer('reviewed', { mode: 'boolean' }).notNull().default(false),
  descriptionSource: text('description_source').notNull().default('human'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').notNull().default(isoNow),
  updatedAt: text('updated_at').notNull().default(isoNow),
})

export const tables = sqliteTable(
  'tables',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    businessTerms: text('business_terms').notNull().default('[]'),
    status: text('status').notNull().default('UNCHANGED'),
    reviewed: integer('reviewed', { mode: 'boolean' }).notNull().default(false),
    descriptionSource: text('description_source').notNull().default('human'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => ({
    projectNameUq: uniqueIndex('tables_project_name_uq').on(table.projectId, table.name),
    projectIdx: index('tables_project_idx').on(table.projectId),
  }),
)

export const columns = sqliteTable(
  'columns',
  {
    id: text('id').primaryKey(),
    tableId: text('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    primaryKey: integer('primary_key', { mode: 'boolean' }).notNull().default(false),
    foreignKey: integer('foreign_key', { mode: 'boolean' }).notNull().default(false),
    description: text('description').notNull().default(''),
    businessTerms: text('business_terms').notNull().default('[]'),
    status: text('status').notNull().default('UNCHANGED'),
    reviewed: integer('reviewed', { mode: 'boolean' }).notNull().default(false),
    descriptionSource: text('description_source').notNull().default('human'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => ({
    tableNameUq: uniqueIndex('columns_table_name_uq').on(table.tableId, table.name),
    tableIdx: index('columns_table_idx').on(table.tableId),
  }),
)

export const relationships = sqliteTable(
  'relationships',
  {
    id: text('id').primaryKey(),
    tableId: text('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    targetTable: text('target_table').notNull(),
    localColumns: text('local_columns').notNull().default('[]'),
    referencedColumns: text('referenced_columns').notNull().default('[]'),
    constraintName: text('constraint_name').notNull().default(''),
    description: text('description').notNull().default(''),
    reviewed: integer('reviewed', { mode: 'boolean' }).notNull().default(false),
    descriptionSource: text('description_source').notNull().default('human'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => ({
    tableIdx: index('relationships_table_idx').on(table.tableId),
  }),
)

export const importRuns = sqliteTable(
  'import_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sqlHash: text('sql_hash').notNull(),
    planSnapshot: text('plan_snapshot').notNull(),
    createdAt: text('created_at').notNull().default(isoNow),
  },
  (table) => ({
    projectIdx: index('import_runs_project_idx').on(table.projectId),
    createdIdx: index('import_runs_created_idx').on(table.createdAt),
  }),
)
