import { Database } from 'bun:sqlite'
import { fileURLToPath } from 'node:url'
import type { DatabaseModel, DescriptionSource, ReviewStatus } from '@dbmapper/domain'
import { and, asc, desc, eq, gte, inArray, like, lt, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import {
  agentJobs as agentJobsTable,
  aiSuggestions as aiSuggestionsTable,
  apiKeys as apiKeysTable,
  columns as columnsTable,
  diagramLayouts as diagramLayoutsTable,
  events as eventsTable,
  importRuns,
  loginAttempts as loginAttemptsTable,
  projects,
  relationships as relationshipsTable,
  tables as tablesTable,
  users as usersTable,
} from '../../db/schema'
import type {
  AgentJobRecord,
  AgentJobRepository,
  AgentJobStatus,
  AgentRepositories,
  AgentJobScope,
  AiSuggestionRecord,
  AiSuggestionStatus,
  AiSuggestionItemType,
  ApiKeyRecord,
  ApiKeyRepository,
  ApplyModelResult,
  ColumnRecord,
  CreateAgentJobOptions,
  CreateAgentJobInput,
  CreateAiSuggestionInput,
  CreateApiKeyInput,
  CreateImportRunInput,
  CreateProjectInput,
  CreateProjectOptions,
  CreateUserInput,
  DecisionAudit,
  DescriptionItemType,
  DiagramLayoutRecord,
  DiagramPosition,
  EventListFilters,
  EventRecord,
  EventRepository,
  EventWithActor,
  ImportRunRecord,
  InsertEventInput,
  LoginAttemptRepository,
  MutationContext,
  Persistence,
  ProjectAggregate,
  ProjectRecord,
  ProjectRepository,
  ProjectSummary,
  PutDiagramLayoutInput,
  RelationshipRecord,
  SetItemDescriptionInput,
  SetItemDescriptionResult,
  SuggestionDecisionResult,
  SuggestionRepository,
  TableRecord,
  UserMutationOptions,
  UserRecord,
  UserRepository,
  UserRole,
} from '../ports'
import { DEFAULT_DIAGRAM_ZONE } from '../ports'

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

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parseDiagramPositions(value: string): Record<string, DiagramPosition> {
  const positions: Record<string, DiagramPosition> = {}

  for (const [name, raw] of Object.entries(parseJsonObject(value))) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const { x, y } = raw as { x?: unknown; y?: unknown }
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      positions[name] = { x, y }
    }
  }

  return positions
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

function toAgentJobRecord(row: typeof agentJobsTable.$inferSelect): AgentJobRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    scope: row.scope as AgentJobScope,
    tableId: row.tableId,
    status: row.status as AgentJobStatus,
    attempts: row.attempts,
    leaseExpiresAt: row.leaseExpiresAt,
    requestedBy: row.requestedBy,
    error: row.error,
    stats: parseJsonObject(row.statsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSuggestionRecord(row: typeof aiSuggestionsTable.$inferSelect): AiSuggestionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    jobId: row.jobId,
    itemType: row.itemType as AiSuggestionItemType,
    itemId: row.itemId,
    tableId: row.tableId,
    suggestedDescription: row.suggestedDescription,
    context: parseJsonObject(row.contextJson),
    status: row.status as AiSuggestionStatus,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toApiKeyRecord(row: typeof apiKeysTable.$inferSelect): ApiKeyRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    keyHash: row.keyHash,
    keyPrefix: row.keyPrefix,
    projectScope: row.projectScope,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }
}

function toEventRecord(row: typeof eventsTable.$inferSelect): EventRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    actorUserId: row.actorUserId,
    action: row.action,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    payload: parseJsonObject(row.payloadJson),
    createdAt: row.createdAt,
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

  const insertEventRow = (tx: Tx, input: InsertEventInput, now: string): EventRecord => {
    const createdAt = input.createdAt ?? now
    const row = {
      id: crypto.randomUUID(),
      projectId: input.projectId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      payloadJson: JSON.stringify(input.payload ?? {}),
      createdAt,
    }
    tx.insert(eventsTable).values(row).run()
    return {
      id: row.id,
      projectId: row.projectId,
      actorUserId: row.actorUserId,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      payload: input.payload ?? {},
      createdAt,
    }
  }

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
    create(input: CreateProjectInput, options: CreateProjectOptions = {}): ProjectRecord {
      const now = options.now ?? new Date().toISOString()
      const id = crypto.randomUUID()
      const record: ProjectRecord = {
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

      db.transaction((tx) => {
        tx.insert(projects)
          .values({
            id,
            name: record.name,
            description: record.description,
            businessTerms: '[]',
            reviewed: false,
            descriptionSource: 'human',
            reviewedBy: null,
            reviewedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        if (options.audit) {
          insertEventRow(
            tx,
            {
              ...options.audit,
              projectId: id,
              subjectId: id,
              payload: { ...options.audit.payload, projectId: id },
              createdAt: now,
            },
            now,
          )
        }
      })

      return record
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
        if (context.audit) {
          insertEventRow(
            tx,
            {
              ...context.audit,
              projectId: id,
              subjectId: context.audit.subjectId || id,
              createdAt: now,
            },
            now,
          )
        }
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
        if (context.audit) {
          insertEventRow(
            tx,
            {
              ...context.audit,
              projectId: id,
              subjectId: context.audit.subjectId || id,
              createdAt: now,
            },
            now,
          )
        }
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

    setItemDescription(input: SetItemDescriptionInput): SetItemDescriptionResult | null {
      const now = input.now ?? new Date().toISOString()

      return db.transaction((tx) => {
        let current: { description: string; reviewed: boolean } | null = null

        if (input.itemType === 'table') {
          const row = tx
            .select({ description: tablesTable.description, reviewed: tablesTable.reviewed })
            .from(tablesTable)
            .where(and(eq(tablesTable.id, input.itemId), eq(tablesTable.projectId, input.projectId)))
            .get()
          current = row ?? null
        } else if (input.itemType === 'column') {
          const row = tx
            .select({ description: columnsTable.description, reviewed: columnsTable.reviewed })
            .from(columnsTable)
            .innerJoin(tablesTable, eq(columnsTable.tableId, tablesTable.id))
            .where(and(eq(columnsTable.id, input.itemId), eq(tablesTable.projectId, input.projectId)))
            .get()
          current = row ?? null
        } else {
          const row = tx
            .select({ description: relationshipsTable.description, reviewed: relationshipsTable.reviewed })
            .from(relationshipsTable)
            .innerJoin(tablesTable, eq(relationshipsTable.tableId, tablesTable.id))
            .where(and(eq(relationshipsTable.id, input.itemId), eq(tablesTable.projectId, input.projectId)))
            .get()
          current = row ?? null
        }

        if (!current) return null

        const changed = current.description !== input.description
        const reviewed = changed ? false : current.reviewed
        const patch = {
          description: input.description,
          descriptionSource: input.source,
          reviewed,
          ...(changed ? { reviewedBy: null, reviewedAt: null } : {}),
          updatedAt: now,
        }

        if (input.itemType === 'table') {
          tx.update(tablesTable).set(patch).where(eq(tablesTable.id, input.itemId)).run()
        } else if (input.itemType === 'column') {
          tx.update(columnsTable).set(patch).where(eq(columnsTable.id, input.itemId)).run()
        } else {
          tx.update(relationshipsTable).set(patch).where(eq(relationshipsTable.id, input.itemId)).run()
        }

        insertEventRow(
          tx,
          {
            projectId: input.projectId,
            actorUserId: input.actorUserId ?? null,
            action: 'item.description_written',
            subjectType: input.itemType,
            subjectId: input.itemId,
            payload: {
              itemType: input.itemType,
              itemId: input.itemId,
              descriptionSource: input.source,
              changed,
            },
            createdAt: now,
          },
          now,
        )

        return {
          projectId: input.projectId,
          itemType: input.itemType as DescriptionItemType,
          itemId: input.itemId,
          description: input.description,
          descriptionSource: input.source,
          reviewed,
          changed,
          updatedAt: now,
        }
      })
    },

    getDiagramLayout(projectId: string, zoneName: string = DEFAULT_DIAGRAM_ZONE): DiagramLayoutRecord | null {
      const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()
      if (!project) return null

      const tableNames = new Set(
        db
          .select({ name: tablesTable.name })
          .from(tablesTable)
          .where(eq(tablesTable.projectId, projectId))
          .all()
          .map((table) => table.name),
      )

      const row = db
        .select()
        .from(diagramLayoutsTable)
        .where(
          and(eq(diagramLayoutsTable.projectId, projectId), eq(diagramLayoutsTable.zoneName, zoneName)),
        )
        .get()
      if (!row) {
        return {
          projectId,
          zoneName,
          positions: {},
          viewportX: 0,
          viewportY: 0,
          zoom: 1,
          updatedAt: null,
          updatedBy: null,
        }
      }

      const positions: Record<string, DiagramPosition> = {}
      for (const [name, position] of Object.entries(parseDiagramPositions(row.positionsJson))) {
        if (tableNames.has(name)) positions[name] = position
      }

      return {
        projectId: row.projectId,
        zoneName: row.zoneName,
        positions,
        viewportX: row.viewportX,
        viewportY: row.viewportY,
        zoom: row.zoom,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }
    },

    putDiagramLayout(input: PutDiagramLayoutInput): DiagramLayoutRecord | null {
      const now = input.now ?? new Date().toISOString()
      const zoneName = input.zoneName ?? DEFAULT_DIAGRAM_ZONE
      const actorUserId = input.actorUserId ?? input.audit?.actorUserId ?? null
      const positionsJson = JSON.stringify(input.positions)

      return db.transaction((tx) => {
        const exists = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).get()
        if (!exists) return null

        tx.insert(diagramLayoutsTable)
          .values({
            projectId: input.projectId,
            zoneName,
            positionsJson,
            viewportX: input.viewportX,
            viewportY: input.viewportY,
            zoom: input.zoom,
            updatedAt: now,
            updatedBy: actorUserId,
          })
          .onConflictDoUpdate({
            target: [diagramLayoutsTable.projectId, diagramLayoutsTable.zoneName],
            set: {
              positionsJson,
              viewportX: input.viewportX,
              viewportY: input.viewportY,
              zoom: input.zoom,
              updatedAt: now,
              updatedBy: actorUserId,
            },
          })
          .run()

        if (input.audit) {
          insertEventRow(
            tx,
            {
              ...input.audit,
              projectId: input.projectId,
              subjectId: input.audit.subjectId || input.projectId,
              actorUserId: input.audit.actorUserId ?? actorUserId,
              createdAt: now,
            },
            now,
          )
        }

        return {
          projectId: input.projectId,
          zoneName,
          positions: input.positions,
          viewportX: input.viewportX,
          viewportY: input.viewportY,
          zoom: input.zoom,
          updatedAt: now,
          updatedBy: actorUserId,
        }
      })
    },
  }

  const apiKeyRepository: ApiKeyRepository = {
    create(input: CreateApiKeyInput, options: { now?: string; audit?: InsertEventInput } = {}): ApiKeyRecord {
      const now = options.now ?? new Date().toISOString()
      const row = {
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        name: input.name,
        keyHash: input.keyHash,
        keyPrefix: input.keyPrefix,
        projectScope: input.projectScope ?? null,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
        createdAt: now,
        lastUsedAt: null,
      }

      return db.transaction((tx) => {
        tx.insert(apiKeysTable).values(row).run()
        if (options.audit) {
          insertEventRow(tx, { ...options.audit, subjectId: row.id, actorUserId: input.ownerId, createdAt: now }, now)
        }
        return toApiKeyRecord(row)
      })
    },

    listByOwner(ownerId: string): ApiKeyRecord[] {
      return db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.ownerId, ownerId))
        .orderBy(asc(apiKeysTable.createdAt), asc(apiKeysTable.id))
        .all()
        .map(toApiKeyRecord)
    },

    findByHash(hash: string): ApiKeyRecord | null {
      const row = db.select().from(apiKeysTable).where(eq(apiKeysTable.keyHash, hash)).get()
      return row ? toApiKeyRecord(row) : null
    },

    findUsableByHash(hash: string, now: string): ApiKeyRecord | null {
      const row = db.select().from(apiKeysTable).where(eq(apiKeysTable.keyHash, hash)).get()
      if (!row) return null
      if (row.revokedAt) return null
      if (row.expiresAt && row.expiresAt <= now) return null
      return toApiKeyRecord(row)
    },

    revoke(ownerId: string, id: string, options: { now?: string; audit?: InsertEventInput } = {}): ApiKeyRecord | null {
      const now = options.now ?? new Date().toISOString()

      return db.transaction((tx) => {
        const existing = tx
          .select()
          .from(apiKeysTable)
          .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.ownerId, ownerId)))
          .get()
        if (!existing) return null

        const revokedAt = existing.revokedAt ?? now
        const updated = tx
          .update(apiKeysTable)
          .set({ revokedAt })
          .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.ownerId, ownerId)))
          .returning()
          .get()
        if (!updated) return null

        if (options.audit) {
          insertEventRow(tx, { ...options.audit, actorUserId: ownerId, createdAt: now }, now)
        }
        return toApiKeyRecord(updated)
      })
    },

    touchLastUsed(id: string, now: string): void {
      db.update(apiKeysTable).set({ lastUsedAt: now }).where(eq(apiKeysTable.id, id)).run()
    },
  }

  const userRepository: UserRepository = {
    create(input: CreateUserInput, options: UserMutationOptions = {}): UserRecord {
      const now = options.now ?? new Date().toISOString()
      const id = crypto.randomUUID()
      const record: UserRecord = {
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      }

      db.transaction((tx) => {
        tx.insert(usersTable)
          .values({
            id,
            email: input.email,
            passwordHash: input.passwordHash,
            role: input.role,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        if (options.audit) {
          insertEventRow(
            tx,
            {
              ...options.audit,
              subjectId: id,
              payload: { ...options.audit.payload, userId: id },
              createdAt: now,
            },
            now,
          )
        }
      })

      return record
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

    updateRole(id: string, role: UserRole, options: UserMutationOptions = {}): UserRecord | null {
      const now = options.now ?? new Date().toISOString()

      return db.transaction((tx) => {
        const updated = tx
          .update(usersTable)
          .set({ role, updatedAt: now })
          .where(eq(usersTable.id, id))
          .returning()
          .get()
        if (!updated) return null

        if (options.audit) {
          insertEventRow(
            tx,
            {
              ...options.audit,
              subjectId: id,
              payload: { ...options.audit.payload, userId: id },
              createdAt: now,
            },
            now,
          )
        }

        return toUserRecord(updated)
      })
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

  const agentJobRepository: AgentJobRepository = {
    create(input: CreateAgentJobInput, options: CreateAgentJobOptions = {}): AgentJobRecord {
      const now = options.now ?? new Date().toISOString()
      const row = {
        id: input.id ?? crypto.randomUUID(),
        projectId: input.projectId,
        scope: input.scope,
        tableId: input.tableId ?? null,
        status: 'queued' as const,
        attempts: 0,
        leaseExpiresAt: null,
        requestedBy: input.requestedBy,
        error: null,
        statsJson: JSON.stringify(input.stats ?? {}),
        createdAt: now,
        updatedAt: now,
      }

      return db.transaction((tx) => {
        tx.insert(agentJobsTable).values(row).run()
        if (options.audit) insertEventRow(tx, options.audit, now)
        return toAgentJobRecord(row)
      })
    },

    get(id: string): AgentJobRecord | null {
      const row = db.select().from(agentJobsTable).where(eq(agentJobsTable.id, id)).get()
      return row ? toAgentJobRecord(row) : null
    },

    listByProject(projectId: string): AgentJobRecord[] {
      return db
        .select()
        .from(agentJobsTable)
        .where(eq(agentJobsTable.projectId, projectId))
        .orderBy(asc(agentJobsTable.createdAt), asc(agentJobsTable.id))
        .all()
        .map(toAgentJobRecord)
    },

    claimNext(now: string, leaseExpiresAt: string): AgentJobRecord | null {
      return db.transaction((tx) => {
        const claimable = or(
          eq(agentJobsTable.status, 'queued'),
          and(
            eq(agentJobsTable.status, 'running'),
            sql`${agentJobsTable.leaseExpiresAt} is not null and ${agentJobsTable.leaseExpiresAt} < ${now}`,
          ),
        )

        const candidate = tx
          .select({ id: agentJobsTable.id })
          .from(agentJobsTable)
          .where(claimable)
          .orderBy(asc(agentJobsTable.createdAt), asc(agentJobsTable.id))
          .get()

        if (!candidate) return null

        const updated = tx
          .update(agentJobsTable)
          .set({
            status: 'running',
            leaseExpiresAt,
            attempts: sql`${agentJobsTable.attempts} + 1`,
            error: null,
            updatedAt: now,
          })
          .where(and(eq(agentJobsTable.id, candidate.id), claimable))
          .returning()
          .get()

        return updated ? toAgentJobRecord(updated) : null
      })
    },

    heartbeat(id: string, leaseExpiresAt: string, now: string): void {
      db.update(agentJobsTable)
        .set({ leaseExpiresAt, updatedAt: now })
        .where(and(eq(agentJobsTable.id, id), eq(agentJobsTable.status, 'running')))
        .run()
    },

    succeed(id: string, stats: Record<string, unknown>, now: string): AgentJobRecord | null {
      const updated = db
        .update(agentJobsTable)
        .set({
          status: 'succeeded',
          statsJson: JSON.stringify(stats),
          error: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(and(eq(agentJobsTable.id, id), eq(agentJobsTable.status, 'running')))
        .returning()
        .get()
      return updated ? toAgentJobRecord(updated) : null
    },

    fail(id: string, error: string, stats: Record<string, unknown>, now: string): AgentJobRecord | null {
      const updated = db
        .update(agentJobsTable)
        .set({
          status: 'failed',
          statsJson: JSON.stringify(stats),
          error,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(and(eq(agentJobsTable.id, id), eq(agentJobsTable.status, 'running')))
        .returning()
        .get()
      return updated ? toAgentJobRecord(updated) : null
    },
  }

  const suggestionRepository: SuggestionRepository = {
    replacePending(inputs: CreateAiSuggestionInput[], now: string): AiSuggestionRecord[] {
      if (inputs.length === 0) return []

      return db.transaction((tx) => {
        const created: AiSuggestionRecord[] = []

        for (const input of inputs) {
          tx.delete(aiSuggestionsTable)
            .where(
              and(
                eq(aiSuggestionsTable.itemType, input.itemType),
                eq(aiSuggestionsTable.itemId, input.itemId),
                eq(aiSuggestionsTable.status, 'pending'),
              ),
            )
            .run()

          const row = {
            id: crypto.randomUUID(),
            projectId: input.projectId,
            jobId: input.jobId,
            itemType: input.itemType,
            itemId: input.itemId,
            tableId: input.tableId ?? null,
            suggestedDescription: input.suggestedDescription,
            contextJson: JSON.stringify(input.context ?? {}),
            status: 'pending' as const,
            requestedBy: input.requestedBy,
            decidedBy: null,
            decidedAt: null,
            createdAt: now,
            updatedAt: now,
          }
          tx.insert(aiSuggestionsTable).values(row).run()
          created.push(toSuggestionRecord(row))
        }

        return created
      })
    },

    get(id: string): AiSuggestionRecord | null {
      const row = db.select().from(aiSuggestionsTable).where(eq(aiSuggestionsTable.id, id)).get()
      return row ? toSuggestionRecord(row) : null
    },

    list(projectId: string, status: AiSuggestionStatus = 'pending'): AiSuggestionRecord[] {
      return db
        .select()
        .from(aiSuggestionsTable)
        .where(and(eq(aiSuggestionsTable.projectId, projectId), eq(aiSuggestionsTable.status, status)))
        .orderBy(asc(aiSuggestionsTable.createdAt), asc(aiSuggestionsTable.id))
        .all()
        .map(toSuggestionRecord)
    },

    editPending(
      projectId: string,
      id: string,
      text: string,
      actorUserId: string,
      now: string,
      audit: DecisionAudit,
    ): AiSuggestionRecord | null {
      return db.transaction((tx) => {
        const updated = tx
          .update(aiSuggestionsTable)
          .set({ suggestedDescription: text, updatedAt: now })
          .where(
            and(
              eq(aiSuggestionsTable.id, id),
              eq(aiSuggestionsTable.projectId, projectId),
              eq(aiSuggestionsTable.status, 'pending'),
            ),
          )
          .returning()
          .get()

        if (!updated) return null

        insertEventRow(
          tx,
          {
            ...audit,
            actorUserId,
            payload: {
              ...audit.payload,
              suggestionId: updated.id,
              itemId: updated.itemId,
              itemType: updated.itemType,
            },
            createdAt: now,
          },
          now,
        )

        return toSuggestionRecord(updated)
      })
    },

    apply(
      projectId: string,
      ids: string[],
      actorUserId: string,
      now: string,
      audit: DecisionAudit,
    ): SuggestionDecisionResult {
      return db.transaction((tx) => {
        const decided: AiSuggestionRecord[] = []
        const skipped: string[] = []

        for (const id of ids) {
          const updated = tx
            .update(aiSuggestionsTable)
            .set({ status: 'applied', decidedBy: actorUserId, decidedAt: now, updatedAt: now })
            .where(
              and(
                eq(aiSuggestionsTable.id, id),
                eq(aiSuggestionsTable.projectId, projectId),
                eq(aiSuggestionsTable.status, 'pending'),
              ),
            )
            .returning()
            .get()

          if (!updated) {
            skipped.push(id)
            continue
          }

          if (updated.itemType === 'table') {
            tx.update(tablesTable)
              .set({
                description: updated.suggestedDescription,
                descriptionSource: 'agent',
                reviewed: false,
                reviewedBy: null,
                reviewedAt: null,
                updatedAt: now,
              })
              .where(eq(tablesTable.id, updated.itemId))
              .run()
          } else {
            tx.update(columnsTable)
              .set({
                description: updated.suggestedDescription,
                descriptionSource: 'agent',
                reviewed: false,
                reviewedBy: null,
                reviewedAt: null,
                updatedAt: now,
              })
              .where(eq(columnsTable.id, updated.itemId))
              .run()
          }

          decided.push(toSuggestionRecord(updated))
        }

        if (decided.length > 0) {
          insertEventRow(
            tx,
            {
              ...audit,
              actorUserId,
              payload: {
                ...audit.payload,
                suggestionIds: decided.map((suggestion) => suggestion.id),
                itemIds: decided.map((suggestion) => suggestion.itemId),
              },
              createdAt: now,
            },
            now,
          )
        }

        return { decided, skipped }
      })
    },

    reject(
      projectId: string,
      ids: string[],
      actorUserId: string,
      now: string,
      audit: DecisionAudit,
    ): SuggestionDecisionResult {
      return db.transaction((tx) => {
        const decided: AiSuggestionRecord[] = []
        const skipped: string[] = []

        for (const id of ids) {
          const updated = tx
            .update(aiSuggestionsTable)
            .set({ status: 'rejected', decidedBy: actorUserId, decidedAt: now, updatedAt: now })
            .where(
              and(
                eq(aiSuggestionsTable.id, id),
                eq(aiSuggestionsTable.projectId, projectId),
                eq(aiSuggestionsTable.status, 'pending'),
              ),
            )
            .returning()
            .get()

          if (!updated) {
            skipped.push(id)
            continue
          }

          decided.push(toSuggestionRecord(updated))
        }

        if (decided.length > 0) {
          insertEventRow(
            tx,
            {
              ...audit,
              actorUserId,
              payload: {
                ...audit.payload,
                suggestionIds: decided.map((suggestion) => suggestion.id),
                itemIds: decided.map((suggestion) => suggestion.itemId),
              },
              createdAt: now,
            },
            now,
          )
        }

        return { decided, skipped }
      })
    },
  }

  const eventRepository: EventRepository = {
    insert(input: InsertEventInput): EventRecord {
      return db.transaction((tx) => insertEventRow(tx, input, new Date().toISOString()))
    },

    list(projectId: string): EventRecord[] {
      return db
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.projectId, projectId))
        .orderBy(asc(eventsTable.createdAt), asc(eventsTable.id))
        .all()
        .map(toEventRecord)
    },

    listAll(): EventRecord[] {
      return db
        .select()
        .from(eventsTable)
        .orderBy(asc(eventsTable.createdAt), asc(eventsTable.id))
        .all()
        .map(toEventRecord)
    },

    listEvents(filters: EventListFilters = {}): EventWithActor[] {
      const conditions = []
      if (filters.action) conditions.push(like(eventsTable.action, `${filters.action}%`))
      if (filters.projectId) conditions.push(eq(eventsTable.projectId, filters.projectId))

      const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500)

      const rows = db
        .select({
          id: eventsTable.id,
          projectId: eventsTable.projectId,
          actorUserId: eventsTable.actorUserId,
          action: eventsTable.action,
          subjectType: eventsTable.subjectType,
          subjectId: eventsTable.subjectId,
          payloadJson: eventsTable.payloadJson,
          createdAt: eventsTable.createdAt,
          actorEmail: usersTable.email,
        })
        .from(eventsTable)
        .leftJoin(usersTable, eq(eventsTable.actorUserId, usersTable.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(eventsTable.createdAt), desc(sql`events.rowid`))
        .limit(limit)
        .all()

      return rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        actorUserId: row.actorUserId,
        actorEmail: row.actorEmail,
        action: row.action,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        payload: parseJsonObject(row.payloadJson),
        createdAt: row.createdAt,
      }))
    },
  }

  const agentRepositories: AgentRepositories = {
    jobs: agentJobRepository,
    suggestions: suggestionRepository,
    events: eventRepository,
  }

  return {
    projects: projectRepository,
    users: userRepository,
    apiKeys: apiKeyRepository,
    loginAttempts: loginAttemptRepository,
    agent: agentRepositories,
    close(): void {
      sqlite.close()
    },
  }
}
