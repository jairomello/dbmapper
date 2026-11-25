import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, within } from '../test/setup'
import { useState } from 'react'
import { sampleDatabase } from '../test/fixtures'
import type { Selection } from '../lib/selection'
import { SemanticTree } from './SemanticTree'

function TreeHarness({ onSelect }: { onSelect?: (selection: Selection) => void }) {
  const [selection, setSelection] = useState<Selection>({ type: 'database' })

  return (
    <SemanticTree
      database={sampleDatabase()}
      selection={selection}
      onSelect={(next) => {
        setSelection(next)
        onSelect?.(next)
      }}
    />
  )
}


afterEach(() => {
  cleanup()
})

describe('SemanticTree', () => {
  test('mostra badges sem desc, revisar e aprovado conforme o estado', () => {
    render(<TreeHarness />)

    const pedido = screen.getByTestId('table-row-pedido')
    expect(within(pedido).getByText('sem desc')).toBeTruthy()

    const pedidoId = screen.getByTestId('column-row-pedido-id')
    expect(within(pedidoId).getByText('revisar')).toBeTruthy()

    const clienteId = screen.getByTestId('column-row-cliente-id')
    expect(within(clienteId).getByText('aprovado')).toBeTruthy()
  })

  test('recolhe e expande uma tabela individualmente', () => {
    render(<TreeHarness />)

    expect(screen.queryByTestId('column-row-pedido-id')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recolher tabela pedido' }))
    expect(screen.queryByTestId('column-row-pedido-id')).toBeNull()
    expect(screen.queryByTestId('column-row-cliente-id')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir tabela pedido' }))
    expect(screen.queryByTestId('column-row-pedido-id')).toBeTruthy()
  })

  test('recolhe e expande todas as tabelas', () => {
    render(<TreeHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Recolher tudo' }))
    expect(screen.queryByTestId('column-row-pedido-id')).toBeNull()
    expect(screen.queryByTestId('column-row-cliente-id')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir tudo' }))
    expect(screen.queryByTestId('column-row-pedido-id')).toBeTruthy()
    expect(screen.queryByTestId('column-row-cliente-id')).toBeTruthy()
  })

  test('emite a seleção da coluna e destaca o item ativo', () => {
    const selections: Selection[] = []
    render(<TreeHarness onSelect={(selection) => selections.push(selection)} />)

    const clienteId = screen.getByTestId('column-row-cliente-id')
    fireEvent.click(clienteId)

    expect(selections).toEqual([{ type: 'column', table: 'cliente', column: 'id' }])
    expect(clienteId.getAttribute('data-active')).toBe('true')
  })

  test('ordena as tabelas alfabeticamente, independente da ordem do modelo', () => {
    const database = sampleDatabase()
    for (const name of ['zeta', 'alfa']) {
      database.tables.push({
        name,
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
        relationships: { parents: [], children: [] },
        columns: [],
      })
    }

    render(<SemanticTree database={database} selection={{ type: 'database' }} onSelect={() => undefined} />)

    const order = screen
      .getAllByTestId(/^table-row-/)
      .map((row) => row.getAttribute('data-testid')?.replace('table-row-', ''))
    expect(order).toEqual(['alfa', 'cliente', 'pedido', 'zeta'])
  })

  test('filtra por aprovadas, pendentes ou todas', () => {
    render(<SemanticTree database={sampleDatabase()} selection={{ type: 'database' }} onSelect={() => undefined} />)

    expect(screen.getByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByTestId('table-row-pedido')).toBeTruthy()
    expect(screen.getByTestId('tree-filter-all').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('tree-filter-pending'))
    expect(screen.queryByTestId('table-row-cliente')).toBeNull()
    expect(screen.getByTestId('table-row-pedido')).toBeTruthy()
    expect(screen.getByTestId('tree-table-count').textContent).toBe('1')

    fireEvent.click(screen.getByTestId('tree-filter-reviewed'))
    expect(screen.getByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.queryByTestId('table-row-pedido')).toBeNull()

    fireEvent.click(screen.getByTestId('tree-filter-all'))
    expect(screen.getByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByTestId('table-row-pedido')).toBeTruthy()
  })
})

function databaseWithConfig() {
  const database = sampleDatabase()
  database.tables.push({
    name: 'config',
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    relationships: { parents: [], children: [] },
    columns: [
      {
        name: 'id',
        type: 'serial',
        primary_key: true,
        foreign_key: false,
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
      },
    ],
  })
  return database
}

function dragData(data: Record<string, string> = {}) {
  return {
    types: Object.keys(data),
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: (type: string, value: string) => {
      data[type] = value
    },
    getData: (type: string) => data[type] ?? '',
  }
}

describe('SemanticTree zones', () => {
  const zones = [
    { name: 'Principal', tabOrder: 0, members: ['cliente'] },
    { name: 'Geografia', tabOrder: 1, members: [] },
  ]

  test('marca de forma discreta a tabela fora de todas as zonas', () => {
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        canMoveTables
      />,
    )

    expect(screen.getByTestId('table-outside-pedido').getAttribute('title')).toContain('Fora do diagrama')
    expect(screen.queryByTestId('table-outside-cliente')).toBeNull()
  })

  test('não renderiza seletor de zona por tabela', () => {
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        canMoveTables
      />,
    )

    expect(screen.queryByTestId('table-zone-pedido')).toBeNull()
    expect(screen.queryByTestId('table-add-to-zone-pedido')).toBeNull()
    expect(document.querySelector('select')).toBeNull()
  })

  test('dragstart da tabela carrega o nome para o canvas', () => {
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        canMoveTables
      />,
    )

    const transfer = dragData()
    fireEvent.dragStart(screen.getByTestId('table-row-cliente'), { dataTransfer: transfer })
    expect(transfer.getData('application/x-dbmapper-table')).toBe('cliente')
    expect(transfer.getData('text/plain')).toBe('cliente')
  })

  test('VIEWER não arrasta e não vê controles de adição ou movimentação', () => {
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        canMoveTables={false}
      />,
    )

    expect(screen.getByTestId('table-row-cliente').getAttribute('draggable')).toBe('false')
    expect(screen.queryByTestId('table-zone-cliente')).toBeNull()
    expect(screen.queryByTestId('table-add-to-zone-pedido')).toBeNull()
    expect(screen.getByTestId('table-outside-pedido')).toBeTruthy()
  })
})

describe('SemanticTree emphasis', () => {
  test('marca selecionada, incidentes e esmaece tabelas sem relacionamento', () => {
    render(
      <SemanticTree
        database={databaseWithConfig()}
        selection={{ type: 'table', table: 'pedido' }}
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByTestId('table-item-pedido').getAttribute('data-emphasis')).toBe('selected')
    expect(screen.getByTestId('table-item-cliente').getAttribute('data-emphasis')).toBe('incident')
    const config = screen.getByTestId('table-item-config')
    expect(config.getAttribute('data-emphasis')).toBe('muted')
    expect(config.className).toContain('opacity-40')
  })

  test('sem tabela selecionada não esmaece nenhuma tabela', () => {
    render(
      <SemanticTree
        database={databaseWithConfig()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByTestId('table-item-pedido').getAttribute('data-emphasis')).toBe('none')
    expect(screen.getByTestId('table-item-config').getAttribute('data-emphasis')).toBe('none')
    expect(screen.getByTestId('table-item-config').className).not.toContain('opacity-40')
  })
})
