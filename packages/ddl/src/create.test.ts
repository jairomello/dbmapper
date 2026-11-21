import { describe, expect, test } from 'bun:test'
import { column, model, relationship, table } from './fixtures'
import { generateCreateScript } from './generate'

const cliente = table('cliente', [
  column('id', 'int', { primary_key: true }),
  column('nome', 'varchar(255)'),
])

const pedido = table(
  'pedido',
  [
    column('id', 'serial', { primary_key: true }),
    column('cliente_id', 'int', { foreign_key: true }),
  ],
  [relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente')],
)

const loja = model('loja', [cliente, pedido])

describe('generateCreateScript', () => {
  test('snapshot postgres', () => {
    expect(generateCreateScript(loja, { dialect: 'postgres' })).toEqual({
      statements: [
        'CREATE TABLE "cliente" (\n  "id" INTEGER,\n  "nome" VARCHAR(255),\n  PRIMARY KEY ("id")\n)',
        'CREATE TABLE "pedido" (\n  "id" SERIAL,\n  "cliente_id" INTEGER,\n  PRIMARY KEY ("id")\n)',
        'ALTER TABLE "pedido" ADD CONSTRAINT "fk_pedido_cliente" FOREIGN KEY ("cliente_id") REFERENCES "cliente" ("id")',
      ],
      destructive: [],
      warnings: [],
    })
  })

  test('snapshot mysql', () => {
    expect(generateCreateScript(loja, { dialect: 'mysql' })).toEqual({
      statements: [
        'CREATE TABLE `cliente` (\n  `id` INTEGER,\n  `nome` VARCHAR(255),\n  PRIMARY KEY (`id`)\n)',
        'CREATE TABLE `pedido` (\n  `id` INT AUTO_INCREMENT,\n  `cliente_id` INTEGER,\n  PRIMARY KEY (`id`)\n)',
        'ALTER TABLE `pedido` ADD CONSTRAINT `fk_pedido_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`id`)',
      ],
      destructive: [],
      warnings: [],
    })
  })

  test('é estável entre duas chamadas', () => {
    const primeiro = generateCreateScript(loja, { dialect: 'postgres' })
    const segundo = generateCreateScript(loja, { dialect: 'postgres' })
    expect(segundo).toEqual(primeiro)
    expect(segundo.statements.join('\n')).toBe(primeiro.statements.join('\n'))
  })

  test('omite tabela com status REMOVED', () => {
    const comRemovida = model('loja', [...loja.tables, table('legado', [column('id', 'int')], [], { status: 'REMOVED' })])
    const result = generateCreateScript(comRemovida, { dialect: 'postgres' })
    expect(result.statements.join('\n')).not.toContain('legado')
  })

  test('omite coluna com status REMOVED', () => {
    const tabela = table('cliente', [column('id', 'int'), column('antigo', 'text', { status: 'REMOVED' })])
    const result = generateCreateScript(model('loja', [tabela]), { dialect: 'postgres' })
    expect(result.statements[0]).toBe('CREATE TABLE "cliente" (\n  "id" INTEGER\n)')
  })

  test('não inclui metadados de documentação', () => {
    const documentada = table(
      'cliente',
      [
        column('id', 'int', {
          description: 'Identificador do cliente',
          business_terms: ['cliente'],
          reviewed: true,
        }),
      ],
      [],
      {
        description: 'Cadastro de clientes',
        business_terms: ['cliente'],
        reviewed: true,
      },
    )
    const result = generateCreateScript(model('loja', [documentada]), { dialect: 'postgres' })
    const script = result.statements.join('\n')
    expect(script).not.toContain('Cadastro de clientes')
    expect(script).not.toContain('Identificador do cliente')
    expect(script).not.toContain('business_terms')
    expect(script).not.toContain('reviewed')
  })

  test('emite FKs ao final, depois de todas as tabelas', () => {
    const result = generateCreateScript(loja, { dialect: 'postgres' })
    expect(result.statements.slice(-1)[0].startsWith('ALTER TABLE "pedido" ADD')).toBe(true)
  })

  test('tipo desconhecido é emitido como está e vira aviso', () => {
    const tabela = table('mapa', [column('area', 'geometry(Point, 4326)')])
    const result = generateCreateScript(model('loja', [tabela]), { dialect: 'postgres' })
    expect(result.statements[0]).toBe('CREATE TABLE "mapa" (\n  "area" geometry(Point, 4326)\n)')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('area')
    expect(result.warnings[0]).toContain('geometry(Point, 4326)')
  })

  test('FK órfã vira aviso e não statement', () => {
    const orfa = table(
      'pedido',
      [column('cliente_id', 'int', { foreign_key: true })],
      [relationship('cliente', ['cliente_id'], ['id'], 'fk_pedido_cliente')],
    )
    const result = generateCreateScript(model('loja', [orfa]), { dialect: 'postgres' })
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0].startsWith('CREATE TABLE')).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('cliente')
    expect(result.warnings[0]).toContain('instrução ignorada')
  })

  test('FK sem nome de constraint omite CONSTRAINT', () => {
    const filha = table('pedido', [column('cliente_id', 'int')], [relationship('cliente', ['cliente_id'], ['id'])])
    const pai = table('cliente', [column('id', 'int', { primary_key: true })])
    const result = generateCreateScript(model('loja', [pai, filha]), { dialect: 'postgres' })
    expect(result.statements.slice(-1)[0]).toBe(
      'ALTER TABLE "pedido" ADD FOREIGN KEY ("cliente_id") REFERENCES "cliente" ("id")',
    )
  })
})
