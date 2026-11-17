import { describe, expect, test } from 'bun:test'
import { parseSuggestions } from './parser'

const allowed = new Set(['pedido', 'total', 'cliente_id'])

describe('parser de sugestões do agente', () => {
  test('aceita JSON válido com múltiplas sugestões', () => {
    const parsed = parseSuggestions(
      JSON.stringify({
        suggestions: [
          { item: 'pedido', description: 'Pedidos de venda.' },
          { item: 'total', description: 'Valor total do pedido.' },
        ],
      }),
      allowed,
    )

    expect(parsed.suggestions).toEqual([
      { item: 'pedido', description: 'Pedidos de venda.' },
      { item: 'total', description: 'Valor total do pedido.' },
    ])
    expect(parsed.skipped).toBe(0)
  })

  test('remove cercas de código e texto ao redor do objeto JSON', () => {
    const raw = 'Segue a resposta:\n```json\n{"suggestions":[{"item":"total","description":"Total."}]}\n```\nFim.'
    const parsed = parseSuggestions(raw, allowed)

    expect(parsed.suggestions).toEqual([{ item: 'total', description: 'Total.' }])
  })

  test('resposta malformada produz zero sugestões sem lançar erro', () => {
    const parsed = parseSuggestions('{suggestions: [', allowed)
    expect(parsed.suggestions).toEqual([])
    expect(parsed.skipped).toBe(0)
  })

  test('resposta vazia produz zero sugestões', () => {
    expect(parseSuggestions('', allowed)).toEqual({ suggestions: [], skipped: 0 })
  })

  test('descarta itens desconhecidos, inválidos e duplicados contabilizando skipped', () => {
    const raw = JSON.stringify({
      suggestions: [
        { item: 'total', description: 'Total do pedido.' },
        { item: 'total', description: 'Duplicado.' },
        { item: 'inexistente', description: 'Não existe.' },
        { item: 'pedido', description: '' },
        { description: 'Sem item.' },
        { item: 'pedido', description: 'Pedidos de venda.' },
      ],
    })

    const parsed = parseSuggestions(raw, allowed)

    expect(parsed.suggestions).toEqual([
      { item: 'total', description: 'Total do pedido.' },
      { item: 'pedido', description: 'Pedidos de venda.' },
    ])
    expect(parsed.skipped).toBe(4)
  })

  test('ignora JSON que não contenha o array suggestions', () => {
    const parsed = parseSuggestions(JSON.stringify({ answer: 'nada' }), allowed)
    expect(parsed.suggestions).toEqual([])
  })
})
