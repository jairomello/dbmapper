import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FORBIDDEN_INPUT_KEYS,
  TOOL_CATALOG,
  type ToolDefinition,
} from '../apps/mcp/src/catalog'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const DOCS_PATH = join(projectRoot, 'docs/TOOLS-DBMAPPER.md')
const EXAMPLE_PATH = join(projectRoot, 'opencode.json.example')
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE'])
const ALLOWED_PROPERTY_TYPES = new Set(['string', 'integer', 'boolean'])
const LITERAL_KEY = /dbmp_[0-9a-f]{16,}/

export interface CatalogValidationInput {
  catalog: readonly ToolDefinition[]
  docs: string | null
  example: string | null
}

export interface CatalogValidationResult {
  ok: boolean
  violations: string[]
  warnings: string[]
}

function documentedTools(docs: string): string[] {
  return docs
    .split('\n')
    .filter((line) => /^#{2,}\s+/.test(line))
    .map((line) => line.replace(/^#{2,}\s+/, ''))
}

function validateSchema(tool: ToolDefinition, violations: string[]): void {
  const schema = tool.inputSchema
  if (schema?.type !== 'object') {
    violations.push(`${tool.name}: inputSchema deve ser um objeto JSON Schema`)
    return
  }
  if (!schema.properties || typeof schema.properties !== 'object') {
    violations.push(`${tool.name}: inputSchema.properties ausente`)
    return
  }
  if (typeof schema.additionalProperties !== 'boolean') {
    violations.push(`${tool.name}: inputSchema.additionalProperties deve ser booleano`)
  }

  const required = schema.required ?? []
  if (!Array.isArray(required)) {
    violations.push(`${tool.name}: inputSchema.required deve ser uma lista`)
  } else {
    for (const field of required) {
      if (typeof field !== 'string' || !(field in schema.properties)) {
        violations.push(`${tool.name}: required "${String(field)}" não existe em properties`)
      }
    }
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    if ((FORBIDDEN_INPUT_KEYS as readonly string[]).includes(key)) {
      violations.push(`${tool.name}: aceita argumento de identidade proibido "${key}"`)
    }
    if (!property || !ALLOWED_PROPERTY_TYPES.has(property.type)) {
      violations.push(`${tool.name}: propriedade "${key}" tem tipo inválido`)
      continue
    }
    if (property.type === 'string' && property.enum) {
      for (const value of property.enum) {
        if (typeof value !== 'string' || value.length === 0) {
          violations.push(`${tool.name}: enum de "${key}" contém valor inválido`)
        }
      }
    }
  }
}

export function validateCatalog(input: CatalogValidationInput): CatalogValidationResult {
  const violations: string[] = []
  const warnings: string[] = []
  const { catalog, docs, example } = input

  if (catalog.length === 0) {
    violations.push('catálogo vazio: nenhuma tool registrada')
  }

  const seen = new Set<string>()
  for (const tool of catalog) {
    if (seen.has(tool.name)) {
      violations.push(`${tool.name}: tool duplicada no catálogo`)
    }
    seen.add(tool.name)

    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
      violations.push(`${tool.name}: nome de tool inválido`)
    }
    if (!tool.description || tool.description.trim().length === 0) {
      violations.push(`${tool.name}: descrição ausente`)
    }
    if (!tool.dispatch || !ALLOWED_METHODS.has(tool.dispatch.method)) {
      violations.push(`${tool.name}: dispatcher ausente ou método inválido`)
    } else if (
      typeof tool.dispatch.path !== 'string' ||
      !tool.dispatch.path.startsWith('/api/')
    ) {
      violations.push(`${tool.name}: dispatcher sem path /api/`)
    }

    validateSchema(tool, violations)
  }

  if (docs === null) {
    warnings.push('docs/TOOLS-DBMAPPER.md ainda não existe: verificação de âncoras ignorada')
  } else {
    const documented = documentedTools(docs)
    for (const tool of catalog) {
      const found = documented.some((heading) => heading.includes(tool.name))
      if (!found) violations.push(`${tool.name}: sem âncora "## ${tool.name}" em docs/TOOLS-DBMAPPER.md`)
    }
  }

  if (example === null) {
    warnings.push('opencode.json.example ainda não existe: verificação de segredo literal ignorada')
  } else if (LITERAL_KEY.test(example)) {
    violations.push('opencode.json.example contém uma chave literal dbmp_ (use {env:DBMAPPER_API_KEY})')
  }

  return { ok: violations.length === 0, violations, warnings }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function main(): Promise<void> {
  const result = validateCatalog({
    catalog: TOOL_CATALOG,
    docs: await readOptional(DOCS_PATH),
    example: await readOptional(EXAMPLE_PATH),
  })

  for (const warning of result.warnings) console.warn(`aviso: ${warning}`)

  if (!result.ok) {
    console.error('Catálogo MCP inválido:')
    for (const violation of result.violations) console.error(`  ${violation}`)
    process.exit(1)
  }

  console.log(`MCP catalog ok: ${TOOL_CATALOG.length} tools documentadas e roteadas.`)
}

if (import.meta.main) {
  await main()
}
