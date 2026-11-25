import type { ImportPlan } from '../api/types'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'
import { errorResponse, installFetch, jsonResponse, readJsonBody } from '../test/fetch'
import { sampleProject, sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

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

function summaryOf(project: ReturnType<typeof sampleProject>) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

describe('GalleryPage', () => {
  test('lista os projetos em cards com nome, descrição e atualização', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects') return jsonResponse([summaryOf(project)])
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])

    const card = await screen.findByTestId(`project-card-${project.id}`)
    expect(card.textContent).toContain('Loja')
    expect(card.textContent).toContain('Banco da loja')
    expect(within(card).getByText(/Atualizado em/)).toBeTruthy()
  })

  test('clicar no card abre o workspace do projeto', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects') return jsonResponse([summaryOf(project)])
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])
    fireEvent.click(await screen.findByRole('link', { name: 'Abrir projeto Loja' }))

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Seus projetos' })).toBeNull()
  })

  test('refresh em /project/:id mantém o projeto aberto', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp([`/project/${project.id}`])

    expect(await screen.findByTestId('table-row-pedido')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Seus projetos' })).toBeNull()
  })

  test('o link Abrir visualização abre o viewer do projeto', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects') return jsonResponse([summaryOf(project)])
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])
    fireEvent.click(await screen.findByTestId(`viewer-link-${project.id}`))

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByText('Somente leitura')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  })

  test('renomeia um projeto pelo card sem sair da galeria', async () => {
    const project = sampleProject()
    const renamed = { ...summaryOf(project), name: 'Banco Central' }
    let patchedName = ''
    let listed = [summaryOf(project)]

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === `/api/projects/${project.id}` && init?.method === 'PATCH') {
          const body = await readJsonBody<{ name: string }>(init)
          patchedName = body.name
          listed = [renamed]
          return jsonResponse(renamed)
        }
        if (url === '/api/projects') return jsonResponse(listed)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])

    fireEvent.click(await screen.findByTestId(`rename-project-${project.id}`))
    const dialog = await screen.findByRole('dialog', { name: 'Renomear projeto' })
    fireEvent.change(within(dialog).getByLabelText('Nome do projeto'), { target: { value: 'Banco Central' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar nome' }))

    await waitFor(() =>
      expect(screen.getByTestId(`project-card-${project.id}`).textContent).toContain('Banco Central'),
    )
    expect(patchedName).toBe('Banco Central')
    expect(screen.getByRole('heading', { name: 'Seus projetos' })).toBeTruthy()
  })

  test('sem sessão a galeria redireciona para o login', async () => {
    restoreCallbacks.push(installFetch(() => errorResponse('UNAUTHORIZED', 'Sessão inválida.', 401)))

    renderApp(['/'])

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy()
  })

  test('estado vazio oferece a criação de projeto', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects') return jsonResponse([])
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])

    expect(await screen.findByRole('heading', { name: 'Nenhum projeto ainda' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Novo projeto' }).length).toBeGreaterThan(0)
  })

  test('cria um projeto a partir de um arquivo .sql e abre o workspace', async () => {
    const empty = sampleProject({
      id: 'projeto-sql',
      name: 'loja',
      description: '',
      database: { ...sampleProject().database, name: 'loja', tables: [] },
    })
    const populated = sampleProject({
      id: 'projeto-sql',
      name: 'loja',
      description: '',
      database: { ...sampleProject().database, name: 'loja' },
    })
    let appliedSql = ''

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects' && init?.method === 'POST') {
          const body = await readJsonBody<{ name: string }>(init)
          expect(body.name).toBe('loja')
          return jsonResponse(empty, 201)
        }
        if (url === '/api/projects/projeto-sql/imports/preview') return jsonResponse({ plan })
        if (url === '/api/projects/projeto-sql/imports/apply') {
          const body = await readJsonBody<{ sql: string }>(init)
          appliedSql = body.sql
          return jsonResponse({ project: populated, plan, run: {} })
        }
        if (url === '/api/projects') return jsonResponse([])
        if (url === '/api/projects/projeto-sql') return jsonResponse(populated)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])
    const createButtons = await screen.findAllByRole('button', { name: 'Novo projeto' })
    fireEvent.click(createButtons[0])

    const file = new File(['CREATE TABLE cliente (id int);'], 'loja.sql', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('Importar arquivo .sql'), { target: { files: [file] } })

    await waitFor(() => expect((screen.getByLabelText('Nome do projeto') as HTMLInputElement).value).toBe('loja'))
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(appliedSql).toContain('CREATE TABLE cliente')
  })
})
