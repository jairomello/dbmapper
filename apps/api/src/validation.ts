import type { Context } from 'hono'
import { z } from 'zod'
import { ApiError } from './errors'

export const reviewStatusSchema = z.enum(['NEW', 'UNCHANGED', 'REMOVED', 'RENAMED', 'CHANGED'])

const relationshipInputSchema = z
  .object({
    table: z.string().trim().min(1),
    local_columns: z.array(z.string()).default([]),
    referenced_columns: z.array(z.string()).default([]),
    constraint_name: z.string().default(''),
    description: z.string().default(''),
    reviewed: z.boolean().default(false),
  })
  .strict()

const columnInputSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.string().trim().min(1),
    primary_key: z.boolean().default(false),
    foreign_key: z.boolean().default(false),
    description: z.string().default(''),
    business_terms: z.array(z.string()).default([]),
    reviewed: z.boolean().default(false),
    status: reviewStatusSchema.default('UNCHANGED'),
  })
  .strict()

const relationshipsInputSchema = z
  .object({
    parents: z.array(relationshipInputSchema).default([]),
    children: z.array(relationshipInputSchema).default([]),
  })
  .strict()

const tableInputSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().default(''),
    business_terms: z.array(z.string()).default([]),
    reviewed: z.boolean().default(false),
    status: reviewStatusSchema.default('UNCHANGED'),
    relationships: relationshipsInputSchema.default({ parents: [], children: [] }),
    columns: z.array(columnInputSchema).default([]),
  })
  .strict()

const databaseInputSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().default(''),
    business_terms: z.array(z.string()).default([]),
    reviewed: z.boolean().default(false),
    tables: z.array(tableInputSchema).default([]),
  })
  .strict()

export const projectDocumentSchema = z
  .object({
    database: databaseInputSchema,
  })
  .strict()

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20000).default(''),
  })
  .strict()

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
