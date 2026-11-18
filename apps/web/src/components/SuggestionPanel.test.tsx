import { afterEach, describe, expect, test } from 'bun:test'
import type { AgentJob, AgentSuggestion, GenerateSuggestionsInput } from '../agent/api'
import type { UserRole } from '../api/types'
import type { Selection } from '../lib/selection'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'
import { errorResponse, installFetch, jsonResponse, readJsonBody } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { SuggestionPanel } from './SuggestionPanel'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function makeSuggestion(overrides: Partial<AgentSuggestion> = {}): AgentSuggestion {
  return {
    id: 'sug-1',
    projectId: 'projeto-1',
    jobId: 'job-1',
    itemType: 'column',
    itemId: 'col-email',
    tableId: 'table-users',
    suggestedDescription: 'Campo email da tabela users.',
    context: {
      table: { id: 'table-users', name: 'users', businessTerms: ['cliente'] },
      item: { type: 'column', id: 'col-email', name: 'email' },
      targets: [{ type: 'column', name: 'email', columnType: 'VARCHAR(100)' }],
      describedColumns: [{ name: 'username', type: 'VARCHAR(50)', description: 'Nome' }],
      foreignKeys: [],
    },
    status: 'pending',
    requestedBy: 'user-1',
    decidedBy: null,
    decidedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeJob(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    id: 'job-1',
    projectId: 'projeto-1',
    scope: 'project',
    tableId: null,
    status: 'queued',
    attempts: 0,
    requestedBy: 'user-1',
    error: null,
    stats: { targets: 2, created: 0, skipped: 0, tables: 2, tablesProcessed: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPanel(
  options: {
    role?: UserRole
    selection?: Selection
    tableIds?: Record<string, string>
    activeJobId?: string | null
    onJobStarted?: (jobId: string) => void
    onClose?: () => void
  } = {},
) {
  return renderWithClient(
    <SuggestionPanel
      projectId="projeto-1"
      selection={options.selection ?? { type: 'database' }}
      tableIds={options.tableIds ?? {}}
      role={options.role ?? 'MEMBER'}
      activeJobId={options.activeJobId ?? null}
      onJobStarted={options.onJobStarted ?? (() => {})}
      onClose={options.onClose ?? (() => {})}
    />,
  )
}

describe('SuggestionPanel', () => {
  test('mostra carregamento, estado vazio e ação de gerar', async () => {
    restoreCallbacks.push(installFetch(() => new Promise<Response>(() => {})))

    renderPanel()
    expect(screen.getByText('Carregando sugestões…')).toBeTruthy()

    cleanup()

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel()
    expect(await screen.findByText('Nenhuma sugestão pendente')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Sugerir descrições' }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('agent-pending-count').textContent).toContain('0')
  })

  test('mostra erro de carregamento', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return errorResponse('INTERNAL_ERROR', 'Falha ao listar.', 500)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel()
    expect(await screen.findByText('Não foi possível carregar as sugestões.')).toBeTruthy()
  })

  test('lista sugestões com prévia lado a lado', async () => {
    const tableSuggestion = makeSuggestion({
      id: 'sug-table',
      itemType: 'table',
      itemId: 'table-users',
      suggestedDescription: 'Tabela users do modelo de dados.',
      context: {
        table: { id: 'table-users', name: 'users', businessTerms: ['cliente'] },
        item: { type: 'table', id: 'table-users', name: 'users' },
        targets: [{ type: 'table', name: 'users' }],
        describedColumns: [{ name: 'username', type: 'VARCHAR(50)', description: 'Nome' }],
        foreignKeys: [],
      },
    })

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [makeSuggestion(), tableSuggestion] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel()

    const columnRow = await screen.findByTestId('suggestion-row-users-email')
    expect(within(columnRow).getByText('users / email')).toBeTruthy()
    expect(within(columnRow).getByText('Campo email da tabela users.')).toBeTruthy()
    expect(within(columnRow).getByText('VARCHAR(100)')).toBeTruthy()
    expect(within(columnRow).getByText('Termos de negócio: cliente')).toBeTruthy()
    expect(within(columnRow).getByText('Colunas já descritas: username')).toBeTruthy()

    const tableRow = screen.getByTestId('suggestion-row-table-users')
    expect(within(tableRow).getByText('Tabela users do modelo de dados.')).toBeTruthy()
    expect(screen.getByTestId('agent-pending-count').textContent).toContain('2')
  })

  test('ações em lote enviam os ids selecionados', async () => {
    const bodies: Array<{ ids: string[] }> = []

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [makeSuggestion(), makeSuggestion({ id: 'sug-2', itemId: 'col-id' })] })
        }
        if (url === '/api/projects/projeto-1/agent/suggestions/apply') {
          const body = await readJsonBody<{ ids: string[] }>(init)
          bodies.push(body)
          return jsonResponse({ applied: body.ids, skipped: [] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel()

    fireEvent.click(await screen.findByLabelText('Selecionar todas as sugestões'))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar selecionadas' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].ids.sort()).toEqual(['sug-1', 'sug-2'])
    expect(await screen.findByText('2 sugestões aplicadas.')).toBeTruthy()
  })

  test('edita antes de aplicar e envia o texto editado', async () => {
    const editBodies: Array<{ text: string }> = []
    const applyBodies: Array<{ ids: string[] }> = []
    let current = makeSuggestion()

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [current] })
        }
        if (url === '/api/projects/projeto-1/agent/suggestions/sug-1') {
          const body = await readJsonBody<{ text: string }>(init)
          editBodies.push(body)
          current = { ...current, suggestedDescription: body.text }
          return jsonResponse({ suggestion: current })
        }
        if (url === '/api/projects/projeto-1/agent/suggestions/apply') {
          const body = await readJsonBody<{ ids: string[] }>(init)
          applyBodies.push(body)
          return jsonResponse({ applied: body.ids, skipped: [] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel()

    const row = await screen.findByTestId('suggestion-row-users-email')
    fireEvent.click(within(row).getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Editar sugestão users / email'), {
      target: { value: 'Email de contato do usuário.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar edição' }))

    await waitFor(() => expect(editBodies).toEqual([{ text: 'Email de contato do usuário.' }]))
    expect(await screen.findByText('Sugestão atualizada.')).toBeTruthy()

    const refreshed = await screen.findByTestId('suggestion-row-users-email')
    expect(within(refreshed).getByText('Email de contato do usuário.')).toBeTruthy()
    fireEvent.click(within(refreshed).getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(applyBodies).toEqual([{ ids: ['sug-1'] }]))
  })

  test('solicita geração para o projeto inteiro pelo diálogo de escopo', async () => {
    const generateBodies: GenerateSuggestionsInput[] = []

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [] })
        }
        if (url === '/api/projects/projeto-1/agent/suggestions') {
          const body = await readJsonBody<GenerateSuggestionsInput>(init)
          generateBodies.push(body)
          return jsonResponse({ job: makeJob() }, 202)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel()

    fireEvent.click((await screen.findAllByRole('button', { name: 'Sugerir descrições' }))[0])
    expect(await screen.findByRole('dialog', { name: 'Sugerir descrições' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar sugestões' }))

    await waitFor(() => expect(generateBodies).toEqual([{ scope: 'project' }]))
  })

  test('usa o escopo da tabela quando a tabela selecionada está em table_ids', async () => {
    const generateBodies: GenerateSuggestionsInput[] = []

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [] })
        }
        if (url === '/api/projects/projeto-1/agent/suggestions') {
          const body = await readJsonBody<GenerateSuggestionsInput>(init)
          generateBodies.push(body)
          return jsonResponse({ job: makeJob({ scope: 'table', tableId: 'table-users' }) }, 202)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel({
      selection: { type: 'table', table: 'users' },
      tableIds: { users: 'table-users' },
    })

    fireEvent.click((await screen.findAllByRole('button', { name: 'Sugerir descrições' }))[0])
    fireEvent.click(screen.getByLabelText('Esta tabela (users)'))
    fireEvent.click(screen.getByRole('button', { name: 'Gerar sugestões' }))

    await waitFor(() => expect(generateBodies).toEqual([{ scope: 'table', tableId: 'table-users' }]))
  })

  test('mantém o escopo de tabela desabilitado quando nenhuma tabela está selecionada', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel({ tableIds: { users: 'table-users' } })

    fireEvent.click((await screen.findAllByRole('button', { name: 'Sugerir descrições' }))[0])

    const tableScope = screen.getByLabelText('Esta tabela') as HTMLInputElement
    expect(tableScope.disabled).toBe(true)
    expect(
      screen.getByText(
        'Selecione uma tabela na árvore que já tenha contexto conhecido pelo agente para usar este escopo.',
      ),
    ).toBeTruthy()
  })

  test('VIEWER vê a prévia sem ações de decisão', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects/projeto-1/agent/suggestions?status=pending') {
          return jsonResponse({ suggestions: [makeSuggestion()] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderPanel({ role: 'VIEWER' })

    expect(await screen.findByTestId('suggestion-row-users-email')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sugerir descrições' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByLabelText('Selecionar todas as sugestões')).toBeNull()
  })
})
