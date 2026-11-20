import { describe, expect, test } from 'bun:test'
import { Position } from '@xyflow/react'
import { manyFoot, oneTick, outward } from './crowfoot'

describe('outward', () => {
  test('aponta para fora da tabela em cada lado', () => {
    expect(outward(Position.Left)).toEqual({ x: -1, y: 0 })
    expect(outward(Position.Right)).toEqual({ x: 1, y: 0 })
    expect(outward(Position.Top)).toEqual({ x: 0, y: -1 })
    expect(outward(Position.Bottom)).toEqual({ x: 0, y: 1 })
    expect(outward(undefined)).toEqual({ x: 0, y: 0 })
  })
})

describe('manyFoot', () => {
  test('desenha as três hastes ancoradas na coluna, não na origem do SVG', () => {
    expect(manyFoot(100, 200, { x: 1, y: 0 })).toBe('M 116 200 L 100 207 M 116 200 L 100 200 M 116 200 L 100 193')
  })

  test('hastes verticais quando a coluna está no topo/rodapé', () => {
    expect(manyFoot(100, 200, { x: 0, y: 1 })).toBe('M 100 216 L 93 200 M 100 216 L 100 200 M 100 216 L 107 200')
  })

  test('não produz coordenadas próximas da origem para colunas distantes', () => {
    const path = manyFoot(640, 480, { x: 1, y: 0 })
    const coords = path.match(/-?\d+(\.\d+)?/g) ?? []
    expect(coords.some((value) => Number(value) === 0)).toBe(false)
  })
})

describe('oneTick', () => {
  test('desenha o traço do lado "um" afastado da coluna', () => {
    expect(oneTick(100, 200, { x: 1, y: 0 })).toBe('M 115 207 L 115 193')
  })

  test('traço vertical quando a coluna está à esquerda', () => {
    expect(oneTick(100, 200, { x: -1, y: 0 })).toBe('M 85 193 L 85 207')
  })
})
