import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { DdlDialect, DdlGeneration, DdlMode, DdlRenameMapping } from '../api/types'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { cleanup, fireEvent, screen, waitFor } from '../test/setup'
import { DdlDialog } from './DdlDialog'

const BASELINE_MISSING_MESSAGE =
  'Este projeto ainda não tem baseline capturado. Use o modo "create" ou marque o banco como sincronizado.'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

interface DdlRequest {
  dialect: string
  mode: string
  renames: DdlRenameMapping | null
}

function parseDdlRequest(url: string): DdlRequest {
  const parsed = new URL(url, 'http://localhost')
  const rawRenames = parsed.searchParams.get('renames')
  return {
    dialect: parsed.searchParams.get('dialect') ?? '',
    mode: parsed.searchParams.get('mode') ?? '',
    renames: rawRenames ? (JSON.parse(rawRenames) as DdlRenameMapping) : null,
  }
}

function generation(
  overrides: Partial<DdlGeneration> & Pick<DdlGeneration, 'dialect' | 'mode' | 'script'>,
): DdlGeneration {
  return {
    statements: overrides.script ? overrides.script.split(';\n') : [],
    destructive: [],
    warnings: [],
    ...overrides,
  }
}

function installDdlHandler(
  options: {
    onDdl?: (request: DdlRequest) => Response | Promise<Response>
    onBaseline?: () => Response | Promise<Response>
    onReadBaseline?: () => Response | Promise<Response>
  } = {},
) {
  const ddlRequests: DdlRequest[] = []
  const baselineRequests: string[] = []

  restoreCallbacks.push(
    installFetch(async (url, init) => {
      if (url.startsWith('/api/projects/projeto-1/ddl?')) {
        const request = parseDdlRequest(url)
        ddlRequests.push(request)
        if (options.onDdl) return options.onDdl(request)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }
      if (url === '/api/projects/projeto-1/ddl/baseline' && (init?.method ?? 'GET') === 'GET') {
        if (options.onReadBaseline) return options.onReadBaseline()
        return jsonResponse({ baseline: null })
      }
      if (url === '/api/projects/projeto-1/ddl/baseline' && init?.method === 'PUT') {
        baselineRequests.push(url)
        if (options.onBaseline) return options.onBaseline()
        return jsonResponse({
          baseline: {
            projectId: 'projeto-1',
            capturedAt: '2026-02-03T10:00:00.000Z',
            capturedBy: 'user-1',
          },
        })
      }
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return { ddlRequests, baselineRequests }
}

function renderDialog(role: 'MEMBER' | 'VIEWER' | 'ADMIN' = 'MEMBER') {
  return renderWithClient(<DdlDialog projectId="projeto-1" role={role} onClose={() => {}} />)
}

describe('DdlDialog', () => {
  test('troca dialeto e modo, gera o script e mostra mensagem própria sem baseline', async () => {
    const stub = installDdlHandler({
      onDdl: (request) => {
        if (request.mode === 'migration') {
          return errorResponse('DDL_BASELINE_MISSING', BASELINE_MISSING_MESSAGE, 409)
        }
        const script =
          request.dialect === 'mysql' ? 'CREATE TABLE `cliente` (id INT);' : 'CREATE TABLE "cliente" (id INTEGER);'
        return jsonResponse(generation({ dialect: request.dialect as DdlDialect, mode: 'create', script }))
      },
    })

    renderDialog()

    fireEvent.change(screen.getByLabelText('Dialeto'), { target: { value: 'mysql' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))

    const preview = (await screen.findByTestId('ddl-script-preview')) as HTMLTextAreaElement
    await waitFor(() => expect(preview.value).toContain('CREATE TABLE `cliente`'))
    expect(stub.ddlRequests[stub.ddlRequests.length - 1]).toMatchObject({ dialect: 'mysql', mode: 'create' })

    fireEvent.change(screen.getByLabelText('Modo'), { target: { value: 'migration' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))

    const alert = await screen.findByTestId('ddl-error')
    expect(alert.textContent).toContain('ainda não tem baseline capturado')
    expect(stub.ddlRequests[stub.ddlRequests.length - 1]).toMatchObject({ dialect: 'mysql', mode: 'migration' })
  })

  test('ao abrir exibe a data do baseline existente e não mostra "Ainda não capturado"', async () => {
    const capturedAt = '2026-02-03T10:00:00.000Z'
    installDdlHandler({
      onReadBaseline: () =>
        jsonResponse({
          baseline: {
            projectId: 'projeto-1',
            capturedAt,
            capturedBy: 'user-1',
            database: { name: 'app', description: '', business_terms: [], reviewed: false, tables: [] },
          },
        }),
    })

    renderDialog()
    const status = await screen.findByTestId('ddl-baseline-status')
    const expected = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(capturedAt),
    )

    await waitFor(() => expect(status.textContent).toContain('Sincronizado em'))
    expect(status.textContent).toContain(expected)
    expect(screen.queryByText('Ainda não capturado')).toBeNull()
  })

  test('mostra o estado de carregamento enquanto gera o script', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    installDdlHandler({
      onDdl: async (request) => {
        await gate
        return jsonResponse(generation({ dialect: request.dialect as DdlDialect, mode: 'create', script: 'SELECT 1;' }))
      },
    })

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))

    expect(await screen.findByTestId('ddl-loading')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gerando…' })).toBeTruthy()

    release()
    expect(await screen.findByTestId('ddl-script-preview')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('ddl-loading')).toBeNull())
  })

  test('mostra preview somente leitura, destrutivos e avisos; create não exibe avisos de rename', async () => {
    const createScript = 'CREATE TABLE "cliente" (id INTEGER);'
    installDdlHandler({
      onDdl: (request) => {
        if (request.mode === 'create') {
          return jsonResponse(
            generation({
              dialect: request.dialect as DdlDialect,
              mode: 'create',
              script: createScript,
              warnings: ['Tipo desconhecido "jsonb" na coluna cliente.meta; emitido como está.'],
            }),
          )
        }
        return jsonResponse(
          generation({
            dialect: request.dialect as DdlDialect,
            mode: 'migration',
            script: 'ALTER TABLE "cliente" ADD COLUMN "meta" JSONB;\nDROP TABLE "legado";',
            destructive: ['DROP TABLE "legado"'],
            warnings: ['Tipo desconhecido "jsonb" na coluna cliente.meta; emitido como está.'],
          }),
        )
      },
    })

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))

    const preview = (await screen.findByTestId('ddl-script-preview')) as HTMLTextAreaElement
    expect(preview.readOnly).toBe(true)
    expect(preview.className).toContain('font-mono')
    expect(preview.value).toBe(createScript)
    expect((await screen.findByTestId('ddl-warning-0')).textContent).toContain('jsonb')
    expect(screen.queryByTestId('ddl-destructive')).toBeNull()
    expect(screen.queryByTestId('ddl-baseline-warning')).toBeNull()
    expect(screen.queryByTestId('ddl-table-renames')).toBeNull()
    expect(screen.queryByText(/Renomeação/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Modo'), { target: { value: 'migration' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))

    await waitFor(() =>
      expect((screen.getByTestId('ddl-script-preview') as HTMLTextAreaElement).value).toContain('DROP TABLE "legado"'),
    )
    expect(screen.getByTestId('ddl-destructive-0').textContent).toContain('DROP TABLE "legado"')
    expect(screen.getByTestId('ddl-baseline-warning')).toBeTruthy()
    expect(screen.getByTestId('ddl-table-renames')).toBeTruthy()
    expect(screen.getByTestId('ddl-column-renames')).toBeTruthy()
  })

  test('aplica o mapeamento explícito de renomeações na nova geração', async () => {
    const stub = installDdlHandler({
      onDdl: (request) => {
        const statements: string[] = []
        if (request.renames?.tables?.cliente === 'clientes') {
          statements.push('ALTER TABLE "cliente" RENAME TO "clientes"')
        }
        if (request.renames?.columns?.['cliente.cpf'] === 'documento') {
          statements.push('ALTER TABLE "clientes" RENAME COLUMN "cpf" TO "documento"')
        }
        return jsonResponse(
          generation({
            dialect: request.dialect as DdlDialect,
            mode: request.mode as DdlMode,
            statements,
            script: statements.length > 0 ? `${statements.join(';\n')};` : '',
          }),
        )
      },
    })

    renderDialog()
    fireEvent.change(screen.getByLabelText('Modo'), { target: { value: 'migration' } })

    fireEvent.change(screen.getByLabelText('Tabela de origem 1'), { target: { value: 'cliente' } })
    fireEvent.change(screen.getByLabelText('Novo nome da tabela 1'), { target: { value: 'clientes' } })
    fireEvent.change(screen.getByLabelText('Coluna de origem 1'), { target: { value: 'cliente.cpf' } })
    fireEvent.change(screen.getByLabelText('Novo nome da coluna 1'), { target: { value: 'documento' } })

    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))

    const preview = (await screen.findByTestId('ddl-script-preview')) as HTMLTextAreaElement
    await waitFor(() => expect(preview.value).toContain('RENAME TO "clientes"'))
    expect(preview.value).toContain('RENAME COLUMN "cpf" TO "documento"')

    const last = stub.ddlRequests[stub.ddlRequests.length - 1]
    expect(last.renames).toEqual({
      tables: { cliente: 'clientes' },
      columns: { 'cliente.cpf': 'documento' },
    })
  })

  test('copia e baixa exatamente o conteúdo do preview', async () => {
    const script = 'CREATE TABLE "cliente" (id INTEGER);'
    installDdlHandler({
      onDdl: (request) =>
        jsonResponse(generation({ dialect: request.dialect as DdlDialect, mode: request.mode as DdlMode, script })),
    })

    const clipboardWrites: string[] = []
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          clipboardWrites.push(text)
        },
      },
    })
    restoreCallbacks.push(() => {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    })

    const blobs: Blob[] = []
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob)
      return 'blob:ddl'
    }
    URL.revokeObjectURL = () => {}
    restoreCallbacks.push(() => {
      URL.createObjectURL = originalCreateObjectUrl
      URL.revokeObjectURL = originalRevokeObjectUrl
    })

    const downloads: Array<{ download: string }> = []
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function click() {
      downloads.push({ download: this.download })
    }
    restoreCallbacks.push(() => {
      HTMLAnchorElement.prototype.click = originalClick
    })

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar script' }))
    await screen.findByTestId('ddl-script-preview')

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(clipboardWrites).toEqual([script]))

    fireEvent.click(screen.getByRole('button', { name: 'Baixar .sql' }))
    await waitFor(() => expect(blobs).toHaveLength(1))
    expect(await blobs[0].text()).toBe(script)
    expect(downloads).toHaveLength(1)
    expect(downloads[0].download).toBe('ddl-postgres-create.sql')
  })

  test('MEMBER marca o banco como sincronizado e invalida queries; VIEWER não vê a ação', async () => {
    const capturedAt = '2026-02-03T10:00:00.000Z'
    const stub = installDdlHandler({
      onBaseline: () => jsonResponse({ baseline: { projectId: 'projeto-1', capturedAt, capturedBy: 'user-1' } }),
    })

    const { queryClient } = renderDialog('MEMBER')
    const invalidate = spyOn(queryClient, 'invalidateQueries')

    expect(screen.getByTestId('ddl-baseline-action')).toBeTruthy()
    fireEvent.click(screen.getByTestId('ddl-baseline-action'))

    await waitFor(() => expect(stub.baselineRequests).toHaveLength(1))
    await waitFor(() => expect(screen.getByTestId('ddl-baseline-status').textContent).toContain('Sincronizado em'))
    expect(invalidate.mock.calls.length).toBeGreaterThan(0)
    expect(invalidate.mock.calls.some(([arg]) => JSON.stringify(arg).includes('projeto-1'))).toBe(true)

    cleanup()

    installDdlHandler()
    renderDialog('VIEWER')

    expect(await screen.findByRole('dialog', { name: 'Gerar SQL' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gerar script' })).toBeTruthy()
    expect(screen.queryByTestId('ddl-baseline-action')).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('ddl-baseline-status').textContent).toBe('Ainda não capturado'),
    )
  })
})
