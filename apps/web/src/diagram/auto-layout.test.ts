import type { ColumnModel, TableModel } from '@dbmapper/domain'
import { describe, expect, test } from 'bun:test'
import type { DiagramPosition } from '../api/types'
import {
  adaptiveColumns,
  GRID_GAP_X,
  DIAGRAM_NODE_WIDTH,
  estimatedTableHeight,
  layoutGrid,
  layoutStar,
  type LayoutRelationship,
} from './auto-layout'

function column(name: string): ColumnModel {
  return {
    name,
    type: 'integer',
    primary_key: false,
    foreign_key: false,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
  }
}

function table(name: string, columnCount = 2): TableModel {
  return {
    name,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    relationships: { parents: [], children: [] },
    columns: Array.from({ length: columnCount }, (_value, index) => column(`coluna_${index}`)),
  }
}


function overlappingPairs(
  tables: readonly TableModel[],
  positions: Record<string, DiagramPosition>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i]
      const b = tables[j]
      const pa = positions[a.name]
      const pb = positions[b.name]
      if (!pa || !pb) continue
      const overlapping =
        pa.x < pb.x + DIAGRAM_NODE_WIDTH &&
        pa.x + DIAGRAM_NODE_WIDTH > pb.x &&
        pa.y < pb.y + estimatedTableHeight(b) &&
        pa.y + estimatedTableHeight(a) > pb.y
      if (overlapping) pairs.push([a.name, b.name])
    }
  }
  return pairs
}

function realModelFixture(): { tables: TableModel[]; relationships: LayoutRelationship[] } {
  const tables = Array.from({ length: 108 }, (_value, index) =>
    table(`tabela_${String(index).padStart(3, '0')}`, (index % 8) + 1),
  )
  const relationships: LayoutRelationship[] = []

  for (let index = 1; index < tables.length; index++) {
    relationships.push({
      source: tables[index].name,
      target: tables[Math.floor((index - 1) / 2)].name,
    })
  }

  for (let index = 1; index <= 96; index++) {
    relationships.push({
      source: tables[index].name,
      target: tables[(index * 7 + 3) % tables.length].name,
    })
  }

  return { tables, relationships }
}

describe('layoutGrid', () => {
  test('posiciona em grade ordenada por nome sem sobreposição', () => {
    const tables = [table('zeta', 1), table('alfa', 2), table('beta', 1)]
    const positions = layoutGrid(tables)

    expect(positions.alfa).toEqual({ x: 80, y: 80 })
    expect(positions.beta).toEqual({ x: 420, y: 80 })
    expect(positions.zeta).toEqual({ x: 760, y: 80 })
    expect(layoutGrid(tables)).toEqual(positions)
    expect(overlappingPairs(tables, positions)).toEqual([])
  })

  test('respeita o gap mínimo com cards altos', () => {
    const tables = [table('alta_a', 12), table('alta_b', 12), table('alta_c', 12), table('alta_d', 12)]
    const positions = layoutGrid(tables)

    expect(overlappingPairs(tables, positions)).toEqual([])
    const secondRowGap = positions.alta_d.y - (positions.alta_a.y + estimatedTableHeight(tables[0]))
    expect(secondRowGap).toBeGreaterThanOrEqual(40)
  })

  test('ordem de entrada, acentos e prefixo comum não alteram o resultado', () => {
    const tables = [table('conta_a'), table('conta_á'), table('ação'), table('acao'), table('conta_b')]
    const forward = layoutGrid(tables)
    const reversed = layoutGrid([...tables].reverse())

    expect(reversed).toEqual(forward)
    expect(Object.keys(forward)).toHaveLength(tables.length)
    expect(forward['conta_a']).not.toEqual(forward['conta_á'])
    expect(forward['acao']).not.toEqual(forward['ação'])
  })

  test('nomes duplicados não alteram o resultado', () => {
    const tables = [table('dup', 2), table('unica', 1), table('dup', 3)]
    const forward = layoutGrid(tables)
    const reversed = layoutGrid([...tables].reverse())

    expect(reversed).toEqual(forward)
    expect(Object.keys(forward).sort()).toEqual(['dup', 'unica'])
  })
})

describe('layoutStar', () => {
  const tables = [
    table('alocacao', 4),
    table('projeto', 3),
    table('usuario', 2),
    table('async_job', 2),
    table('empresa', 2),
    table('auditoria', 2),
    table('cache', 1),
  ]
  const relationships: LayoutRelationship[] = [
    { source: 'alocacao', target: 'projeto' },
    { source: 'alocacao', target: 'usuario' },
    { source: 'alocacao', target: 'async_job' },
    { source: 'projeto', target: 'empresa' },
  ]

  function ringFixture(): { tables: TableModel[]; relationships: LayoutRelationship[] } {
    const fixtureTables = [table('hub', 2)]
    for (let index = 1; index <= 8; index++) fixtureTables.push(table(`n${String(index).padStart(2, '0')}`, 2))
    for (let index = 1; index <= 16; index++) fixtureTables.push(table(`g${String(index).padStart(2, '0')}`, 2))

    const fixtureRelationships: LayoutRelationship[] = []
    for (let index = 1; index <= 8; index++) {
      fixtureRelationships.push({ source: 'hub', target: `n${String(index).padStart(2, '0')}` })
    }
    for (let index = 1; index <= 4; index++) {
      for (let child = 1; child <= 4; child++) {
        const group = (index - 1) * 4 + child
        fixtureRelationships.push({ source: `n0${index}`, target: `g${String(group).padStart(2, '0')}` })
      }
    }
    return { tables: fixtureTables, relationships: fixtureRelationships }
  }

  test('coloca o hub no centro e os níveis em anéis ao redor', () => {
    const fixture = ringFixture()
    const positions = layoutStar(fixture.tables, fixture.relationships, { columns: 5 })
    const rowTops = [...new Set(Object.values(positions).map((position) => position.y))].sort((a, b) => a - b)
    const rowOf = (name: string) => rowTops.indexOf(positions[name].y)
    const columnOf = (name: string) =>
      Math.round((positions[name].x - positions.hub.x) / (DIAGRAM_NODE_WIDTH + GRID_GAP_X))
    const ringOf = (name: string) =>
      Math.max(Math.abs(rowOf(name) - rowOf('hub')), Math.abs(columnOf(name)))

    const levelOne = Array.from({ length: 8 }, (_value, index) => `n${String(index + 1).padStart(2, '0')}`)
    const levelTwo = Array.from({ length: 16 }, (_value, index) => `g${String(index + 1).padStart(2, '0')}`)

    expect(levelOne.every((name) => ringOf(name) === 1)).toBe(true)
    expect(levelTwo.every((name) => ringOf(name) === 2)).toBe(true)
    expect(layoutStar([...fixture.tables].reverse(), [...fixture.relationships].reverse(), { columns: 5 })).toEqual(positions)
  })

  test('coloca as isoladas na faixa lateral e é determinístico', () => {
    const positions = layoutStar(tables, relationships)
    const ringRight = Math.max(
      ...[positions.async_job.x, positions.projeto.x, positions.usuario.x, positions.empresa.x],
    )

    expect(positions.auditoria.x).toBeGreaterThan(ringRight + DIAGRAM_NODE_WIDTH)
    expect(positions.cache.x).toBe(positions.auditoria.x)
    expect(positions.cache.y).toBeGreaterThan(positions.auditoria.y)

    const shuffledTables = [...tables].reverse()
    const shuffledRelationships = [...relationships].reverse()
    expect(layoutStar(shuffledTables, shuffledRelationships)).toEqual(positions)
    expect(overlappingPairs(tables, positions)).toEqual([])
  })
})

describe('adaptiveColumns', () => {
  test('mantém a grade aproximadamente quadrada', () => {
    expect(adaptiveColumns(1)).toBe(1)
    expect(adaptiveColumns(4)).toBe(2)
    expect(adaptiveColumns(9)).toBe(3)
    expect(adaptiveColumns(100)).toBe(10)
    expect(adaptiveColumns(108)).toBe(11)
  })
})

describe('layout sem sobreposição em modelo grande', () => {
  test('108 tabelas e 203 relacionamentos: zero pares sobrepostos e tempo limitado', () => {
    const { tables, relationships } = realModelFixture()
    expect(tables).toHaveLength(108)
    expect(relationships).toHaveLength(203)

    const gridStarted = performance.now()
    const gridPositions = layoutGrid(tables, { columns: adaptiveColumns(tables.length) })
    const gridElapsed = performance.now() - gridStarted

    const starStarted = performance.now()
    const starPositions = layoutStar(tables, relationships)
    const starElapsed = performance.now() - starStarted

    expect(overlappingPairs(tables, gridPositions)).toEqual([])
    expect(overlappingPairs(tables, starPositions)).toEqual([])
    expect(gridElapsed).toBeLessThan(1500)
    expect(starElapsed).toBeLessThan(1500)
  })

  test('escolhe colunas que reduzem a extensão total', () => {
    const { tables, relationships } = realModelFixture()
    const positions = layoutStar(tables, relationships)
    const xs = Object.values(positions).map((position) => position.x)
    const ys = Object.values(positions).map((position) => position.y)
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)

    expect(Math.max(width, height)).toBeLessThan(8000)
  })

  test('card muito alto não infla a extensão do layout', () => {
    const { tables, relationships } = realModelFixture()
    const tall = tables.map((entry, index) => (index === 5 ? table(entry.name, 100) : entry))
    const positions = layoutStar(tall, relationships)
    const xs = Object.values(positions).map((position) => position.x)
    const ys = Object.values(positions).map((position) => position.y)

    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)

    expect(overlappingPairs(tall, positions)).toEqual([])
    expect(Math.max(width, height)).toBeLessThan(10000)
  })
})
