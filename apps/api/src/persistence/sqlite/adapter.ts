import { Database } from 'bun:sqlite'
import { fileURLToPath } from 'node:url'
import type { DatabaseModel, DescriptionSource, ReviewStatus } from '@dbmapper/domain'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import {
  columns as columnsTable,
  importRuns,
  loginAttempts as loginAttemptsTable,
  projects,
  relationships as relationshipsTable,
  tables as tablesTable,
  users as usersTable,
} from '../../db/schema'
import type {
  ApplyModelResult,
  ColumnRecord,
  CreateImportRunInput,
  CreateProjectInput,
  CreateUserInput,
  ImportRunRecord,
  LoginAttemptRepository,
  MutationContext,
  Persistence,
  ProjectAggregate,
  ProjectRecord,
  ProjectRepository,
  ProjectSummary,
  RelationshipRecord,
  TableRecord,
  UserRecord,
  UserRepository,
  UserRole,
} from '../ports'

const migrationsFolder = fileURLToPath(new URL('../../db/migrations', import.meta.url))

export interface CreateSqlitePersistenceOptions {
  migrate?: boolean
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function toUserRecord(row: typeof usersTable.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role as UserRole,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function createSqlitePersistence(
  databasePath: string,
  options: CreateSqlitePersistenceOptions = {},
): Persistence {
  const sqlite = new Database(databasePath, { create: true })
  sqlite.exec('PRAGMA foreign_keys = ON')
  const db = drizzle(sqlite)

  if (options.migrate) {
    migrate(db, { migrationsFolder })
  }

  type Db = typeof db
  type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

  const getProject = (id: string): ProjectAggregate | null => {
    const project = db.select().from(projects).where(eq(projects.id, id)).get()
    if (!project) return null

    const projectRecord: ProjectRecord = {
      id: project.id,
      name: project.name,
      description: project.description,
      businessTerms: parseStringArray(project.businessTerms),
      reviewed: project.reviewed,
      descriptionSource: project.descriptionSource as DescriptionSource,
      reviewedBy: project.reviewedBy,
      reviewedAt: project.reviewedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }

    const tableRows = db
      .select()
      .from(tablesTable)
      .where(eq(tablesTable.projectId, id))
      .orderBy(asc(tablesTable.position), asc(tablesTable.name))
      .all()

    const tableRecords: TableRecord[] = tableRows.map((table) => ({
      id: table.id,
      projectId: table.projectId,
      name: table.name,
      description: table.description,
      businessTerms: parseStringArray(table.businessTerms),
      status: table.status as ReviewStatus,
      reviewed: table.reviewed,
      descriptionSource: table.descriptionSource as DescriptionSource,
      reviewedBy: table.reviewedBy,
      reviewedAt: table.reviewedAt,
      position: table.position,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    }))

    const tableIds = tableRecords.map((table) => table.id)
    const columnRows = tableIds.length
      ? db
          .select()
          .from(columnsTable)
          .where(inArray(columnsTable.tableId, tableIds))
          .orderBy(asc(columnsTable.position), asc(columnsTable.name))
          .all()
      : []

    const columnRecords: ColumnRecord[] = columnRows.map((column) => ({
      id: column.id,
      tableId: column.tableId,
      name: column.name,
      type: column.type,
      primaryKey: column.primaryKey,
      foreignKey: column.foreignKey,
      description: column.description,
      businessTerms: parseStringArray(column.businessTerms),
      status: column.status as ReviewStatus,
      reviewed: column.reviewed,
      descriptionSource: column.descriptionSource as DescriptionSource,
      reviewedBy: column.reviewedBy,
      reviewedAt: column.reviewedAt,
      position: column.position,
      createdAt: column.createdAt,
      updatedAt: column.updatedAt,
    }))

    const relationshipRows = tableIds.length
      ? db
          .select()
          .from(relationshipsTable)
          .where(inArray(relationshipsTable.tableId, tableIds))
          .orderBy(asc(relationshipsTable.position), asc(relationshipsTable.id))
          .all()
      : []

    const relationshipRecords: RelationshipRecord[] = relationshipRows.map((relationship) => ({
      id: relationship.id,
      tableId: relationship.tableId,
      targetTable: relationship.targetTable,
      localColumns: parseStringArray(relationship.localColumns),
      referencedColumns: parseStringArray(relationship.referencedColumns),
      constraintName: relationship.constraintName,
      description: relationship.description,
      reviewed: relationship.reviewed,
      descriptionSource: relationship.descriptionSource as DescriptionSource,
      reviewedBy: relationship.reviewedBy,
      reviewedAt: relationship.reviewedAt,
      position: relationship.position,
      createdAt: relationship.createdAt,
      updatedAt: relationship.updatedAt,
    }))

    return {
      project: projectRecord,
      tables: tableRecords,
      columns: columnRecords,
      relationships: relationshipRecords,
    }
  }

  const writeModel = (
    tx: Tx,
    projectId: string,
    database: DatabaseModel,
    now: string,
    actorUserId: string | null,
  ): void => {
    const previousProject = tx.select().from(projects).where(eq(projects.id, projectId)).get()

    const existing = tx
      .select({
        id: tablesTable.id,
        name: tablesTable.name,
        reviewed: tablesTable.reviewed,
        reviewedBy: tablesTable.reviewedBy,
        reviewedAt: tablesTable.reviewedAt,
      })
      .from(tablesTable)
      .where(eq(tablesTable.projectId, projectId))
      .all()
    const existingIds = existing.map((table) => table.id)
    const previousTableByName = new Map(existing.map((table) => [table.name, table]))
    const tableNameById = new Map(existing.map((table) => [table.id, table.name]))

    const previousColumnByKey = new Map<
      string,
      { reviewed: boolean; reviewedBy: string | null; reviewedAt: string | null }
    >()
    const previousRelationshipByKey = new Map<
      string,
      { reviewed: boolean; reviewedBy: string | null; reviewedAt: string | null }
    >()

    if (existingIds.length > 0) {
      const columnRows = tx.select().from(columnsTable).where(inArray(columnsTable.tableId, existingIds)).all()
      for (const column of columnRows) {
        const tableName = tableNameById.get(column.tableId)
        if (tableName) previousColumnByKey.set(`${tableName}\0${column.name}`, column)
      }

      const relationshipRows = tx
        .select()
        .from(relationshipsTable)
        .where(inArray(relationshipsTable.tableId, existingIds))
        .all()
      for (const relationship of relationshipRows) {
        const tableName = tableNameById.get(relationship.tableId)
        if (!tableName) continue
        const key = [
          tableName,
          relationship.targetTable,
          relationship.constraintName,
          relationship.localColumns,
          relationship.referencedColumns,
        ].join('\0')
        previousRelationshipByKey.set(key, relationship)
      }

      tx.delete(relationshipsTable).where(inArray(relationshipsTable.tableId, existingIds)).run()
      tx.delete(columnsTable).where(inArray(columnsTable.tableId, existingIds)).run()
      tx.delete(tablesTable).where(eq(tablesTable.projectId, projectId)).run()
    }

    const attribute = (
      reviewed: boolean,
      previous: { reviewed: boolean; reviewedBy: string | null; reviewedAt: string | null } | undefined,
    ): { reviewedBy: string | null; reviewedAt: string | null } => {
      if (previous && previous.reviewed === reviewed) {
        return { reviewedBy: previous.reviewedBy, reviewedAt: previous.reviewedAt }
      }
      if (!reviewed) return { reviewedBy: null, reviewedAt: null }
      return { reviewedBy: actorUserId, reviewedAt: now }
    }

    const projectAttribution = attribute(database.reviewed ?? false, previousProject)

    tx.update(projects)
      .set({
        name: database.name,
        description: database.description,
        businessTerms: JSON.stringify(database.business_terms ?? []),
        reviewed: database.reviewed ?? false,
        reviewedBy: projectAttribution.reviewedBy,
        reviewedAt: projectAttribution.reviewedAt,
        updatedAt: now,
      })
      .where(eq(projects.id, projectId))
      .run()

    database.tables.forEach((table, tableIndex) => {
      const tableId = crypto.randomUUID()
      const tableReviewed = table.reviewed ?? false
      const tableAttribution = attribute(tableReviewed, previousTableByName.get(table.name))
      tx.insert(tablesTable)
        .values({
          id: tableId,
          projectId,
          name: table.name,
          description: table.description ?? '',
          businessTerms: JSON.stringify(table.business_terms ?? []),
          status: table.status ?? 'UNCHANGED',
          reviewed: tableReviewed,
          descriptionSource: 'human',
          reviewedBy: tableAttribution.reviewedBy,
          reviewedAt: tableAttribution.reviewedAt,
          position: tableIndex,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      ;(table.columns ?? []).forEach((column, columnIndex) => {
        const columnReviewed = column.reviewed ?? false
        const columnAttribution = attribute(columnReviewed, previousColumnByKey.get(`${table.name}\0${column.name}`))
        tx.insert(columnsTable)
          .values({
            id: crypto.randomUUID(),
            tableId,
            name: column.name,
            type: column.type,
            primaryKey: column.primary_key ?? false,
            foreignKey: column.foreign_key ?? false,
            description: column.description ?? '',
            businessTerms: JSON.stringify(column.business_terms ?? []),
            status: column.status ?? 'UNCHANGED',
            reviewed: columnReviewed,
            descriptionSource: 'human',
            reviewedBy: columnAttribution.reviewedBy,
            reviewedAt: columnAttribution.reviewedAt,
            position: columnIndex,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      })

      ;(table.relationships?.parents || []).forEach((relationship, index) => {
        const relationshipReviewed = relationship.reviewed ?? false
        const key = [
          table.name,
          relationship.table,
          relationship.constraint_name ?? '',
          JSON.stringify(relationship.local_columns ?? []),
          JSON.stringify(relationship.referenced_columns ?? []),
        ].join('\0')
        const relationshipAttribution = attribute(relationshipReviewed, previousRelationshipByKey.get(key))
        tx.insert(relationshipsTable)
          .values({
            id: crypto.randomUUID(),
            tableId,
            targetTable: relationship.table,
            localColumns: JSON.stringify(relationship.local_columns ?? []),
            referencedColumns: JSON.stringify(relationship.referenced_columns ?? []),
            constraintName: relationship.constraint_name ?? '',
            description: relationship.description ?? '',
            reviewed: relationshipReviewed,
            descriptionSource: 'human',
            reviewedBy: relationshipAttribution.reviewedBy,
            reviewedAt: relationshipAttribution.reviewedAt,
            position: index,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      })
    })
  }

  const listImportRuns = (projectId: string): ImportRunRecord[] => {
    const rows = db
      .select()
      .from(importRuns)
      .where(eq(importRuns.projectId, projectId))
      .orderBy(asc(importRuns.createdAt), asc(importRuns.id))
      .all()

    return rows.reverse().map((run) => ({
      id: run.id,
      projectId: run.projectId,
      sqlHash: run.sqlHash,
      planSnapshot: run.planSnapshot,
      createdAt: run.createdAt,
    }))
  }

  const projectRepository: ProjectRepository = {
    create(input: CreateProjectInput): ProjectRecord {
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      db.insert(projects)
        .values({
          id,
          name: input.name,
          description: input.description ?? '',
          businessTerms: '[]',
          reviewed: false,
          descriptionSource: 'human',
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      return {
        id,
        name: input.name,
        description: input.description ?? '',
        businessTerms: [],
        reviewed: false,
        descriptionSource: 'human',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    },

    list(): ProjectSummary[] {
      const rows = db.select().from(projects).orderBy(asc(projects.createdAt), asc(projects.name)).all()

      return rows.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }))
    },

    get: getProject,

    replaceModel(id: string, database: DatabaseModel, context: MutationContext = {}): ProjectAggregate | null {
      const now = new Date().toISOString()
      const changed = db.transaction((tx) => {
        const exists = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get()
        if (!exists) return false
        writeModel(tx, id, database, now, context.actorUserId ?? null)
        return true
      })

      return changed ? getProject(id) : null
    },

    applyModel(
      id: string,
      database: DatabaseModel,
      run: CreateImportRunInput,
      context: MutationContext = {},
    ): ApplyModelResult | null {
      const now = new Date().toISOString()
      const runId = crypto.randomUUID()
      const applied = db.transaction((tx) => {
        const exists = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get()
        if (!exists) return false
        writeModel(tx, id, database, now, context.actorUserId ?? null)
        tx.insert(importRuns)
          .values({
            id: runId,
            projectId: id,
            sqlHash: run.sqlHash,
            planSnapshot: run.planSnapshot,
            createdAt: now,
          })
          .run()
        return true
      })

      if (!applied) return null

      const model = getProject(id)
      if (!model) return null

      return {
        model,
        run: {
          id: runId,
          projectId: id,
          sqlHash: run.sqlHash,
          planSnapshot: run.planSnapshot,
          createdAt: now,
        },
      }
    },

    listImportRuns,
  }

  const userRepository: UserRepository = {
    create(input: CreateUserInput): UserRecord {
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      db.insert(usersTable)
        .values({
          id,
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      return {
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      }
    },

    findByEmail(email: string): UserRecord | null {
      const row = db.select().from(usersTable).where(eq(usersTable.email, email)).get()
      return row ? toUserRecord(row) : null
    },

    findById(id: string): UserRecord | null {
      const row = db.select().from(usersTable).where(eq(usersTable.id, id)).get()
      return row ? toUserRecord(row) : null
    },

    list(): UserRecord[] {
      return db
        .select()
        .from(usersTable)
        .orderBy(asc(usersTable.createdAt), asc(usersTable.email))
        .all()
        .map(toUserRecord)
    },

    updateRole(id: string, role: UserRole): UserRecord | null {
      const updated = db
        .update(usersTable)
        .set({ role, updatedAt: new Date().toISOString() })
        .where(eq(usersTable.id, id))
        .returning()
        .get()
      return updated ? toUserRecord(updated) : null
    },

    countByRole(role: UserRole): number {
      return db.select().from(usersTable).where(eq(usersTable.role, role)).all().length
    },
  }

  const loginAttemptRepository: LoginAttemptRepository = {
    record(identity: string, ip: string, attemptedAt: string): void {
      db.insert(loginAttemptsTable).values({ id: crypto.randomUUID(), identity, ip, attemptedAt }).run()
    },

    listSince(identity: string, since: string): string[] {
      return db
        .select({ attemptedAt: loginAttemptsTable.attemptedAt })
        .from(loginAttemptsTable)
        .where(and(eq(loginAttemptsTable.identity, identity), gte(loginAttemptsTable.attemptedAt, since)))
        .orderBy(asc(loginAttemptsTable.attemptedAt))
        .all()
        .map((row) => row.attemptedAt)
    },

    pruneBefore(before: string): void {
      db.delete(loginAttemptsTable).where(lt(loginAttemptsTable.attemptedAt, before)).run()
    },

    clear(identity: string): void {
      db.delete(loginAttemptsTable).where(eq(loginAttemptsTable.identity, identity)).run()
    },
  }

  return {
    projects: projectRepository,
    users: userRepository,
    loginAttempts: loginAttemptRepository,
    close(): void {
      sqlite.close()
    },
  }
}
