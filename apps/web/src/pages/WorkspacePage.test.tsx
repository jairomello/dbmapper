import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { sampleProject, sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'
import type { ImportPlan } from '../api/types'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function stubWorkspace() {
  const project = sampleProject()

  restoreCallbacks.push(
    installFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(sampleUser)
      if (url === '/api/projects') {
        return jsonResponse([
          { id: project.id, name: project.name, description: project.description, createdAt: '', updatedAt: '' },
        ])
      }
      if (url === `/api/projects/${project.id}`) return jsonResponse(project)
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return project
}

describe('WorkspacePage', () => {
  test('renderiza o nome do projeto carregado e suas tabelas', async () => {
    stubWorkspace()
    renderApp(['/'])

    expect(await screen.findByRole('combobox', { name: 'Projeto' })).toBeTruthy()
    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByTestId('table-row-pedido')).toBeTruthy()
    expect(screen.getByTestId('database-row').textContent).toContain('Loja')
  })

  test('selecionar uma coluna carrega seus dados no editor', async () => {
    stubWorkspace()
    renderApp(['/'])

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
        if (url === '/api/projects') {
          return jsonResponse([
            { id: project.id, name: project.name, description: project.description, createdAt: '', updatedAt: '' },
          ])
        }
        if (url === `/api/projects/${project.id}` && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as { database: typeof project.database }
          return jsonResponse({ ...project, database: body.database })
        }
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])
    fireEvent.click(await screen.findByTestId('column-row-pedido-cliente_id'))
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Cliente do pedido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    const reviewedColumn = await screen.findByTestId('column-row-pedido-cliente_id')
    await waitFor(() => expect(within(reviewedColumn).getByText('revisar')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Descrição' }))
    await waitFor(() => expect(within(reviewedColumn).getByText('aprovado')).toBeTruthy())
  })

  test('cria um novo projeto e o seleciona', async () => {
    const created = sampleProject({ id: 'projeto-2', name: 'Novo Banco', database: { ...sampleProject().database, name: 'Novo Banco' } })
    let createdPayload: unknown

    restoreCallbacks.push(
      installFetch((url, init) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects' && init?.method === 'POST') {
          createdPayload = JSON.parse(String(init.body))
          return jsonResponse(created, 201)
        }
        if (url === '/api/projects') return jsonResponse([])
        if (url === `/api/projects/${created.id}`) return jsonResponse(created)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])
    fireEvent.click(await screen.findByRole('button', { name: 'Novo projeto' }))
    fireEvent.change(screen.getByLabelText('Nome do novo projeto'), { target: { value: 'Novo Banco' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    await waitFor(() => expect(createdPayload).toEqual({ name: 'Novo Banco' }))
    const databaseRow = await screen.findByTestId('database-row')
    expect(databaseRow.textContent).toContain('Novo Banco')
  })

  test('cria projeto a partir de SQL e popula a árvore', async () => {
    const empty = sampleProject({ id: 'projeto-sql', name: 'Loja SQL', database: { ...sampleProject().database, name: 'Loja SQL', tables: [] } })
    const populated = sampleProject({ id: 'projeto-sql', name: 'Loja SQL', database: { ...sampleProject().database, name: 'Loja SQL' } })
    const plan: ImportPlan = {
      planHash: 'plan-1',
      baseModelHash: 'base-1',
      sqlHash: 'sql-1',
      tables: { kept: [], added: ['cliente', 'pedido'], removed: [], renamed: [] },
      columns: {
        kept: [],
        added: [{ table: 'cliente', name: 'id', type: 'serial' }],
        removed: [],
        renamed: [],
        changed: [],
      },
      relationships: { kept: [], added: [], removed: [] },
    }

    restoreCallbacks.push(
      installFetch((url, init) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects' && init?.method === 'POST') return jsonResponse(empty, 201)
        if (url === '/api/projects/projeto-sql/imports/preview') return jsonResponse({ plan })
        if (url === '/api/projects/projeto-sql/imports/apply') {
          return jsonResponse({ project: populated, plan, run: {} })
        }
        if (url === '/api/projects') {
          return jsonResponse([
            { id: populated.id, name: populated.name, description: '', createdAt: '', updatedAt: '' },
          ])
        }
        if (url === `/api/projects/${populated.id}`) return jsonResponse(populated)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])
    fireEvent.click(await screen.findByRole('button', { name: 'Novo projeto a partir de SQL' }))
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Loja SQL' } })
    fireEvent.change(screen.getByLabelText('SQL'), { target: { value: 'CREATE TABLE cliente (id int);' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar a partir de SQL' }))

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByTestId('database-row').textContent).toContain('Loja SQL')
  })
})
