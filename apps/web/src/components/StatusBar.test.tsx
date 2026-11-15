import type { ColumnModel, DatabaseModel, TableModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '../test/setup'
import { StatusBar } from './StatusBar'

function column(name: string, described = false, reviewed = false): ColumnModel {
  return {
    name,
    type: 'int',
    primary_key: false,
    foreign_key: false,
    description: described ? `Descrição de ${name}` : '',
    business_terms: [],
    reviewed: reviewed && described,
    status: 'UNCHANGED',
  }
}

function table(name: string, columns: ColumnModel[]): TableModel {
  return {
    name,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    columns,
    relationships: { parents: [], children: [] },
  }
}

function model(): DatabaseModel {
  return {
    name: 'Métricas',
    description: '',
    business_terms: [],
    reviewed: false,
    tables: [
      table('a', [column('a1', true, true), column('a2', true), column('a3'), column('a4', true)]),
      table('b', [column('b1', true, true), column('b2'), column('b3')]),
      table('c', [column('c1'), column('c2'), column('c3')]),
    ],
  }
}

afterEach(() => {
  cleanup()
})

describe('StatusBar', () => {
  test('mostra totais, percentuais, pendentes e progresso do modelo', () => {
    render(<StatusBar database={model()} />)

    expect(screen.getByTestId('coverage-tables').textContent).toContain('3')
    expect(screen.getByTestId('coverage-columns').textContent).toContain('10')
    expect(screen.getByTestId('coverage-described').textContent).toContain('0/3')
    expect(screen.getByTestId('coverage-described').textContent).toContain('4/10')
    expect(screen.getByTestId('coverage-described').textContent).toContain('40%')
    expect(screen.getByTestId('coverage-reviewed').textContent).toContain('2/10')
    expect(screen.getByTestId('coverage-reviewed').textContent).toContain('20%')
    expect(screen.getByTestId('coverage-pending').textContent).toContain('11')
    expect(screen.getByTestId('coverage-progress').textContent).toContain('15%')
  })

  test('recalcula após mudança de descrição', () => {
    const database = model()
    const { rerender } = render(<StatusBar database={database} />)

    expect(screen.getByTestId('coverage-described').textContent).toContain('4/10')

    const changed = structuredClone(database)
    changed.tables[2].columns[0].description = 'Descrição de c1'
    rerender(<StatusBar database={changed} />)

    expect(screen.getByTestId('coverage-described').textContent).toContain('5/10')
    expect(screen.getByTestId('coverage-described').textContent).toContain('50%')
  })
})
