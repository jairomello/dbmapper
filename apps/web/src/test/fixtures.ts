import type { DatabaseModel, TableModel } from '@dbmapper/domain'
import type { AuthUser, ProjectView } from '../api/types'

export function sampleDatabase(): DatabaseModel {
  return {
    name: 'Loja',
    description: 'Banco da loja',
    business_terms: ['venda'],
    reviewed: false,
    tables: [
      {
        name: 'cliente',
        description: 'Cadastro de clientes',
        business_terms: ['cliente'],
        reviewed: true,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [
          {
            name: 'id',
            type: 'serial',
            primary_key: true,
            foreign_key: false,
            description: 'Identificador do cliente',
            business_terms: ['identificador'],
            reviewed: true,
            status: 'UNCHANGED',
          },
        ],
      },
      {
        name: 'pedido',
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
        relationships: {
          parents: [
            {
              table: 'cliente',
              local_columns: ['cliente_id'],
              referenced_columns: ['id'],
              constraint_name: 'fk_pedido_cliente',
              description: '',
              reviewed: false,
            },
          ],
          children: [],
        },
        columns: [
          {
            name: 'id',
            type: 'serial',
            primary_key: true,
            foreign_key: false,
            description: 'Identificador do pedido',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
          {
            name: 'cliente_id',
            type: 'int',
            primary_key: false,
            foreign_key: true,
            description: '',
            business_terms: [],
            reviewed: false,
            status: 'UNCHANGED',
          },
        ],
      },
    ],
  }
}

export function tableByName(database: DatabaseModel, name: string): TableModel {
  const table = database.tables.find((candidate) => candidate.name === name)
  if (!table) throw new Error(`Tabela ${name} não encontrada.`)
  return table
}

export function sampleProject(overrides: Partial<ProjectView> = {}): ProjectView {
  return {
    id: 'projeto-1',
    name: 'Loja',
    description: 'Banco da loja',
    businessTerms: ['venda'],
    reviewed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    table_ids: { cliente: 'table-cliente', pedido: 'table-pedido' },
    database: sampleDatabase(),
    sources: { project: 'human', tables: {}, columns: {} },
    ...overrides,
  }
}

export const sampleUser: AuthUser = {
  id: 'user-1',
  email: 'tester@example.com',
  role: 'MEMBER',
}
