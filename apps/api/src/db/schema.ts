import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    projectScope: text('project_scope'),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(isoNow),
    lastUsedAt: text('last_used_at'),
  },
  (table) => ({
    hashUq: uniqueIndex('api_keys_hash_uq').on(table.keyHash),
    ownerIdx: index('api_keys_owner_idx').on(table.ownerId),
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

export const diagramLayouts = sqliteTable(
  'diagram_layouts',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    zoneName: text('zone_name').notNull().default('Principal'),
    positionsJson: text('positions_json').notNull().default('{}'),
    viewportX: real('viewport_x').notNull().default(0),
    viewportY: real('viewport_y').notNull().default(0),
    zoom: real('zoom').notNull().default(1),
    updatedAt: text('updated_at').notNull().default(isoNow),
    updatedBy: text('updated_by').references(() => users.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.zoneName] }),
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

export const AGENT_JOB_SCOPES = ['project', 'table'] as const
export const AGENT_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const
export const AI_SUGGESTION_ITEM_TYPES = ['table', 'column'] as const
export const AI_SUGGESTION_STATUSES = ['pending', 'applied', 'rejected'] as const

export const agentJobs = sqliteTable(
  'agent_jobs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: AGENT_JOB_SCOPES }).notNull(),
    tableId: text('table_id').references(() => tables.id, { onDelete: 'cascade' }),
    status: text('status', { enum: AGENT_JOB_STATUSES }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    leaseExpiresAt: text('lease_expires_at'),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    error: text('error'),
    statsJson: text('stats_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => ({
    projectCreatedIdx: index('agent_jobs_project_created_idx').on(table.projectId, table.createdAt),
    statusIdx: index('agent_jobs_status_idx').on(table.status),
    scopeCheck: check('agent_jobs_scope_check', sql`${table.scope} in ('project', 'table')`),
    statusCheck: check(
      'agent_jobs_status_check',
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
  }),
)

export const aiSuggestions = sqliteTable(
  'ai_suggestions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => agentJobs.id, { onDelete: 'cascade' }),
    itemType: text('item_type', { enum: AI_SUGGESTION_ITEM_TYPES }).notNull(),
    itemId: text('item_id').notNull(),
    tableId: text('table_id').references(() => tables.id, { onDelete: 'cascade' }),
    suggestedDescription: text('suggested_description').notNull(),
    contextJson: text('context_json').notNull().default('{}'),
    status: text('status', { enum: AI_SUGGESTION_STATUSES }).notNull().default('pending'),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id),
    decidedBy: text('decided_by').references(() => users.id),
    decidedAt: text('decided_at'),
    createdAt: text('created_at').notNull().default(isoNow),
    updatedAt: text('updated_at').notNull().default(isoNow),
  },
  (table) => ({
    projectStatusIdx: index('ai_suggestions_project_status_idx').on(table.projectId, table.status),
    pendingUq: uniqueIndex('ai_suggestions_pending_uq')
      .on(table.itemType, table.itemId)
      .where(sql`${table.status} = 'pending'`),
    itemTypeCheck: check('ai_suggestions_item_type_check', sql`${table.itemType} in ('table', 'column')`),
    statusCheck: check(
      'ai_suggestions_status_check',
      sql`${table.status} in ('pending', 'applied', 'rejected')`,
    ),
  }),
)

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    payloadJson: text('payload_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(isoNow),
  },
  (table) => ({
    projectCreatedIdx: index('events_project_created_idx').on(table.projectId, table.createdAt),
  }),
)
