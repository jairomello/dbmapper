import type { Hono } from 'hono'
import {
  generateCreateScript,
  generateMigrationScript,
  type DdlRenameMapping,
  type DdlGenerationResult,
} from '@dbmapper/ddl'
import { ApiError } from '../errors'
import { requireRole } from '../middleware/session'
import type { Persistence } from '../persistence/ports'
import { databaseFromAggregate } from '../services/model-mapper'
import type { AppEnv } from '../types'
import { ddlQuerySchema, ddlRenamesSchema } from '../validation'

const DDL_RENAMES_LIMIT = 200

function invalidRenames(message: string): ApiError {
  return new ApiError(400, 'DDL_INVALID_RENAMES', message)
}

function parseRenames(raw: string | undefined): DdlRenameMapping | undefined {
  if (raw === undefined || raw.trim() === '') return undefined

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidRenames('O parâmetro "renames" não é um JSON válido.')
  }

  const parsed = ddlRenamesSchema.safeParse(json)
  if (!parsed.success) {
    throw invalidRenames(
      'O parâmetro "renames" deve mapear nomes de tabelas e "tabela.coluna" para o novo nome.',
    )
  }

  const tables = parsed.data.tables ?? {}
  const columns = parsed.data.columns ?? {}
  const total = Object.keys(tables).length + Object.keys(columns).length
  if (total > DDL_RENAMES_LIMIT) {
    throw invalidRenames(`O limite de ${DDL_RENAMES_LIMIT} renomeações por requisição foi excedido.`)
  }

  return { tables, columns }
}

function scriptText(result: DdlGenerationResult): string {
  if (result.statements.length === 0) return ''
  return `${result.statements.join(';\n')};`
}

export function registerDdlRoutes(app: Hono<AppEnv>, persistence: Persistence): void {
  const repository = persistence.projects
  const requireMember = requireRole('MEMBER')

  app.get('/api/projects/:id/ddl', (c) => {
    const id = c.req.param('id')
    const aggregate = repository.get(id)
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const query = ddlQuerySchema.safeParse(c.req.query())
    if (!query.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Os parâmetros da requisição são inválidos.', {
        details: {
          issues: query.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
      })
    }

    const { dialect, mode } = query.data
    const renames = parseRenames(query.data.renames)
    const model = databaseFromAggregate(aggregate)

    let result: DdlGenerationResult
    if (mode === 'migration') {
      const baseline = repository.readDdlBaseline(id)
      if (!baseline) {
        throw new ApiError(
          409,
          'DDL_BASELINE_MISSING',
          'Este projeto ainda não tem baseline capturado. Use o modo "create" ou marque o banco como sincronizado.',
        )
      }
      result = generateMigrationScript(baseline.database, model, { dialect, renames })
    } else {
      result = generateCreateScript(model, { dialect, renames })
    }

    return c.json({
      dialect,
      mode,
      script: scriptText(result),
      statements: result.statements,
      destructive: result.destructive,
      warnings: result.warnings,
    })
  })

  app.get('/api/projects/:id/ddl/baseline', (c) => {
    const id = c.req.param('id')
    const aggregate = repository.get(id)
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const baseline = repository.readDdlBaseline(id)
    if (!baseline) return c.json({ baseline: null })

    return c.json({
      baseline: {
        projectId: baseline.projectId,
        capturedAt: baseline.capturedAt,
        capturedBy: baseline.capturedBy,
        database: baseline.database,
      },
    })
  })

  app.put('/api/projects/:id/ddl/baseline', requireMember, (c) => {
    const id = c.req.param('id')
    const aggregate = repository.get(id)
    if (!aggregate) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    const model = databaseFromAggregate(aggregate)
    const actorUserId = c.get('user').sub
    const saved = repository.saveDdlBaseline({
      projectId: id,
      database: model,
      actorUserId,
      audit: {
        actorUserId,
        action: 'ddl.baseline_captured',
        subjectType: 'project',
        subjectId: id,
        payload: {
          tables: model.tables.length,
          columns: model.tables.reduce((total, table) => total + table.columns.length, 0),
          source: 'manual',
        },
      },
    })
    if (!saved) throw new ApiError(404, 'NOT_FOUND', 'Projeto não encontrado.')

    return c.json({
      baseline: {
        projectId: saved.projectId,
        capturedAt: saved.capturedAt,
        capturedBy: saved.capturedBy,
      },
    })
  })
}
