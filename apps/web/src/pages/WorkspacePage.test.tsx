import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { sampleProject, sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function stubProject() {
  const project = sampleProject()

  restoreCallbacks.push(
    installFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(sampleUser)
      if (url === `/api/projects/${project.id}`) return jsonResponse(project)
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return project
}

describe('WorkspacePage', () => {
  test('carrega o projeto da rota e renderiza suas tabelas', async () => {
    stubProject()
    renderApp(['/project/projeto-1'])

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByTestId('table-row-pedido')).toBeTruthy()
    expect(screen.getByTestId('database-row').textContent).toContain('Loja')
    expect(screen.getByRole('link', { name: 'Projetos' })).toBeTruthy()
  })

  test('selecionar uma coluna carrega seus dados no editor', async () => {
    stubProject()
    renderApp(['/project/projeto-1'])

    const column = await screen.findByTestId('column-row-pedido-id')
    fireEvent.click(column)

    const description = screen.getByLabelText('Descrição') as HTMLTextAreaElement
    expect(description.value).toBe('Identificador do pedido')
    expect(screen.getByLabelText('Breadcrumb').textContent).toContain('pedido')
    expect(screen.getByLabelText('Breadcrumb').textContent).toContain('id')
  })

  test('salvar e aprovar atualiza os badges pela invalidação da query', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url, init) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === `/api/projects/${project.id}` && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as { database: DatabaseModel }
          return jsonResponse({ ...project, database: body.database })
        }
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/project/projeto-1'])
    fireEvent.click(await screen.findByTestId('column-row-pedido-cliente_id'))
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Cliente do pedido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    const reviewedColumn = await screen.findByTestId('column-row-pedido-cliente_id')
    await waitFor(() => expect(within(reviewedColumn).getByText('revisar')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Descrição' }))
    await waitFor(() => expect(within(reviewedColumn).getByText('aprovado')).toBeTruthy())
  })

  test('o header oferece o link Somente leitura para o viewer do projeto', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        if (url === `/api/projects/${project.id}/export`) return jsonResponse({ database: project.database })
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/project/projeto-1'])
    fireEvent.click(await screen.findByTestId('workspace-viewer-link'))

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  })

  test('exibe o badge de sugestões pendentes e abre o painel do agente', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        if (url === `/api/projects/${project.id}/agent/suggestions?status=pending`) {
          return jsonResponse({
            suggestions: [
              {
                id: 'sug-1',
                projectId: project.id,
                jobId: 'job-1',
                itemType: 'column',
                itemId: 'col-email',
                tableId: 'table-users',
                suggestedDescription: 'Campo email da tabela users.',
                context: {
                  table: { id: 'table-users', name: 'users' },
                  item: { type: 'column', id: 'col-email', name: 'email' },
                },
                status: 'pending',
                requestedBy: 'user-1',
                decidedBy: null,
                decidedAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/project/projeto-1'])

    const badge = await screen.findByTestId('agent-pending-badge')
    expect(badge.textContent).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Sugestões IA' }))
    expect(await screen.findByRole('dialog', { name: 'Sugestões IA' })).toBeTruthy()
    expect(await screen.findByTestId('suggestion-row-users-email')).toBeTruthy()
  })

  test('rota de projeto inexistente volta para a galeria', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects/missing') return errorResponse('NOT_FOUND', 'Projeto não encontrado.', 404)
        if (url === '/api/projects') return jsonResponse([])
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/project/missing'])

    expect(await screen.findByRole('heading', { name: 'Seus projetos' })).toBeTruthy()
  })
})
