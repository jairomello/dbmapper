import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { Selection } from '../lib/selection'
import { sampleDatabase, tableByName } from '../test/fixtures'
import { cleanup, fireEvent, render, waitFor, within } from '../test/setup'
import { MetadataEditor } from './MetadataEditor'

function renderEditor(
  selection: Selection,
  database: DatabaseModel = sampleDatabase(),
  onSave = mock((next: DatabaseModel) => Promise.resolve(next)),
) {
  const view = render(<MetadataEditor database={database} selection={selection} onSave={onSave} />)
  return { onSave, queries: within(view.container) }
}

afterEach(() => {
  cleanup()
})

describe('MetadataEditor', () => {
  test('persiste a descrição editada e mostra o breadcrumb', async () => {
    const { onSave, queries } = renderEditor({ type: 'column', table: 'pedido', column: 'cliente_id' })

    expect(queries.getByLabelText('Breadcrumb').textContent).toContain('Loja')
    expect(queries.getByLabelText('Breadcrumb').textContent).toContain('pedido')
    expect(queries.getByLabelText('Breadcrumb').textContent).toContain('cliente_id')

    fireEvent.change(queries.getByLabelText('Descrição'), { target: { value: 'Cliente do pedido' } })
    fireEvent.click(queries.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const saved = onSave.mock.calls[0][0]
    const column = tableByName(saved, 'pedido').columns.find((candidate) => candidate.name === 'cliente_id')
    expect(column?.description).toBe('Cliente do pedido')
  })

  test('adiciona termo com Enter e remove pelo chip', async () => {
    const { onSave, queries } = renderEditor({ type: 'column', table: 'pedido', column: 'cliente_id' })

    const termInput = queries.getByLabelText('Adicionar termo de negócio')
    fireEvent.change(termInput, { target: { value: 'venda' } })
    fireEvent.keyDown(termInput, { key: 'Enter', code: 'Enter' })

    expect(queries.getByText('venda')).toBeTruthy()
    fireEvent.click(queries.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    let column = tableByName(onSave.mock.calls[0][0], 'pedido').columns.find((candidate) => candidate.name === 'cliente_id')
    expect(column?.business_terms).toEqual(['venda'])

    fireEvent.click(queries.getByRole('button', { name: 'Remover termo venda' }))
    expect(queries.queryByText('venda')).toBeNull()
    fireEvent.click(queries.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    column = tableByName(onSave.mock.calls[1][0], 'pedido').columns.find((candidate) => candidate.name === 'cliente_id')
    expect(column?.business_terms).toEqual([])
  })

  test('bloqueia aprovação com descrição vazia e exibe a mensagem', () => {
    const { queries } = renderEditor({ type: 'column', table: 'pedido', column: 'cliente_id' })

    const approve = queries.getByRole('button', { name: 'Aprovar Descrição' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(queries.getByText('Preencha a descrição antes de aprovar.')).toBeTruthy()

    fireEvent.change(queries.getByLabelText('Descrição'), { target: { value: 'Cliente do pedido' } })
    expect(approve.disabled).toBe(false)
    expect(queries.queryByText('Preencha a descrição antes de aprovar.')).toBeNull()
  })

  test('aprova com reviewed true no payload', async () => {
    const { onSave, queries } = renderEditor({ type: 'column', table: 'pedido', column: 'id' })
    fireEvent.click(queries.getByRole('button', { name: 'Aprovar Descrição' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const column = tableByName(onSave.mock.calls[0][0], 'pedido').columns.find((candidate) => candidate.name === 'id')
    expect(column?.reviewed).toBe(true)
  })

  test('reabre revisão ao salvar edição de item aprovado', async () => {
    const { onSave, queries } = renderEditor({ type: 'column', table: 'cliente', column: 'id' })
    expect(queries.getByRole('button', { name: 'Reabrir Revisão' })).toBeTruthy()

    fireEvent.change(queries.getByLabelText('Descrição'), { target: { value: 'Novo identificador do cliente' } })
    fireEvent.click(queries.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const column = tableByName(onSave.mock.calls[0][0], 'cliente').columns.find((candidate) => candidate.name === 'id')
    expect(column?.description).toBe('Novo identificador do cliente')
    expect(column?.reviewed).toBe(false)
  })
})
