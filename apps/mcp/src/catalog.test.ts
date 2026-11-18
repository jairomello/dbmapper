import { describe, expect, test } from 'bun:test'
import {
  FORBIDDEN_INPUT_KEYS,
  TOOL_CATALOG,
  TOOL_NAMES,
  findTool,
  validateToolArguments,
} from './catalog'

describe('catálogo MCP', () => {
  test('registra exatamente as nove tools esperadas', () => {
    expect(TOOL_CATALOG).toHaveLength(9)
    expect(TOOL_CATALOG.map((tool) => tool.name)).toEqual([...TOOL_NAMES])
  })

  test('cada tool tem descrição, âncora de documentação, dispatch e schema de objeto', () => {
    for (const tool of TOOL_CATALOG) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.docSection).toBe(tool.name)
      expect(tool.dispatch.method).toBeTruthy()
      expect(tool.dispatch.path.startsWith('/api/')).toBe(true)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.additionalProperties).toBe(false)
      for (const required of tool.inputSchema.required ?? []) {
        expect(tool.inputSchema.properties[required]).toBeDefined()
      }
    }
  })

  test('nenhum schema declara chave de identidade', () => {
    for (const tool of TOOL_CATALOG) {
      for (const key of FORBIDDEN_INPUT_KEYS) {
        expect(tool.inputSchema.properties[key]).toBeUndefined()
      }
    }
  })

  test('validação local rejeita identidade, campo obrigatório e enum inválido', () => {
    const setDescription = findTool('set_description')!
    const identity = validateToolArguments(setDescription.inputSchema, {
      itemType: 'column',
      itemId: 'c1',
      description: 'x',
      actorUserId: 'outro',
    })
    expect(identity.ok).toBe(false)

    const missing = validateToolArguments(setDescription.inputSchema, {
      itemType: 'column',
      description: 'x',
    })
    expect(missing.ok).toBe(false)

    const invalidEnum = validateToolArguments(setDescription.inputSchema, {
      itemType: 'index',
      itemId: 'c1',
      description: 'x',
    })
    expect(invalidEnum.ok).toBe(false)

    const valid = validateToolArguments(setDescription.inputSchema, {
      itemType: 'column',
      itemId: 'c1',
      description: 'x',
    })
    expect(valid).toEqual({
      ok: true,
      args: { itemType: 'column', itemId: 'c1', description: 'x' },
    })
  })

  test('validação local rejeita argumento desconhecido', () => {
    const tool = findTool('get_table')!
    const result = validateToolArguments(tool.inputSchema, { table: 'cliente', extra: true })
    expect(result.ok).toBe(false)
  })
})
