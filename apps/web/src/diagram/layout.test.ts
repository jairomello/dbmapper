import { describe, expect, test } from 'bun:test'
import { sampleDatabase, tableByName } from '../test/fixtures'
import {
  buildPositions,
  buildZonePositions,
  createDiagramEdges,
  createDiagramNodes,
  diagramMatches,
  gridPosition,
  tableMatchKey,
  columnMatchKey,
} from './layout'

describe('diagram layout', () => {
  test('atribui posições em grade e preserva posições salvas por nome', () => {
    const database = sampleDatabase()
    database.tables.push({
      name: 'produto',
      description: '',
      business_terms: [],
      reviewed: false,
      status: 'UNCHANGED',
      relationships: { parents: [], children: [] },
      columns: [],
    })

    const positions = buildPositions(database, { cliente: { x: 400, y: 120 } })

    expect(positions.cliente).toEqual({ x: 400, y: 120 })
    expect(positions.pedido).toEqual(gridPosition(1))
    expect(positions.produto).toEqual(gridPosition(2))
  })

  test('constrói posições apenas dos membros da zona', () => {
    const positions = buildZonePositions(['pedido', 'cliente'], { cliente: { x: 10, y: 20 } })

    expect(positions).toEqual({ pedido: gridPosition(0), cliente: { x: 10, y: 20 } })
    expect(positions.fantasma).toBeUndefined()
  })

  test('ignora entradas órfãs do layout salvo', () => {
    const database = sampleDatabase()
    const positions = buildPositions(database, { fantasma: { x: 999, y: 999 } })

    expect(Object.keys(positions).sort()).toEqual(['cliente', 'pedido'])
    expect(positions.fantasma).toBeUndefined()
  })

  test('cria um card por tabela não removida com colunas em ordem do modelo', () => {
    const database = sampleDatabase()
    database.tables.push({
      name: 'legado',
      description: '',
      business_terms: [],
      reviewed: false,
      status: 'REMOVED',
      relationships: { parents: [], children: [] },
      columns: [],
    })

    const nodes = createDiagramNodes({
      database,
      positions: buildPositions(database),
      selection: { type: 'column', table: 'pedido', column: 'cliente_id' },
      matches: diagramMatches(database, ''),
      query: '',
      draggable: true,
      onSelect: () => undefined,
    })

    expect(nodes).toHaveLength(2)
    expect(nodes.map((node) => node.id).sort()).toEqual(['cliente', 'pedido'])
    expect(nodes.find((node) => node.id === 'pedido')?.data.table.columns.map((column) => column.name)).toEqual([
      'id',
      'cliente_id',
    ])
    expect(nodes.find((node) => node.id === 'pedido')?.data.active).toBe(true)
    expect(nodes.find((node) => node.id === 'pedido')?.data.activeColumn).toBe('cliente_id')
  })

  test('cria uma aresta crow foot por relacionamento existente', () => {
    const database = sampleDatabase()
    const edges = createDiagramEdges(database)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: 'pedido',
      target: 'cliente',
      sourceHandle: 'col:cliente_id',
      targetHandle: 'col:id',
      type: 'crowsfoot',
    })
    expect(edges[0].data?.constraintName).toBe('fk_pedido_cliente')
  })

  test('não cria aresta para relacionamento que aponta para tabela removida ou ausente', () => {
    const database = sampleDatabase()
    tableByName(database, 'pedido').relationships.parents[0].table = 'inexistente'

    expect(createDiagramEdges(database)).toHaveLength(0)
  })

  test('busca destaca tabela e coluna sem alterar o conjunto de nós', () => {
    const database = sampleDatabase()
    const matches = diagramMatches(database, 'cliente')

    expect(matches.has(tableMatchKey('cliente'))).toBe(true)
    expect(matches.has(columnMatchKey('pedido', 'cliente_id'))).toBe(true)
    expect(matches.has(tableMatchKey('pedido'))).toBe(false)

    const nodes = createDiagramNodes({
      database,
      positions: buildPositions(database),
      selection: { type: 'database' },
      matches,
      query: 'cliente',
      draggable: true,
      onSelect: () => undefined,
    })

    expect(nodes).toHaveLength(2)
    expect(nodes.find((node) => node.id === 'cliente')?.data.tableMatch).toBe(true)
    expect(nodes.find((node) => node.id === 'pedido')?.data.columnMatches).toEqual(['cliente_id'])
  })
})
