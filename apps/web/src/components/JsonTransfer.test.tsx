import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ProjectDocument, ProjectView } from '../api/types'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/setup'
import { errorResponse, installFetch, jsonResponse, readJsonBody } from '../test/fetch'
import { sampleDatabase, sampleProject } from '../test/fixtures'
import { JsonTransfer } from './JsonTransfer'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

describe('JsonTransfer', () => {
  test('exporta e reimporta o JSON v1 preservando descrições, termos e revisão', async () => {
    const database = sampleDatabase()
    const exportedDocument: ProjectDocument = { database }
    const importedProject = sampleProject({ id: 'projeto-importado', database })

    let capturedBlob: Blob | null = null
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalClick = HTMLAnchorElement.prototype.click
    let downloadName = ''

    URL.createObjectURL = ((blob: Blob) => {
      capturedBlob = blob
      return 'blob:dbmapper'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      downloadName = this.download
    }

    let importBody: ProjectDocument | null = null
    const onImported = mock((_project: ProjectView) => {})

    restoreCallbacks.push(() => {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      HTMLAnchorElement.prototype.click = originalClick
    })

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/projects/projeto-1/export') {
          return jsonResponse(exportedDocument)
        }
        if (url === '/api/projects/import' && init?.method === 'POST') {
          importBody = await readJsonBody<ProjectDocument>(init)
          return jsonResponse(importedProject, 201)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    render(<JsonTransfer projectId="projeto-1" onImported={onImported} />)

    fireEvent.click(screen.getByRole('button', { name: 'Exportar JSON' }))
    await waitFor(() => expect(capturedBlob).not.toBeNull())

    expect(downloadName).toBe('Loja.json')
    const exportedText = await capturedBlob!.text()
    const parsed = JSON.parse(exportedText) as ProjectDocument
    expect(parsed).toEqual(exportedDocument)

    const file = new File([exportedText], 'Loja.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Importar JSON'), { target: { files: [file] } })

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1))
    expect(importBody as ProjectDocument | null).toEqual(exportedDocument)

    const imported = onImported.mock.calls[0][0] as ProjectView
    const cliente = imported.database.tables.find((table) => table.name === 'cliente')
    const clienteId = cliente?.columns.find((column) => column.name === 'id')
    expect(cliente?.description).toBe('Cadastro de clientes')
    expect(cliente?.business_terms).toEqual(['cliente'])
    expect(cliente?.reviewed).toBe(true)
    expect(clienteId?.description).toBe('Identificador do cliente')
    expect(clienteId?.business_terms).toEqual(['identificador'])
    expect(clienteId?.reviewed).toBe(true)
  })

  test('mostra erro ao importar um arquivo que não é JSON válido', async () => {
    const onImported = mock((_project: ProjectView) => {})
    const file = new File(['não é json'], 'invalido.json', { type: 'application/json' })

    render(<JsonTransfer projectId="projeto-1" onImported={onImported} />)

    fireEvent.change(screen.getByLabelText('Importar JSON'), { target: { files: [file] } })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('JSON')
    expect(onImported).not.toHaveBeenCalled()
  })
})
