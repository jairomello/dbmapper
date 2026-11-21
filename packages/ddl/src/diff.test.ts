import { describe, expect, test } from 'bun:test'
import { diffModels } from './diff'
import { column, model, relationship, table } from './fixtures'

describe('diffModels', () => {
  test('classifica tabelas e colunas criadas, removidas e com tipo alterado', () => {
    const baseline = model('loja', [
      table('cliente', [column('id', 'int', { primary_key: true }), column('nome', 'varchar(100)'), column('telefone', 'text')]),
      table('obsoleto', [column('id', 'int', { primary_key: true })]),
    ])
    const atual = model('loja', [
      table('cliente', [column('id', 'int', { primary_key: true }), column('nome', 'varchar(255)'), column('email', 'text')]),
      table('novo', [column('id', 'int', { primary_key: true })]),
    ])

    const diff = diffModels(baseline, atual)

    expect(diff.tables).toEqual([
      { name: 'novo', kind: 'created' },
      { name: 'obsoleto', kind: 'removed' },
    ])
    expect(diff.columns).toEqual([
      { table: 'cliente', column: 'email', kind: 'created', previousType: null, currentType: 'text' },
      { table: 'cliente', column: 'telefone', kind: 'removed', previousType: 'text', currentType: null },
      {
        table: 'cliente',
        column: 'nome',
        kind: 'typeChanged',
        previousType: 'varchar(100)',
        currentType: 'varchar(255)',
      },
    ])
    expect(diff.foreignKeys).toEqual([])
    expect(diff.renames).toEqual([])
    expect(diff.warnings).toEqual([])
  })

  test('classifica FK criada e removida', () => {
    const semFk = table('pedido', [column('id', 'int', { primary_key: true }), column('cliente_id', 'int')])
    const comFk = table(
      'pedido',
      [column('id', 'int', { primary_key: true }), column('cliente_id', 'int')],
      [relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente')],
    )
    const cliente = table('cliente', [column('id', 'int', { primary_key: true })])

    const criada = diffModels(model('loja', [cliente, semFk]), model('loja', [cliente, comFk]))
    expect(criada.foreignKeys).toEqual([
      {
        table: 'pedido',
        kind: 'created',
        relationship: relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente'),
      },
    ])

    const removida = diffModels(model('loja', [cliente, comFk]), model('loja', [cliente, semFk]))
    expect(removida.foreignKeys).toEqual([
      {
        table: 'pedido',
        kind: 'removed',
        relationship: relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente'),
      },
    ])
  })

  test('marca FK órfã como aviso sem deixar de classificá-la', () => {
    const orfa = table(
      'pedido',
      [column('cliente_id', 'int')],
      [relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente')],
    )
    const diff = diffModels(model('loja', []), model('loja', [orfa]))

    expect(diff.foreignKeys).toHaveLength(1)
    expect(diff.foreignKeys[0].kind).toBe('created')
    expect(diff.warnings).toHaveLength(1)
    expect(diff.warnings[0]).toContain('cliente')
    expect(diff.warnings[0]).toContain('instrução ignorada')
  })

  test('rename explícito de tabela não vira criação nem remoção', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int')])])
    const atual = model('loja', [table('clientes', [column('id', 'int')])])

    const diff = diffModels(baseline, atual, { renames: { tables: { cliente: 'clientes' } } })

    expect(diff.tables).toEqual([])
    expect(diff.columns).toEqual([])
    expect(diff.renames).toEqual([{ kind: 'table', from: 'cliente', to: 'clientes' }])
    expect(diff.warnings).toEqual([])
  })

  test('rename explícito de coluna não vira criação nem remoção', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int'), column('cpf', 'text')])])
    const atual = model('loja', [table('cliente', [column('id', 'int'), column('documento', 'text')])])

    const diff = diffModels(baseline, atual, { renames: { columns: { 'cliente.cpf': 'documento' } } })

    expect(diff.columns).toEqual([])
    expect(diff.renames).toEqual([{ kind: 'column', table: 'cliente', from: 'cpf', to: 'documento' }])
    expect(diff.warnings).toEqual([])
  })

  test('normaliza FK pela renomeação de tabela e coluna', () => {
    const baseline = model('loja', [
      table('cliente', [column('id', 'int'), column('cpf', 'text')]),
      table('pedido', [column('id', 'int'), column('cliente_cpf', 'text')], [
        relationship('cliente', ['cliente_cpf'], ['cpf'], 'fk_pedido_cliente'),
      ]),
    ])
    const atual = model('loja', [
      table('clientes', [column('id', 'int'), column('documento', 'text')]),
      table('pedido', [column('id', 'int'), column('cliente_cpf', 'text')], [
        relationship('clientes', ['cliente_cpf'], ['documento'], 'fk_pedido_cliente'),
      ]),
    ])

    const diff = diffModels(baseline, atual, {
      renames: { tables: { cliente: 'clientes' }, columns: { 'cliente.cpf': 'documento' } },
    })

    expect(diff.foreignKeys).toEqual([])
    expect(diff.tables).toEqual([])
    expect(diff.warnings).toEqual([])
  })

  test('rename inválido vira aviso e mantém criação e remoção', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int')])])
    const atual = model('loja', [table('clientes', [column('id', 'int')])])

    const diff = diffModels(baseline, atual, { renames: { tables: { cliente: 'inexistente' } } })

    expect(diff.tables).toEqual([
      { name: 'clientes', kind: 'created' },
      { name: 'cliente', kind: 'removed' },
    ])
    expect(diff.renames).toEqual([])
    expect(diff.warnings).toHaveLength(1)
    expect(diff.warnings[0]).toContain('inexistente')
  })

  test('rename de coluna inválido vira aviso e mantém criação e remoção', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int'), column('cpf', 'text')])])
    const atual = model('loja', [table('cliente', [column('id', 'int'), column('documento', 'text')])])

    const diff = diffModels(baseline, atual, { renames: { columns: { 'cliente.cpf': 'inexistente' } } })

    expect(diff.columns).toEqual([
      { table: 'cliente', column: 'documento', kind: 'created', previousType: null, currentType: 'text' },
      { table: 'cliente', column: 'cpf', kind: 'removed', previousType: 'text', currentType: null },
    ])
    expect(diff.renames).toEqual([])
    expect(diff.warnings).toHaveLength(1)
    expect(diff.warnings[0]).toContain('inexistente')
  })

  test('ignora diferença de apelido do tipo na comparação', () => {
    const baseline = model('loja', [table('t', [column('valor', 'int')])])
    const atual = model('loja', [table('t', [column('valor', 'integer')])])

    expect(diffModels(baseline, atual).columns).toEqual([])
  })

  test('status REMOVED sai da comparação', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int'), column('antigo', 'text')])])
    const atual = model('loja', [
      table('cliente', [column('id', 'int'), column('antigo', 'text', { status: 'REMOVED' })]),
      table('legado', [column('id', 'int')], [], { status: 'REMOVED' }),
    ])

    const diff = diffModels(baseline, atual)
    expect(diff.tables).toEqual([])
    expect(diff.columns).toEqual([
      { table: 'cliente', column: 'antigo', kind: 'removed', previousType: 'text', currentType: null },
    ])
    expect(diff.warnings).toEqual([])
  })
})
