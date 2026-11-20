import { describe, expect, test } from 'bun:test'
import { sampleDatabase, tableByName } from '../test/fixtures'
import {
  applyCommand,
  applyReverseCommand,
  columnNameError,
  createColumnCommand,
  createRelationshipCommand,
  createTableCommand,
  deleteColumnCommand,
  deleteRelationshipCommand,
  deleteTableCommand,
  relationshipConflict,
  renameTableCommand,
  tableNameError,
  updateColumnCommand,
} from './commands'

describe('canvas commands', () => {
  test('cria tabela com nome único e o inverso remove a tabela', () => {
    const database = sampleDatabase()
    const command = createTableCommand(database, {
      name: 'cliente',
      position: { x: 10, y: 20 },
    })

    const withTable = applyCommand(database, command)
    expect(withTable.tables.map((table) => table.name)).toContain('cliente_2')
    expect(withTable.tables.find((table) => table.name === 'cliente_2')?.columns[0].primary_key).toBe(true)

    const reverted = applyReverseCommand(withTable, command)
    expect(reverted.tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
  })

  test('excluir tabela remove relacionamentos que apontam para ela e o inverso restaura tudo', () => {
    const database = sampleDatabase()
    const command = deleteTableCommand(database, 'cliente')

    const withoutParent = applyCommand(database, command)
    expect(withoutParent.tables.map((table) => table.name)).toEqual(['pedido'])
    expect(tableByName(withoutParent, 'pedido').relationships.parents).toHaveLength(0)

    const restored = applyReverseCommand(withoutParent, command)
    expect(restored.tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
    expect(tableByName(restored, 'pedido').relationships.parents).toHaveLength(1)
    expect(tableByName(restored, 'cliente').relationships.children).toHaveLength(1)
  })

  test('renomear tabela atualiza relacionamentos de outras tabelas', () => {
    const database = sampleDatabase()
    const command = renameTableCommand(database, 'cliente', 'comprador')
    const renamed = applyCommand(database, command)

    expect(renamed.tables.map((table) => table.name)).toContain('comprador')
    expect(tableByName(renamed, 'pedido').relationships.parents[0].table).toBe('comprador')
    expect(applyReverseCommand(renamed, command).tables.map((table) => table.name)).toContain('cliente')
  })

  test('criar coluna e excluir restaura a definição no inverso', () => {
    const database = sampleDatabase()
    const command = createColumnCommand(database, 'cliente', { name: 'email', type: 'varchar(120)' })
    const withColumn = applyCommand(database, command)
    expect(tableByName(withColumn, 'cliente').columns.map((column) => column.name)).toContain('email')

    const withoutColumn = applyReverseCommand(withColumn, command)
    expect(tableByName(withoutColumn, 'cliente').columns.map((column) => column.name)).toEqual(['id'])
  })

  test('excluir coluna usada por relação remove a relação e o inverso restaura ambos', () => {
    const database = sampleDatabase()
    const command = deleteColumnCommand(database, 'pedido', 'cliente_id')
    const withoutColumn = applyCommand(database, command)

    expect(tableByName(withoutColumn, 'pedido').columns.map((column) => column.name)).toEqual(['id'])
    expect(tableByName(withoutColumn, 'pedido').relationships.parents).toHaveLength(0)

    const restored = applyReverseCommand(withoutColumn, command)
    expect(tableByName(restored, 'pedido').columns.map((column) => column.name)).toEqual(['id', 'cliente_id'])
    expect(tableByName(restored, 'pedido').relationships.parents).toHaveLength(1)
  })

  test('atualizar coluna renomeia referências nos relacionamentos', () => {
    const database = sampleDatabase()
    const before = tableByName(database, 'pedido').columns[1]
    const after = { ...before, name: 'comprador_id' }
    const command = updateColumnCommand(database, 'pedido', before, after)
    const updated = applyCommand(database, command)

    expect(tableByName(updated, 'pedido').columns[1].name).toBe('comprador_id')
    expect(tableByName(updated, 'pedido').relationships.parents[0].local_columns).toEqual(['comprador_id'])
    expect(applyReverseCommand(updated, command).tables[1].columns[1].name).toBe('cliente_id')
  })

  test('relacionamento cria a coluna FK e a relação no mesmo comando', () => {
    const database = sampleDatabase()
    const command = createRelationshipCommand(database, {
      source: 'cliente',
      target: 'pedido',
      fkColumnName: 'pedido_id',
    })
    const created = applyCommand(database, command)
    const cliente = tableByName(created, 'cliente')

    expect(cliente.columns.map((column) => column.name)).toContain('pedido_id')
    expect(cliente.columns.find((column) => column.name === 'pedido_id')?.foreign_key).toBe(true)
    expect(cliente.relationships.parents).toHaveLength(1)
    expect(cliente.relationships.parents[0]).toMatchObject({
      table: 'pedido',
      local_columns: ['pedido_id'],
      referenced_columns: ['id'],
    })

    const reverted = applyReverseCommand(created, command)
    expect(tableByName(reverted, 'cliente').columns.map((column) => column.name)).toEqual(['id'])
    expect(tableByName(reverted, 'cliente').relationships.parents).toHaveLength(0)
  })

  test('relacionamento reutiliza coluna existente sem criar duplicata', () => {
    const database = sampleDatabase()
    const command = createRelationshipCommand(database, {
      source: 'pedido',
      target: 'cliente',
      fkColumnName: 'cliente_id',
    })
    const created = applyCommand(database, command)
    const pedido = tableByName(created, 'pedido')

    expect(pedido.columns.filter((column) => column.name === 'cliente_id')).toHaveLength(1)
    expect(pedido.relationships.parents).toHaveLength(1)
  })

  test('relacionamento reporta conflito e reutiliza coluna compatível', () => {
    const database = sampleDatabase()
    expect(relationshipConflict(database, 'pedido', 'cliente', 'cliente_id')).toBeNull()

    const withPrimaryKey = applyCommand(
      database,
      createColumnCommand(database, 'cliente', { name: 'pedido_id', type: 'int', primaryKey: true }),
    )
    expect(relationshipConflict(withPrimaryKey, 'cliente', 'pedido', 'pedido_id')).toContain('chave primária')

    const reused = createRelationshipCommand(database, {
      source: 'pedido',
      target: 'cliente',
      fkColumnName: 'cliente_id',
    })
    expect(reused.params).toMatchObject({ table: 'pedido' })
    if (reused.action === 'relationship.create') {
      expect(reused.params.columns).toHaveLength(0)
    }
  })

  test('excluir relacionamento remove a FK e o inverso a restaura', () => {
    const database = sampleDatabase()
    const relationship = tableByName(database, 'pedido').relationships.parents[0]
    const command = deleteRelationshipCommand(database, 'pedido', relationship)
    const removed = applyCommand(database, command)

    expect(tableByName(removed, 'pedido').relationships.parents).toHaveLength(0)
    expect(tableByName(removed, 'pedido').columns.map((column) => column.name)).toEqual(['id'])

    const restored = applyReverseCommand(removed, command)
    expect(tableByName(restored, 'pedido').relationships.parents).toHaveLength(1)
    expect(tableByName(restored, 'pedido').columns.map((column) => column.name)).toEqual(['id', 'cliente_id'])
  })

  test('valida nomes de tabela e de coluna', () => {
    const database = sampleDatabase()
    expect(tableNameError(database, 'cliente')).toContain('Já existe')
    expect(tableNameError(database, 'cliente', 'cliente')).toBeNull()
    expect(tableNameError(database, '  ')).toContain('Informe')
    expect(columnNameError(database, 'pedido', 'cliente_id')).toContain('já existe')
    expect(columnNameError(database, 'pedido', 'cliente_id', 'cliente_id')).toBeNull()
    expect(columnNameError(database, 'pedido', '')).toContain('Informe')
  })
})
