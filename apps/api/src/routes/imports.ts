import type { Hono } from 'hono'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import type { Persistence } from '../persistence/ports'
import { databaseFromAggregate, projectView } from '../services/model-mapper'
import { applyImportPlan, buildImportPlan, emptyRenameMapping, type ImportPlan } from '../services/model-import'
import type { AppEnv } from '../types'
import { applyImportSchema, parseJsonBody, sqlImportSchema } from '../validation'

function parsePlanSnapshot(snapshot: string): ImportPlan | null {
  try {
    return JSON.parse(snapshot) as ImportPlan
  } catch {
    return null
  }
}

export function registerImportRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const repository = persistence.projects
  const requireMember = requireRole('MEMBER')

  app.post('/api/projects/:id/imports/preview', requireMember, async (c) => {
    const aggregate = repository.get(c.req.param('id'))
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const body = await parseJsonBody(c, sqlImportSchema)
    const { plan } = buildImportPlan(databaseFromAggregate(aggregate), body.sql, body.renames ?? emptyRenameMapping())

    return c.json({ plan })
  })

  app.post('/api/projects/:id/imports/apply', requireMember, async (c) => {
    const id = c.req.param('id')
    const aggregate = repository.get(id)
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const body = await parseJsonBody(c, applyImportSchema)
    const { database, plan } = applyImportPlan(
      databaseFromAggregate(aggregate),
      body.sql,
      body.renames ?? emptyRenameMapping(),
      body.plan,
    )

    const applied = repository.applyModel(
      id,
      database,
      {
        sqlHash: plan.sqlHash,
        planSnapshot: JSON.stringify(plan),
      },
      {
        actorUserId: c.get('user').sub,
        audit: {
          actorUserId: c.get('user').sub,
          action: 'model.import_applied',
          subjectType: 'project',
          subjectId: id,
          payload: {
            sqlHash: plan.sqlHash,
            tables: {
              added: plan.tables.added.length,
              removed: plan.tables.removed.length,
              renamed: plan.tables.renamed.length,
            },
            columns: {
              added: plan.columns.added.length,
              removed: plan.columns.removed.length,
              renamed: plan.columns.renamed.length,
              changed: plan.columns.changed.length,
            },
          },
        },
      },
    )
    if (!applied) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    return c.json({
      project: projectView(applied.model),
      plan,
      run: applied.run,
    })
  })

  app.get('/api/projects/:id/imports', (c) => {
    const aggregate = repository.get(c.req.param('id'))
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const runs = repository.listImportRuns(aggregate.project.id).map((run) => ({
      id: run.id,
      projectId: run.projectId,
      sqlHash: run.sqlHash,
      plan: parsePlanSnapshot(run.planSnapshot),
      createdAt: run.createdAt,
    }))

    return c.json({ runs })
  })
}
