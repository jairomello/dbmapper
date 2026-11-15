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
