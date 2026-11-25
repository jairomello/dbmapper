import { describe, expect, test } from 'bun:test'
import type { DiagramZone } from '../api/types'
import { sampleDatabase } from '../test/fixtures'
import {
  addMemberToZone,
  normalizeZoneState,
  removeMemberFromZone,
  returnMembersToPrincipal,
  zonesOfTable,
} from './zones'

function zones(): DiagramZone[] {
  return [
    { name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] },
    { name: 'Geografia', tabOrder: 1, members: ['pedido'] },
  ]
}

describe('zones', () => {
  test('normaliza sem remover a mesma tabela de outra zona', () => {
    const state = normalizeZoneState(
      {
        projectId: 'projeto-1',
        zones: zones(),
        layouts: [],
      },
      sampleDatabase(),
    )

    expect(state.zones.find((zone) => zone.name === 'Principal')?.members).toContain('pedido')
    expect(state.zones.find((zone) => zone.name === 'Geografia')?.members).toEqual(['pedido'])
  })

  test('adiciona a uma zona mantendo as demais associações', () => {
    const next = addMemberToZone(zones(), 'cliente', 'Geografia')
    expect(zonesOfTable(next, 'cliente')).toEqual(['Principal', 'Geografia'])
  })

  test('remove apenas da zona alvo', () => {
    const next = removeMemberFromZone(zones(), 'pedido', 'Principal')
    expect(zonesOfTable(next, 'pedido')).toEqual(['Geografia'])
  })

  test('excluir a zona devolve à Principal só quem não está em outra', () => {
    const shared = [
      { name: 'Principal', tabOrder: 0, members: ['cliente'] },
      { name: 'Vendas', tabOrder: 1, members: ['pedido'] },
      { name: 'Relatórios', tabOrder: 2, members: ['pedido'] },
    ]

    const next = returnMembersToPrincipal(shared, 'Vendas')
    expect(next.map((zone) => zone.name)).toEqual(['Principal', 'Relatórios'])
    expect(zonesOfTable(next, 'pedido')).toEqual(['Relatórios'])
  })
})
