import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ProjectView } from '../api/types'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/setup'
import { errorResponse, installFetch, jsonResponse, readJsonBody } from '../test/fetch'
import { sampleProject } from '../test/fixtures'
import { NewProjectDialog } from './NewProjectDialog'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

describe('NewProjectDialog', () => {
  test('não cria projeto quando o arquivo SQL não tem CREATE TABLE', async () => {
    const onCreated = mock((_project: ProjectView) => {})
    let projectCalls = 0

    restoreCallbacks.push(
      installFetch((url, init) => {
        if (url === '/api/projects' && init?.method === 'POST') {
          projectCalls += 1
          return jsonResponse(sampleProject(), 201)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    render(<NewProjectDialog onCreated={onCreated} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Sem tabelas' } })
    fireEvent.change(screen.getByLabelText('SQL'), { target: { value: 'SELECT 1;' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('CREATE TABLE')
    expect(projectCalls).toBe(0)
    expect(onCreated).not.toHaveBeenCalled()
  })

  test('importa um arquivo JSON legado direto e entrega o projeto criado', async () => {
    const imported = sampleProject({ id: 'projeto-json', name: 'Legado' })
    const onCreated = mock((_project: ProjectView) => {})
    let importBody: unknown

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/projects/import' && init?.method === 'POST') {
          importBody = await readJsonBody(init)
          return jsonResponse(imported, 201)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    render(<NewProjectDialog onCreated={onCreated} onClose={() => {}} />)

    const document = { database: { name: 'Legado', tables: [] } }
    const file = new File([JSON.stringify(document)], 'legado.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Importar arquivo .json'), { target: { files: [file] } })

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(importBody).toEqual(document)
    expect(onCreated.mock.calls[0][0]).toEqual(imported)
  })
})
