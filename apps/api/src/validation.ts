import type { Context } from 'hono'
import { z } from 'zod'
import { ApiError } from './errors'

export const reviewStatusSchema = z.enum(['NEW', 'UNCHANGED', 'REMOVED', 'RENAMED', 'CHANGED'])

/**
 * Legacy DBMapper 1.0 exports are looser than the v2 model: v1 omitted some
 * fields (its importer backfilled them) and may carry fields v2 does not model.
 * The document schema therefore strips unknown keys and falls back to the same
 * defaults as `handleJSONUpload` in `legacy/app.js`. Only a missing `database`
 * object is treated as a structural rejection.
 */
const tolerantDescription = z.string().default('').catch('')
const tolerantBoolean = z.boolean().default(false).catch(false)
const tolerantStringArray = z.array(z.string()).default([]).catch([])
const tolerantStatus = reviewStatusSchema.catch('UNCHANGED')
const tolerantArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((value) => (Array.isArray(value) ? value : []), z.array(item))

const relationshipInputSchema = z.object({
  table: z.string().trim().min(1),
  local_columns: tolerantStringArray,
  referenced_columns: tolerantStringArray,
  constraint_name: tolerantDescription,
  description: tolerantDescription,
  reviewed: tolerantBoolean,
})

const columnInputSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1).default('unknown').catch('unknown'),
  primary_key: tolerantBoolean,
  foreign_key: tolerantBoolean,
  description: tolerantDescription,
  business_terms: tolerantStringArray,
  reviewed: tolerantBoolean,
  status: tolerantStatus,
})

const relationshipsInputSchema = z.object({
  parents: tolerantArray(relationshipInputSchema),
  children: tolerantArray(relationshipInputSchema),
})

const tableInputSchema = z.object({
  name: z.string().trim().min(1),
  description: tolerantDescription,
  business_terms: tolerantStringArray,
  reviewed: tolerantBoolean,
  status: tolerantStatus,
  relationships: relationshipsInputSchema.default({ parents: [], children: [] }).catch({ parents: [], children: [] }),
  columns: tolerantArray(columnInputSchema),
})

const databaseInputSchema = z.object({
  name: z.string().trim().min(1).default('Projeto importado').catch('Projeto importado'),
  description: tolerantDescription,
  business_terms: tolerantStringArray,
  reviewed: tolerantBoolean,
  tables: tolerantArray(tableInputSchema),
})

export const projectDocumentSchema = z.object({
  database: databaseInputSchema,
})

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20000).default(''),
  })
  .strict()

const diagramPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict()

export const diagramLayoutSchema = z
  .object({
    positions: z.record(z.string().trim().min(1).max(200), diagramPositionSchema).default({}),
    viewport: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
      })
      .strict()
      .default({ x: 0, y: 0 }),
    zoom: z.number().finite().positive().max(10).default(1),
  })
  .strict()

const diagramZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    tabOrder: z.number().int().min(0).default(0),
    members: z.array(z.string().trim().min(1).max(200)).default([]),
  })
  .strict()

const diagramDocumentLayoutSchema = z
  .object({
    zoneName: z.string().trim().min(1).max(200),
    positions: z.record(z.string().trim().min(1).max(200), diagramPositionSchema).default({}),
    viewport: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
      })
      .strict()
      .default({ x: 0, y: 0 }),
    zoom: z.number().finite().positive().max(10).default(1),
  })
  .strict()

export function createDiagramRequestSchema(knownMembers: Iterable<string>) {
  const known = new Set(knownMembers)

  const documentSchema = z
    .object({
      zones: z.array(diagramZoneSchema).optional(),
      layouts: z.array(diagramDocumentLayoutSchema),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (!value.zones) return

      const zoneNames = new Map<string, number>()
      const memberOwners = new Map<string, string>()

      value.zones.forEach((zone, zoneIndex) => {
        if (zoneNames.has(zone.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['zones', zoneIndex, 'name'],
            message: `Nome de zona duplicado: ${zone.name}.`,
          })
        } else {
          zoneNames.set(zone.name, zoneIndex)
        }

        zone.members.forEach((member, memberIndex) => {
          if (!known.has(member)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['zones', zoneIndex, 'members', memberIndex],
              message: `Tabela desconhecida na zona ${zone.name}: ${member}.`,
            })
            return
          }

          const owner = memberOwners.get(member)
          if (owner !== undefined && owner !== zone.name) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['zones', zoneIndex, 'members', memberIndex],
              message: `Tabela ${member} já pertence à zona ${owner}.`,
            })
            return
          }

          memberOwners.set(member, zone.name)
        })
      })
    })

  return z.union([documentSchema, diagramLayoutSchema])
}

export const tableRenameSchema = z
  .object({
    from: z.string().trim().min(1),
    to: z.string().trim().min(1),
  })
  .strict()

export const columnRenameSchema = z
  .object({
    table: z.string().trim().min(1),
    from: z.string().trim().min(1),
    to: z.string().trim().min(1),
  })
  .strict()

export const renameMappingSchema = z
  .object({
    tables: z.array(tableRenameSchema).default([]),
    columns: z.array(columnRenameSchema).default([]),
  })
  .strict()

export const sqlImportSchema = z
  .object({
    sql: z.string().min(1),
    renames: renameMappingSchema.optional(),
  })
  .strict()

const relationshipChangeSchema = z
  .object({
    table: z.string(),
    target: z.string(),
    local_columns: z.array(z.string()),
    referenced_columns: z.array(z.string()),
    constraint_name: z.string(),
  })
  .strict()

export const importPlanSchema = z
  .object({
    planHash: z.string(),
    baseModelHash: z.string(),
    sqlHash: z.string(),
    tables: z
      .object({
        kept: z.array(z.string()),
        added: z.array(z.string()),
        removed: z.array(z.string()),
        renamed: z.array(z.object({ from: z.string(), to: z.string() }).strict()),
      })
      .strict(),
    columns: z
      .object({
        kept: z.array(z.object({ table: z.string(), name: z.string() }).strict()),
        added: z.array(z.object({ table: z.string(), name: z.string(), type: z.string() }).strict()),
        removed: z.array(z.object({ table: z.string(), name: z.string() }).strict()),
        renamed: z.array(z.object({ table: z.string(), from: z.string(), to: z.string() }).strict()),
        changed: z.array(
          z.object({ table: z.string(), name: z.string(), from: z.string(), to: z.string() }).strict(),
        ),
      })
      .strict(),
    relationships: z
      .object({
        kept: z.array(relationshipChangeSchema),
        added: z.array(relationshipChangeSchema),
        removed: z.array(relationshipChangeSchema),
      })
      .strict(),
  })
  .strict()

export const applyImportSchema = z
  .object({
    sql: z.string().min(1),
    renames: renameMappingSchema.optional(),
    plan: importPlanSchema,
  })
  .strict()

export const ddlDialectSchema = z.enum(['postgres', 'mysql'])
export const ddlModeSchema = z.enum(['create', 'migration'])

export const ddlQuerySchema = z.object({
  dialect: ddlDialectSchema.default('postgres'),
  mode: ddlModeSchema.default('create'),
  renames: z.string().optional(),
})

const ddlRenameNameSchema = z.string().trim().min(1).max(200)

export const ddlRenamesSchema = z
  .object({
    tables: z.record(z.string().trim().min(1).max(200), ddlRenameNameSchema).optional(),
    columns: z.record(z.string().trim().min(1).max(500), ddlRenameNameSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value.columns ?? {})) {
      if (!key.includes('.')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['columns', key],
          message: 'A chave de renomeação de coluna deve ser "tabela.coluna".',
        })
      }
    }
  })

export const agentGenerateSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('project') }).strict(),
  z
    .object({
      scope: z.literal('table'),
      tableId: z.string().trim().min(1),
    })
    .strict(),
])

export const agentSuggestionIdsSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1).max(200),
  })
  .strict()

export const agentEditSuggestionSchema = z
  .object({
    text: z.string().trim().min(1).max(20000),
  })
  .strict()

export const aiSuggestionStatusSchema = z.enum(['pending', 'applied', 'rejected'])

export const descriptionItemTypes = ['table', 'column', 'relationship'] as const

export const itemDescriptionSchema = z.object({
  description: z.string().max(20000),
})

export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    projectScope: z.string().trim().min(1).max(200).nullish(),
    expiresAt: z.string().datetime({ offset: true }).nullish(),
  })
  .strict()

export async function parseJsonBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'O corpo da requisição não é um JSON válido.')
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const details = {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    }
    throw new ApiError(400, 'VALIDATION_ERROR', 'O payload da requisição é inválido.', { details })
  }

  return parsed.data as z.output<S>
}
