import { describe, expect, test } from 'bun:test'
import { TOOL_CATALOG, type ToolDefinition } from '../apps/mcp/src/catalog'
import { validateCatalog } from './check-mcp-catalog'

function healthyDocs(): string {
  return TOOL_CATALOG.map((tool) => `## ${tool.name}\n\nDescrição.\n`).join('\n')
}

function cloneCatalog(): ToolDefinition[] {
  return structuredClone(TOOL_CATALOG) as ToolDefinition[]
}

describe('guarda do catálogo MCP', () => {
  test('árvore saudável passa', () => {
    const result = validateCatalog({
      catalog: TOOL_CATALOG,
      docs: healthyDocs(),
      example: '{"mcp": {"environment": {"DBMAPPER_API_KEY": "{env:DBMAPPER_API_KEY}"}}}',
    })
    expect(result).toEqual({ ok: true, violations: [], warnings: [] })
  })

  test('tool sem documentação falha nomeando o ofensor', () => {
    const docs = healthyDocs().replace(/## get_table[\s\S]*?(?=\n## |$)/, '')
    const result = validateCatalog({ catalog: TOOL_CATALOG, docs, example: '{}' })

    expect(result.ok).toBe(false)
    expect(result.violations.some((violation) => violation.startsWith('get_table:'))).toBe(true)
  })

  test('tool sem dispatcher falha', () => {
    const catalog = cloneCatalog()
    delete (catalog[0] as { dispatch?: unknown }).dispatch
    const result = validateCatalog({ catalog, docs: healthyDocs(), example: '{}' })

    expect(result.ok).toBe(false)
    expect(result.violations.some((violation) => violation.includes('dispatcher'))).toBe(true)
  })

  test('schema inválido falha', () => {
    const catalog = cloneCatalog()
    catalog[0].inputSchema.type = 'array' as never
    const result = validateCatalog({ catalog, docs: healthyDocs(), example: '{}' })

    expect(result.ok).toBe(false)
    expect(result.violations.some((violation) => violation.includes('inputSchema'))).toBe(true)
  })

  test('argumento de identidade falha', () => {
    const catalog = cloneCatalog()
    catalog[1].inputSchema.properties.actorUserId = { type: 'string' }
    const result = validateCatalog({ catalog, docs: healthyDocs(), example: '{}' })

    expect(result.ok).toBe(false)
    expect(
      result.violations.some((violation) => violation.includes('actorUserId')),
    ).toBe(true)
  })

  test('chave literal no exemplo falha', () => {
    const result = validateCatalog({
      catalog: TOOL_CATALOG,
      docs: healthyDocs(),
      example: '{"DBMAPPER_API_KEY": "dbmp_0123456789abcdef0123456789abcdef01234567"}',
    })

    expect(result.ok).toBe(false)
    expect(result.violations.some((violation) => violation.includes('chave literal'))).toBe(true)
  })

  test('artefatos ausentes na árvore atual viram aviso, não falha', () => {
    const result = validateCatalog({ catalog: TOOL_CATALOG, docs: null, example: null })

    expect(result.ok).toBe(true)
    expect(result.warnings).toHaveLength(2)
  })
})
