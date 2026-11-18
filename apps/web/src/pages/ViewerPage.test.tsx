import { afterEach, describe, expect, test } from 'bun:test'
import type { ProjectView } from '../api/types'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { sampleDatabase, sampleProject, sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function viewerProject(): ProjectView {
  const database = sampleDatabase()
  const pedido = database.tables.find((table) => table.name === 'pedido')
  if (pedido) {
    pedido.description = 'Pedidos de venda'
    pedido.reviewed = false
  }

  return sampleProject({
    database,
    sources: {
      project: 'human',
      tables: { cliente: 'human', pedido: 'agent' },
      columns: { cliente: { id: 'human' }, pedido: { id: 'human', cliente_id: 'mcp' } },
    },
  })
}

function installViewerFetcher(methods: string[]) {
  const project = viewerProject()

  restoreCallbacks.push(
    installFetch((url, init) => {
      methods.push(init?.method ?? 'GET')
      if (url === '/api/auth/me') return jsonResponse(sampleUser)
      if (url === '/api/projects/projeto-1') return jsonResponse(project)
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return project
}

describe('ViewerPage', () => {
  test('renderiza árvore, busca e detalhe a partir da visão do projeto', async () => {
    const methods: string[] = []
    installViewerFetcher(methods)

    renderApp(['/viewer/projeto-1'])

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.getByTestId('table-row-pedido')).toBeTruthy()
    expect(screen.getByTestId('coverage-tables').textContent).toContain('2')

    fireEvent.change(screen.getByLabelText('Buscar no dicionário'), { target: { value: 'Cadastro' } })

    expect(await screen.findByTestId('table-row-cliente')).toBeTruthy()
    expect(screen.queryByTestId('table-row-pedido')).toBeNull()

    expect(methods.every((method) => method.toUpperCase() === 'GET')).toBe(true)
  })

  test('detalhe mostra descrição, termos e a fonte do item sem controles de mutação', async () => {
    installViewerFetcher([])

    renderApp(['/viewer/projeto-1'])
    fireEvent.click(await screen.findByTestId('table-row-pedido'))

    const detail = await screen.findByLabelText('Detalhe somente leitura')
    expect(within(detail).getByTestId('viewer-description').textContent).toBe('Pedidos de venda')
    expect(within(detail).getByTestId('viewer-source-badge').textContent).toContain('IA')
    expect(within(detail).getByText('revisar')).toBeTruthy()

    for (const name of ['Salvar', 'Aprovar Descrição', 'Reabrir Revisão', 'Atualizar modelo', 'Exportar JSON']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('textarea')).toBeNull()
  })

  test('coluna escrita por MCP mostra a fonte MCP', async () => {
    installViewerFetcher([])

    renderApp(['/viewer/projeto-1'])
    fireEvent.click(await screen.findByTestId('column-row-pedido-cliente_id'))

    const detail = await screen.findByLabelText('Detalhe somente leitura')
    expect(within(detail).getByTestId('viewer-source-badge').textContent).toContain('MCP')
  })

  test('projeto inexistente mostra estado amigável com link para a galeria', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects/ausente') {
          return errorResponse('NOT_FOUND', 'Projeto não encontrado.', 404)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/viewer/ausente'])

    expect(await screen.findByText('Projeto não encontrado.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar para a galeria' })).toBeTruthy()
  })

  test('sem sessão redireciona para o login', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return errorResponse('UNAUTHORIZED', 'Sessão inválida.', 401)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/viewer/projeto-1'])

    expect(await screen.findByLabelText('E-mail')).toBeTruthy()
  })

  test('só emite GET ao carregar, buscar e selecionar', async () => {
    const methods: string[] = []
    installViewerFetcher(methods)

    renderApp(['/viewer/projeto-1'])
    await screen.findByTestId('table-row-cliente')

    fireEvent.change(screen.getByLabelText('Buscar no dicionário'), { target: { value: 'pedido' } })
    await waitFor(() => expect(screen.getByTestId('table-row-pedido')).toBeTruthy())
    fireEvent.click(screen.getByTestId('table-row-pedido'))
    await screen.findByLabelText('Detalhe somente leitura')

    expect(methods.length).toBeGreaterThan(0)
    expect(methods.every((method) => method.toUpperCase() === 'GET')).toBe(true)
  })
})
