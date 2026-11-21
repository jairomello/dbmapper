import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import type { DiagramLayout, DiagramLayoutInput, UserRole } from '../api/types'
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

function stubDiagramRect(): void {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 700,
      width: 1000,
      height: 700,
      toJSON: () => ({}),
    } as DOMRect
  }
  restoreCallbacks.push(() => {
    Element.prototype.getBoundingClientRect = original
  })
}

const emptyDiagramLayout: DiagramLayout = {
  projectId: 'projeto-1',
  zones: [{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }],
  layouts: [
    {
      zoneName: 'Principal',
      positions: {},
      viewport: { x: 0, y: 0 },
      zoom: 1,
      updatedAt: null,
      updatedBy: null,
    },
  ],
}

function stubProjectWithDiagram(role: UserRole = 'MEMBER', layout: DiagramLayout = emptyDiagramLayout) {
  const project = sampleProject()
  const puts: DiagramLayoutInput[] = []
  const modelPuts: DatabaseModel[] = []

  restoreCallbacks.push(
    installFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse({ ...sampleUser, role })
      if (url === `/api/projects/${project.id}/diagram`) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as DiagramLayoutInput
          puts.push(body)
          return jsonResponse(layout)
        }
        return jsonResponse(layout)
      }
      if (url === `/api/projects/${project.id}` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { database: DatabaseModel }
        modelPuts.push(body.database)
        return jsonResponse({ ...project, database: body.database })
      }
      if (url === `/api/projects/${project.id}`) return jsonResponse(project)
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return { project, puts, modelPuts }
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

  test('o header abre o diálogo Gerar SQL', async () => {
    const project = sampleProject()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === `/api/projects/${project.id}`) return jsonResponse(project)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/project/projeto-1'])
    await screen.findByTestId('table-row-cliente')

    fireEvent.click(screen.getByTestId('workspace-ddl-button'))

    expect(await screen.findByRole('dialog', { name: 'Gerar SQL' })).toBeTruthy()
    expect(screen.getByLabelText('Dialeto')).toBeTruthy()
    expect(screen.getByLabelText('Modo')).toBeTruthy()
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

  test('alterna Editor/Diagrama mantendo o StatusBar e abre o editor na seleção', async () => {
    stubDiagramRect()
    stubProjectWithDiagram()
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByTestId('view-diagram'))

    expect(await screen.findByTestId('diagram-canvas')).toBeTruthy()
    expect(screen.getByTestId('coverage-tables')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Barra de cobertura' })).toBeTruthy()
    expect(screen.queryByTestId('diagram-editor-panel')).toBeNull()

    fireEvent.click(await screen.findByTestId('column-row-pedido-id'))

    await waitFor(() => expect(screen.getByTestId('diagram-editor-panel')).toBeTruthy())
    expect((screen.getByLabelText('Descrição') as HTMLTextAreaElement).value).toBe('Identificador do pedido')

    fireEvent.click(screen.getByTestId('view-editor'))
    await waitFor(() => expect(screen.queryByTestId('diagram-canvas')).toBeNull())
    expect((screen.getByLabelText('Descrição') as HTMLTextAreaElement).value).toBe('Identificador do pedido')
  })

  test('sincroniza a seleção do canvas com a árvore e da árvore com o card', async () => {
    stubDiagramRect()
    stubProjectWithDiagram()
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-node-cliente')

    fireEvent.click(screen.getByLabelText('Selecionar tabela cliente'))
    await waitFor(() => expect(screen.getByTestId('table-row-cliente').getAttribute('data-active')).toBe('true'))
    expect(screen.getByTestId('diagram-node-cliente').getAttribute('data-active')).toBe('true')

    fireEvent.click(screen.getByTestId('column-row-pedido-cliente_id'))
    await waitFor(() => expect(screen.getByTestId('diagram-node-pedido').getAttribute('data-active')).toBe('true'))
    expect(screen.getByTestId('diagram-column-pedido-cliente_id').getAttribute('data-active')).toBe('true')
    expect(screen.getByTestId('column-row-pedido-cliente_id').getAttribute('data-active')).toBe('true')
  })

  test('VIEWER vê o diagrama somente leitura, sem controles e sem gravar layout ou modelo', async () => {
    stubDiagramRect()
    const stub = stubProjectWithDiagram('VIEWER')
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-node-cliente')

    const wrapper = screen.getByTestId('diagram-node-cliente').closest('.react-flow__node')
    expect(wrapper?.className).not.toContain('draggable')
    expect(screen.getByTestId('diagram-save-status').textContent).toBe('Somente leitura')
    expect(screen.queryByTestId('diagram-add-table')).toBeNull()
    expect(screen.queryByTestId('diagram-relationship-mode')).toBeNull()
    expect(screen.queryByLabelText('Adicionar coluna em cliente')).toBeNull()
    expect(screen.queryByLabelText('Editar tabela cliente')).toBeNull()
    expect(screen.queryByLabelText('Editar coluna cliente.id')).toBeNull()
    expect(screen.queryByLabelText('Excluir coluna cliente.id')).toBeNull()

    fireEvent.click(screen.getByLabelText('Selecionar coluna cliente.id'))
    await waitFor(() => expect(screen.getByTestId('diagram-editor-panel')).toBeTruthy())
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(stub.puts).toHaveLength(0)
    expect(stub.modelPuts).toHaveLength(0)
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

function stubWorkspaceEditing(options: { holdPut?: boolean; failPut?: boolean } = {}) {
  const project = sampleProject()
  const modelPuts: DatabaseModel[] = []
  let projectGets = 0
  let releasePut: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    releasePut = resolve
  })

  restoreCallbacks.push(
    installFetch(async (url, init) => {
      if (url === '/api/auth/me') return jsonResponse(sampleUser)
      if (url === `/api/projects/${project.id}/diagram`) {
        if (init?.method === 'PUT') {
          return jsonResponse(emptyDiagramLayout)
        }
        return jsonResponse(emptyDiagramLayout)
      }
      if (url === `/api/projects/${project.id}` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { database: DatabaseModel }
        modelPuts.push(body.database)
        if (options.holdPut) await gate
        if (options.failPut) return errorResponse('VALIDATION_ERROR', 'Modelo inválido.', 400)
        return jsonResponse({ ...project, database: body.database })
      }
      if (url === `/api/projects/${project.id}`) {
        projectGets += 1
        return jsonResponse(project)
      }
      if (url === `/api/projects/${project.id}/agent/suggestions?status=pending`) {
        return jsonResponse({ suggestions: [] })
      }
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return {
    modelPuts,
    projectGets: () => projectGets,
    releasePut: () => releasePut?.(),
  }
}

describe('WorkspacePage diagram editing status', () => {
  test('mostra Salvando... durante o PUT e Salvo às: HH:MM no sucesso', async () => {
    stubDiagramRect()
    const stub = stubWorkspaceEditing({ holdPut: true })
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-node-cliente')

    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() => expect(screen.getByTestId('diagram-save-indicator').textContent).toBe('Salvando...'))
    expect(stub.modelPuts).toHaveLength(1)

    stub.releasePut()
    await waitFor(() =>
      expect(screen.getByTestId('diagram-save-indicator').textContent).toMatch(/^Salvo às: \d{2}:\d{2}$/),
    )
    expect(await screen.findByTestId('table-row-nova_tabela')).toBeTruthy()
  })

  test('mostra o erro do envelope e re-sincroniza o modelo após PUT rejeitado', async () => {
    stubDiagramRect()
    const stub = stubWorkspaceEditing({ failPut: true })
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    const initialGets = stub.projectGets()
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-node-cliente')

    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() =>
      expect(screen.getByTestId('diagram-save-indicator').textContent).toBe('Falha ao salvar: Modelo inválido.'),
    )
    expect(stub.modelPuts).toHaveLength(1)
    await waitFor(() => expect(stub.projectGets()).toBeGreaterThan(initialGets))
    await waitFor(() => expect(screen.queryByTestId('diagram-node-nova_tabela')).toBeNull())
  })

  test('bloqueia a edição do canvas enquanto o UpdateWizard está aberto', async () => {
    stubDiagramRect()
    stubWorkspaceEditing()
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar modelo' }))
    expect(await screen.findByRole('dialog', { name: 'Wizard de atualização' })).toBeTruthy()

    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-node-cliente')

    expect(screen.queryByTestId('diagram-add-table')).toBeNull()
    expect(screen.queryByTestId('diagram-relationship-mode')).toBeNull()
    expect(screen.queryByTestId('diagram-undo')).toBeNull()
  })
})

describe('WorkspacePage diagram zones', () => {
  function zonedLayout(): DiagramLayout {
    return {
      projectId: 'projeto-1',
      zones: [
        { name: 'Principal', tabOrder: 0, members: ['cliente'] },
        { name: 'Geografia', tabOrder: 1, members: ['pedido'] },
      ],
      layouts: [
        {
          zoneName: 'Principal',
          positions: { cliente: { x: 100, y: 100 } },
          viewport: { x: 0, y: 0 },
          zoom: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedBy: 'user-1',
        },
        {
          zoneName: 'Geografia',
          positions: { pedido: { x: 300, y: 200 } },
          viewport: { x: 0, y: 0 },
          zoom: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedBy: 'user-1',
        },
      ],
    }
  }

  test('selecionar tabela da árvore troca para a aba da zona dela', async () => {
    stubDiagramRect()
    stubProjectWithDiagram('MEMBER', zonedLayout())
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-zone-tab-Geografia')

    fireEvent.click(screen.getByTestId('table-row-pedido'))
    await waitFor(() =>
      expect(screen.getByTestId('diagram-zone-tab-Geografia').getAttribute('aria-selected')).toBe('true'),
    )
    expect(await screen.findByTestId('diagram-node-pedido')).toBeTruthy()
  })

  test('mostra a contagem de tabelas no cabeçalho e atualiza ao criar e excluir', async () => {
    stubDiagramRect()
    stubProjectWithDiagram()
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-cliente')
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-node-cliente')
    expect(screen.getByTestId('diagram-table-count').textContent).toBe('2 tabelas')

    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() => expect(screen.getByTestId('diagram-table-count').textContent).toBe('3 tabelas'))

    const node = (await screen.findByTestId('diagram-node-nova_tabela')).closest('.react-flow__node')
    if (!(node instanceof HTMLElement)) throw new Error('Wrapper do card nova_tabela não encontrado.')
    fireEvent.contextMenu(node, { clientX: 120, clientY: 80, button: 2 })
    fireEvent.click(await screen.findByTestId('canvas-menu-delete-table'))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir tabela' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(screen.getByTestId('diagram-table-count').textContent).toBe('2 tabelas'))
  })

  test('tabela fora do diagrama aparece marcada na árvore e pode ser adicionada à aba atual', async () => {
    stubDiagramRect()
    const layout: DiagramLayout = {
      projectId: 'projeto-1',
      zones: [{ name: 'Principal', tabOrder: 0, members: ['cliente'] }],
      layouts: [
        {
          zoneName: 'Principal',
          positions: { cliente: { x: 100, y: 100 } },
          viewport: { x: 0, y: 0 },
          zoom: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedBy: 'user-1',
        },
      ],
    }
    stubProjectWithDiagram('MEMBER', layout)
    renderApp(['/project/projeto-1'])

    await screen.findByTestId('table-row-pedido')
    fireEvent.click(screen.getByTestId('view-diagram'))
    await screen.findByTestId('diagram-zone-tab-Principal')
    await waitFor(() => expect(screen.getByTestId('table-outside-pedido')).toBeTruthy())

    fireEvent.click(screen.getByTestId('table-add-to-zone-pedido'))
    expect(await screen.findByTestId('diagram-node-pedido')).toBeTruthy()
  })
})
