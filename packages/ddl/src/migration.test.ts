import { describe, expect, test } from 'bun:test'
import { column, model, relationship, table } from './fixtures'
import { generateMigrationScript } from './generate'
import type { DdlDialect } from './types'

const dialetos: DdlDialect[] = ['postgres', 'mysql']

describe('generateMigrationScript', () => {
  for (const dialect of dialetos) {
    test(`rename de tabela mapeado (${dialect})`, () => {
      const baseline = model('loja', [table('cliente', [column('id', 'int')])])
      const atual = model('loja', [table('clientes', [column('id', 'int')])])

      const result = generateMigrationScript(baseline, atual, {
        dialect,
        renames: { tables: { cliente: 'clientes' } },
      })

      expect(result.statements).toEqual([`ALTER TABLE ${quote('cliente', dialect)} RENAME TO ${quote('clientes', dialect)}`])
      expect(result.destructive).toEqual([])
      expect(result.warnings).toEqual([])
    })

    test(`rename de coluna mapeado (${dialect})`, () => {
      const baseline = model('loja', [table('cliente', [column('id', 'int'), column('cpf', 'text')])])
      const atual = model('loja', [table('cliente', [column('id', 'int'), column('documento', 'text')])])

      const result = generateMigrationScript(baseline, atual, {
        dialect,
        renames: { columns: { 'cliente.cpf': 'documento' } },
      })

      expect(result.statements).toEqual([
        `ALTER TABLE ${quote('cliente', dialect)} RENAME COLUMN ${quote('cpf', dialect)} TO ${quote('documento', dialect)}`,
      ])
      expect(result.destructive).toEqual([])
      expect(result.warnings).toEqual([])
    })

    test(`rename não mapeado vira DROP mais CREATE com aviso (${dialect})`, () => {
      const baseline = model('loja', [table('cliente', [column('id', 'int'), column('cpf', 'text')])])
      const atual = model('loja', [table('clientes', [column('id', 'int'), column('documento', 'text')])])

      const result = generateMigrationScript(baseline, atual, { dialect })

      expect(result.statements).toEqual([
        `CREATE TABLE ${quote('clientes', dialect)} (\n  ${quote('id', dialect)} INTEGER,\n  ${quote('documento', dialect)} TEXT\n)`,
        `DROP TABLE ${quote('cliente', dialect)}`,
      ])
      expect(result.destructive).toEqual([`DROP TABLE ${quote('cliente', dialect)}`])
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('cliente')
      expect(result.warnings[0]).toContain('dados serão perdidos')
    })

    test(`tipo alterado usa o statement do dialeto (${dialect})`, () => {
      const baseline = model('loja', [table('cliente', [column('id', 'int'), column('nome', 'varchar(100)')])])
      const atual = model('loja', [table('cliente', [column('id', 'int'), column('nome', 'text')])])

      const result = generateMigrationScript(baseline, atual, { dialect })

      const esperado =
        dialect === 'mysql'
          ? `ALTER TABLE ${quote('cliente', dialect)} MODIFY COLUMN ${quote('nome', dialect)} TEXT`
          : `ALTER TABLE ${quote('cliente', dialect)} ALTER COLUMN ${quote('nome', dialect)} TYPE TEXT`
      expect(result.statements).toEqual([esperado])
      expect(result.destructive).toEqual([])
      expect(result.warnings).toEqual([
        'Tipo da coluna "cliente"."nome" mudou de "varchar(100)" para "text"; a alteração pode perder dados.',
      ])
    })
  }

  test('cria tabela, adiciona coluna e FK na ordem correta', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int')])])
    const atual = model('loja', [
      table('cliente', [column('id', 'int'), column('email', 'text')]),
      table(
        'novo',
        [column('id', 'int'), column('cliente_id', 'int')],
        [relationship('cliente', ['cliente_id'], ['id'], 'fk_novo_cliente')],
      ),
    ])

    const result = generateMigrationScript(baseline, atual, { dialect: 'postgres' })

    expect(result.statements).toEqual([
      'CREATE TABLE "novo" (\n  "id" INTEGER,\n  "cliente_id" INTEGER\n)',
      'ALTER TABLE "cliente" ADD COLUMN "email" TEXT',
      'ALTER TABLE "novo" ADD CONSTRAINT "fk_novo_cliente" FOREIGN KEY ("cliente_id") REFERENCES "cliente" ("id")',
    ])
    expect(result.destructive).toEqual([])
    expect(result.warnings).toEqual([])
  })

  test('relata DROP de coluna e de tabela como destrutivos', () => {
    const baseline = model('loja', [
      table('cliente', [column('id', 'int'), column('telefone', 'text')]),
      table('legado', [column('id', 'int')]),
    ])
    const atual = model('loja', [table('cliente', [column('id', 'int')])])

    const result = generateMigrationScript(baseline, atual, { dialect: 'postgres' })

    expect(result.statements).toEqual([
      'ALTER TABLE "cliente" DROP COLUMN "telefone"',
      'DROP TABLE "legado"',
    ])
    expect(result.destructive).toEqual([
      'ALTER TABLE "cliente" DROP COLUMN "telefone"',
      'DROP TABLE "legado"',
    ])
    expect(result.warnings).toEqual([
      'Coluna "cliente"."telefone" removida sem mapeamento de renomeação; os dados serão perdidos.',
      'Tabela "legado" removida sem mapeamento de renomeação; os dados serão perdidos.',
    ])
  })

  for (const dialect of dialetos) {
    test(`remove FK nomeada (${dialect})`, () => {
      const cliente = table('cliente', [column('id', 'int')])
      const baseline = model('loja', [
        cliente,
        table('pedido', [column('id', 'int'), column('cliente_id', 'int')], [
          relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente'),
        ]),
      ])
      const atual = model('loja', [cliente, table('pedido', [column('id', 'int'), column('cliente_id', 'int')])])

      const result = generateMigrationScript(baseline, atual, { dialect })

      const esperado =
        dialect === 'mysql'
          ? `ALTER TABLE ${quote('pedido', dialect)} DROP FOREIGN KEY ${quote('fk_pedido_cliente', dialect)}`
          : `ALTER TABLE ${quote('pedido', dialect)} DROP CONSTRAINT ${quote('fk_pedido_cliente', dialect)}`
      expect(result.statements).toEqual([esperado])
      expect(result.destructive).toEqual([])
      expect(result.warnings).toEqual([])
    })
  }

  test('FK removida sem nome vira aviso e não statement', () => {
    const cliente = table('cliente', [column('id', 'int')])
    const baseline = model('loja', [
      cliente,
      table('pedido', [column('id', 'int'), column('cliente_id', 'int')], [
        relationship('cliente', ['cliente_id'], ['id']),
      ]),
    ])
    const atual = model('loja', [cliente, table('pedido', [column('id', 'int'), column('cliente_id', 'int')])])

    const result = generateMigrationScript(baseline, atual, { dialect: 'postgres' })

    expect(result.statements).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('sem nome de constraint')
  })

  test('FK órfã adicionada vira aviso e não statement', () => {
    const baseline = model('loja', [table('pedido', [column('id', 'int'), column('fantasma_id', 'int')])])
    const atual = model('loja', [
      table(
        'pedido',
        [column('id', 'int'), column('fantasma_id', 'int')],
        [relationship('fantasma', ['fantasma_id'], ['id'], 'fk_pedido_fantasma')],
      ),
    ])

    const result = generateMigrationScript(baseline, atual, { dialect: 'postgres' })

    expect(result.statements).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('fantasma')
    expect(result.warnings[0]).toContain('instrução ignorada')
  })

  test('rename de tabela precede alteração de tipo e renomeia a coluna', () => {
    const baseline = model('loja', [table('cliente', [column('id', 'int'), column('nome', 'varchar(100)')])])
    const atual = model('loja', [table('clientes', [column('id', 'int'), column('nome', 'text')])])

    const result = generateMigrationScript(baseline, atual, {
      dialect: 'postgres',
      renames: { tables: { cliente: 'clientes' } },
    })

    expect(result.statements).toEqual([
      'ALTER TABLE "cliente" RENAME TO "clientes"',
      'ALTER TABLE "clientes" ALTER COLUMN "nome" TYPE TEXT',
    ])
  })

  test('é estável entre duas chamadas', () => {
    const baseline = model('loja', [
      table('cliente', [column('id', 'int'), column('nome', 'varchar(100)')]),
      table('legado', [column('id', 'int')]),
    ])
    const atual = model('loja', [
      table('cliente', [column('id', 'int'), column('nome', 'text'), column('email', 'text')]),
      table('novo', [column('id', 'int')]),
    ])

    const primeiro = generateMigrationScript(baseline, atual, { dialect: 'mysql' })
    const segundo = generateMigrationScript(baseline, atual, { dialect: 'mysql' })
    expect(segundo).toEqual(primeiro)
  })
})

function quote(identifier: string, dialect: DdlDialect): string {
  return dialect === 'mysql' ? `\`${identifier}\`` : `"${identifier}"`
}
