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
})

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

  test('marca tabela fora do diagrama e oferece adicionar à aba atual', () => {
    const added: string[] = []
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        activeZone="Principal"
        canMoveTables
        onAddToActiveZone={(table) => added.push(table)}
      />,
    )

    expect(screen.getByTestId('table-outside-pedido').textContent).toContain('fora do diagrama')
    expect(screen.queryByTestId('table-outside-cliente')).toBeNull()

    fireEvent.click(screen.getByTestId('table-add-to-zone-pedido'))
    expect(added).toEqual(['pedido'])
  })

  test('move uma tabela para outra zona pela ação da árvore', () => {
    const moved: Array<[string, string]> = []
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        activeZone="Principal"
        canMoveTables
        onMoveTable={(table, zone) => moved.push([table, zone])}
      />,
    )

    fireEvent.change(screen.getByTestId('table-zone-pedido'), { target: { value: 'Geografia' } })
    expect(moved).toEqual([['pedido', 'Geografia']])
  })

  test('dragstart da tabela carrega o nome para o canvas', () => {
    render(
      <SemanticTree
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        zones={zones}
        activeZone="Principal"
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
        activeZone="Principal"
        canMoveTables={false}
      />,
    )

    expect(screen.getByTestId('table-row-cliente').getAttribute('draggable')).toBe('false')
    expect(screen.queryByTestId('table-zone-cliente')).toBeNull()
    expect(screen.queryByTestId('table-add-to-zone-pedido')).toBeNull()
    expect(screen.getByTestId('table-outside-pedido')).toBeTruthy()
  })
})
