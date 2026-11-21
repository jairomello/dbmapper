import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { useState } from 'react'
import type { DiagramLayout, DiagramLayoutInput, DiagramZoneInput, DiagramZoneLayout } from '../api/types'
import { DIAGRAM_TABLE_MIME } from '../diagram/zones'
import type { Selection } from '../lib/selection'
import { sampleDatabase, sampleProject } from '../test/fixtures'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { cleanup, fireEvent, render, screen, waitFor, within } from '../test/setup'
import { DiagramCanvas } from './DiagramCanvas'
import { SemanticTree } from './SemanticTree'

const restoreCallbacks: Array<() => void> = []
const DEFAULT_MEMBERS = ['cliente', 'pedido']

function databaseWithConfig(): DatabaseModel {
  const database = sampleDatabase()
  database.tables.push({
    name: 'config',
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    relationships: { parents: [], children: [] },
    columns: [
      {
        name: 'id',
        type: 'serial',
        primary_key: true,
        foreign_key: false,
        description: '',
        business_terms: [],
        reviewed: false,
        status: 'UNCHANGED',
      },
    ],
  })
  return database
}

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function principalLayout(overrides: Partial<DiagramZoneLayout> = {}): DiagramZoneLayout {
  return {
    zoneName: 'Principal',
    positions: {},
    viewport: { x: 0, y: 0 },
    zoom: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'user-1',
    ...overrides,
  }
}

function emptyLayout(overrides: Partial<DiagramZoneLayout> = {}): DiagramLayout {
  return {
    projectId: 'projeto-1',
    zones: [{ name: 'Principal', tabOrder: 0, members: [...DEFAULT_MEMBERS] }],
    layouts: [principalLayout(overrides)],
  }
}

function twoZoneLayout(
  principal: Partial<DiagramZoneLayout> = {},
  geografia: Partial<DiagramZoneLayout> = {},
): DiagramLayout {
  return {
    projectId: 'projeto-1',
    zones: [
      { name: 'Principal', tabOrder: 0, members: ['cliente'] },
      { name: 'Geografia', tabOrder: 1, members: ['pedido'] },
    ],
    layouts: [
      principalLayout({ ...principal, positions: { cliente: { x: 100, y: 100 }, ...principal.positions } }),
      {
        zoneName: 'Geografia',
        positions: { pedido: { x: 420, y: 300 }, ...geografia.positions },
        viewport: { x: 0, y: 0 },
        zoom: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: 'user-1',
        ...geografia,
      },
    ],
  }
}

function layoutFor(input: DiagramLayoutInput, zone = 'Principal'): DiagramZoneLayout | undefined {
  return input.layouts.find((layout) => layout.zoneName === zone) as DiagramZoneLayout | undefined
}

function layoutWithMembers(members: string[]): DiagramLayout {
  return {
    projectId: 'projeto-1',
    zones: [{ name: 'Principal', tabOrder: 0, members }],
    layouts: [principalLayout()],
  }
}

function zoneFor(input: DiagramLayoutInput, table: string): DiagramZoneInput | undefined {
  return input.zones?.find((zone) => (zone.members ?? []).includes(table))
}

function stubRect(): void {
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

function stubLayout(layout: DiagramLayout, puts: DiagramLayoutInput[] = []) {
  restoreCallbacks.push(
    installFetch((url, init) => {
      if (url !== '/api/projects/projeto-1/diagram') return jsonResponse({}, 404)
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)) as DiagramLayoutInput)
        return jsonResponse(layout)
      }
      return jsonResponse(layout)
    }),
  )
  return puts
}

function renderCanvas(canEdit = true, options: { locked?: boolean } = {}) {
  return renderWithClient(
    <div style={{ width: 1000, height: 700 }}>
      <DiagramCanvas
        projectId="projeto-1"
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        canEdit={canEdit}
        locked={options.locked}
      />
    </div>,
  )
}

function nodeWrapper(table: string): HTMLElement {
  const node = screen.getByTestId(`diagram-node-${table}`).closest('.react-flow__node')
  if (!(node instanceof HTMLElement)) throw new Error(`Wrapper do card ${table} não encontrado.`)
  return node
}

function dragTable(table: string, from = { x: 100, y: 100 }, to = { x: 260, y: 220 }) {
  const card = screen.getByTestId(`diagram-node-${table}`)
  const handle = card.querySelector('.diagram-drag-handle')
  if (!(handle instanceof HTMLElement)) throw new Error('Alça de arraste não encontrada.')
  const fire = (target: EventTarget, type: string, x: number, y: number) => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        view: window,
      }),
    )
  }
  fire(handle, 'mousedown', from.x, from.y)
  fire(window, 'mousemove', (from.x + to.x) / 2, (from.y + to.y) / 2)
  fire(window, 'mousemove', to.x, to.y)
  fire(window, 'mouseup', to.x, to.y)
}

describe('DiagramCanvas', () => {
  test('renderiza um card por tabela, colunas PK/FK e a aresta do relacionamento', async () => {
    stubLayout(emptyLayout())
    renderCanvas()

    expect(await screen.findByTestId('diagram-node-cliente')).toBeTruthy()
    expect(screen.getByTestId('diagram-node-pedido')).toBeTruthy()
    expect(screen.getByTestId('diagram-column-pedido-id').textContent).toContain('id')
    expect(screen.getByTestId('diagram-column-pedido-cliente_id').textContent).toContain('cliente_id')
    expect(screen.getByTestId('diagram-pk-pedido-id').textContent).toBe('PK')
    expect(screen.getByTestId('diagram-fk-pedido-cliente_id').textContent).toBe('FK')
    expect(document.querySelectorAll('.react-flow__edge')).toHaveLength(1)
  })

  test('aplica posições salvas e ignora entrada órfã sem erro', async () => {
    stubLayout(
      emptyLayout({
        positions: {
          cliente: { x: 111, y: 77 },
          pedido: { x: 480, y: 90 },
          fantasma: { x: 999, y: 999 },
        },
      }),
    )
    renderCanvas()

    await waitFor(() => expect(nodeWrapper('cliente').style.transform).toContain('translate(111px,77px)'))
    expect(nodeWrapper('pedido').style.transform).toContain('translate(480px,90px)')
    expect(screen.queryByText('Não foi possível carregar o layout salvo.')).toBeNull()
  })

  test('busca destaca correspondências e mantém os demais cards visíveis', async () => {
    stubLayout(emptyLayout())
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.change(screen.getByLabelText('Buscar no diagrama'), { target: { value: 'cliente' } })

    await waitFor(() =>
      expect(screen.getByTestId('diagram-node-cliente').getAttribute('data-search-match')).toBe('true'),
    )
    expect(screen.getByTestId('diagram-node-pedido')).toBeTruthy()
    expect(screen.getByTestId('diagram-node-pedido').getAttribute('data-search-match')).toBe('true')
    expect(screen.getByTestId('diagram-column-pedido-cliente_id').getAttribute('data-search-match')).toBe('true')
    expect(screen.getByTestId('diagram-column-pedido-id').getAttribute('data-search-match')).toBe('false')
  })

  test('arrastar um card persiste posições com debounce e mostra o indicador Salvo às', async () => {
    stubRect()
    const puts = stubLayout(emptyLayout())
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    dragTable('cliente')

    await waitFor(() => expect(puts.length).toBeGreaterThan(0), { timeout: 3000 })
    expect(layoutFor(puts[0])?.positions.cliente).not.toEqual({ x: 80, y: 80 })
    expect(layoutFor(puts[0])?.positions.pedido).toEqual({ x: 420, y: 80 })
    await waitFor(() => expect(screen.getByTestId('diagram-save-status').textContent).toContain('Salvo às:'))
    expect(screen.getByTestId('diagram-save-status').textContent).not.toContain('Salvando...')
  })

  test('VIEWER não arrasta nem dispara PUT do layout', async () => {
    stubRect()
    const puts = stubLayout(emptyLayout())
    renderCanvas(false)

    await screen.findByTestId('diagram-node-cliente')
    expect(nodeWrapper('cliente').className).not.toContain('draggable')
    expect(screen.getByTestId('diagram-save-status').textContent).toBe('Somente leitura')
    const before = nodeWrapper('cliente').style.transform

    dragTable('cliente')
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(puts).toHaveLength(0)
    expect(nodeWrapper('cliente').style.transform).toBe(before)
  })

  test('VIEWER não vê controles nem menu de edição e não dispara nenhum save', async () => {
    stubRect()
    const layout = emptyLayout()
    const writes: string[] = []

    restoreCallbacks.push(
      installFetch((url, init) => {
        const method = init?.method ?? 'GET'
        if (method !== 'GET') writes.push(`${method} ${url}`)
        if (url === '/api/projects/projeto-1/diagram') return jsonResponse(layout)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderCanvas(false)
    await screen.findByTestId('diagram-node-cliente')

    expect(screen.getByTestId('diagram-save-status').textContent).toBe('Somente leitura')
    expect(screen.queryByTestId('diagram-add-table')).toBeNull()
    expect(screen.queryByTestId('diagram-relationship-mode')).toBeNull()
    expect(screen.queryByTestId('diagram-undo')).toBeNull()
    expect(screen.queryByTestId('diagram-redo')).toBeNull()
    expect(screen.queryByLabelText('Adicionar coluna em cliente')).toBeNull()
    expect(screen.queryByLabelText('Editar tabela cliente')).toBeNull()
    expect(screen.queryByLabelText('Editar coluna cliente.id')).toBeNull()
    expect(screen.queryByLabelText('Excluir coluna cliente.id')).toBeNull()
    expect(screen.queryByTestId('diagram-relationships-pedido')).toBeNull()
    expect(screen.queryByTestId(/^diagram-edge-delete-/)).toBeNull()

    fireEvent.contextMenu(pane(), { clientX: 300, clientY: 220, button: 2 })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(nodeWrapper('cliente'), { clientX: 120, clientY: 80, button: 2 })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByLabelText('Selecionar coluna cliente.id'))
    dragTable('cliente')
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(writes).toEqual([])
  })
})

function stubEditing(layout: DiagramLayout = emptyLayout(), options: { holdModelPut?: boolean } = {}) {
  const project = sampleProject()
  const modelPuts: DatabaseModel[] = []
  const layoutPuts: DiagramLayoutInput[] = []
  let currentLayout = layout
  let releaseModel: (() => void) | null = null
  const modelGate = options.holdModelPut
    ? new Promise<void>((resolve) => {
        releaseModel = resolve
      })
    : null

  restoreCallbacks.push(
    installFetch(async (url, init) => {
      if (url === '/api/projects/projeto-1/diagram') {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as DiagramLayoutInput
          layoutPuts.push(body)
          currentLayout = {
            projectId: 'projeto-1',
            zones:
              body.zones?.map((zone) => ({
                name: zone.name,
                tabOrder: zone.tabOrder ?? 0,
                members: zone.members ?? [],
              })) ?? currentLayout.zones,
            layouts:
              body.layouts.map((entry) => ({
                zoneName: entry.zoneName,
                positions: entry.positions ?? {},
                viewport: entry.viewport ?? { x: 0, y: 0 },
                zoom: entry.zoom ?? 1,
                updatedAt: new Date().toISOString(),
                updatedBy: 'user-1',
              })) ?? currentLayout.layouts,
          }
          return jsonResponse(currentLayout)
        }
        return jsonResponse(currentLayout)
      }
      if (url === `/api/projects/${project.id}` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { database: DatabaseModel }
        modelPuts.push(body.database)
        if (modelGate) await modelGate
        return jsonResponse({ ...project, database: body.database })
      }
      if (url === `/api/projects/${project.id}`) return jsonResponse(project)
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return {
    modelPuts,
    layoutPuts,
    project,
    releaseModelPut: () => releaseModel?.(),
  }
}

function pane(): HTMLElement {
  const element = document.querySelector('.react-flow__pane')
  if (!(element instanceof HTMLElement)) throw new Error('Pane do diagrama não encontrada.')
  return element
}

function tableByNameOrThrow(database: DatabaseModel, name: string) {
  const table = database.tables.find((candidate) => candidate.name === name)
  if (!table) throw new Error(`Tabela ${name} não encontrada.`)
  return table
}

function connectHandles(source: string, target: string) {
  const sourceHandle = nodeWrapper(source).querySelector('.react-flow__handle.source')
  const targetHandle = nodeWrapper(target).querySelector('.react-flow__handle.target')
  if (!(sourceHandle instanceof HTMLElement) || !(targetHandle instanceof HTMLElement)) {
    throw new Error('Handles de conexão não encontrados.')
  }
  const original = document.elementFromPoint
  document.elementFromPoint = () => targetHandle
  restoreCallbacks.push(() => {
    document.elementFromPoint = original
  })
  const fire = (element: EventTarget, type: string, x: number, y: number) => {
    element.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        view: window,
      }),
    )
  }
  fire(sourceHandle, 'mousedown', 10, 10)
  fire(document, 'mousemove', 200, 120)
  fire(document, 'mouseup', 200, 120)
}

function openRelationship(source: string, target: string) {
  fireEvent.click(screen.getByTestId('diagram-relationship-mode'))
  fireEvent.click(screen.getByLabelText(`Escolher tabela ${source} para relacionamento`))
  fireEvent.click(screen.getByLabelText(`Escolher tabela ${target} para relacionamento`))
}

describe('DiagramCanvas editing', () => {
  test('menu de contexto cria tabela nas coordenadas do clique e faz um único PUT', async () => {
    stubRect()
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.contextMenu(pane(), { clientX: 300, clientY: 220, button: 2 })

    fireEvent.click(await screen.findByTestId('canvas-menu-add-table'))
    await waitFor(() => expect(modelPuts).toHaveLength(1))

    expect(modelPuts[0].tables.map((table) => table.name)).toContain('nova_tabela')
    expect(await screen.findByTestId('diagram-node-nova_tabela')).toBeTruthy()
    expect(nodeWrapper('nova_tabela').style.transform).toContain('translate(300px,220px)')
  })

  test('botão da toolbar adiciona tabela e o lock esconde os controles', async () => {
    stubRect()
    const lockedStub = stubEditing()
    const view = renderCanvas(true, { locked: true })

    await screen.findByTestId('diagram-node-cliente')
    expect(screen.queryByTestId('diagram-add-table')).toBeNull()
    fireEvent.contextMenu(pane(), { clientX: 300, clientY: 220 })
    expect(screen.queryByTestId('canvas-menu-add-table')).toBeNull()
    expect(lockedStub.modelPuts).toHaveLength(0)

    view.unmount()
    const unlockedStub = stubEditing()
    renderCanvas()
    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByTestId('diagram-add-table'))

    await waitFor(() => expect(unlockedStub.modelPuts).toHaveLength(1))
    expect(unlockedStub.modelPuts[0].tables.map((table) => table.name)).toContain('nova_tabela')
  })

  test('exclui tabela pelo menu de contexto apenas após confirmação', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.contextMenu(nodeWrapper('cliente'), { clientX: 120, clientY: 80, button: 2 })
    fireEvent.click(await screen.findByTestId('canvas-menu-delete-table'))

    const dialog = await screen.findByRole('dialog', { name: 'Excluir tabela' })
    expect(modelPuts).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    expect(modelPuts[0].tables.map((table) => table.name)).toEqual(['pedido'])
    expect(screen.queryByTestId('diagram-node-cliente')).toBeNull()
  })

  test('adiciona coluna, bloqueia nome duplicado e exclui com confirmação', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByLabelText('Adicionar coluna em cliente'))
    await screen.findByLabelText('Nome da coluna')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar coluna' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Informe o nome da coluna.')
    expect(modelPuts).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Nome da coluna'), { target: { value: 'id' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar coluna' }))

    expect((await screen.findByRole('alert')).textContent).toContain('já existe')
    expect(modelPuts).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Nome da coluna'), { target: { value: 'email' } })
    fireEvent.change(screen.getByLabelText('Tipo / tamanho'), { target: { value: 'varchar(120)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar coluna' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    expect(tableByNameOrThrow(modelPuts[0], 'cliente').columns.map((column) => column.name)).toContain('email')
    expect(await screen.findByTestId('diagram-column-cliente-email')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Excluir coluna cliente.email'))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir coluna' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(modelPuts).toHaveLength(2))
    expect(tableByNameOrThrow(modelPuts[1], 'cliente').columns.map((column) => column.name)).toEqual(['id'])
  })

  test('popover de coluna edita nome/tipo/PK sem expor metadados', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByLabelText('Editar coluna cliente.id'))

    const dialog = await screen.findByRole('dialog', { name: 'Editar coluna' })
    expect(within(dialog).queryByText('Descrição')).toBeNull()
    expect(within(dialog).queryByText('Termos de negócio')).toBeNull()
    expect(within(dialog).queryByText('Aprovar Descrição')).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Nome da coluna'), { target: { value: 'codigo' } })
    fireEvent.change(within(dialog).getByLabelText('Tipo / tamanho'), { target: { value: 'bigint' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar coluna' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    const column = tableByNameOrThrow(modelPuts[0], 'cliente').columns[0]
    expect(column).toMatchObject({ name: 'codigo', type: 'bigint', primary_key: true })
    expect(await screen.findByTestId('diagram-column-cliente-codigo')).toBeTruthy()
  })

  test('popover de tabela renomeia pelo menu Propriedades', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.contextMenu(nodeWrapper('cliente'), { clientX: 120, clientY: 80, button: 2 })
    fireEvent.click(await screen.findByTestId('canvas-menu-properties'))

    const dialog = await screen.findByRole('dialog', { name: 'Editar tabela' })
    fireEvent.change(within(dialog).getByLabelText('Nome da tabela'), { target: { value: 'pedido' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar tabela' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Já existe')
    expect(modelPuts).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Nome da tabela'), { target: { value: 'comprador' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar tabela' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    expect(modelPuts[0].tables.map((table) => table.name)).toContain('comprador')
    expect(await screen.findByTestId('diagram-node-comprador')).toBeTruthy()
    expect(screen.queryByTestId('diagram-node-cliente')).toBeNull()
  })

  test('modo 1:n cria relacionamento com coluna FK num único PUT e permite cancelar', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    openRelationship('cliente', 'pedido')
    expect(await screen.findByRole('dialog', { name: 'Novo relacionamento' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(modelPuts).toHaveLength(0)

    openRelationship('cliente', 'pedido')
    fireEvent.click(await screen.findByRole('button', { name: 'Criar relacionamento' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    const cliente = tableByNameOrThrow(modelPuts[0], 'cliente')
    expect(cliente.columns.map((column) => column.name)).toContain('pedido_id')
    expect(cliente.relationships.parents[0]).toMatchObject({
      table: 'pedido',
      local_columns: ['pedido_id'],
      referenced_columns: ['id'],
    })
    await waitFor(() => expect(document.querySelectorAll('.react-flow__edge')).toHaveLength(2))
  })

  test('arrastar handle→handle abre o diálogo e cancela sem PUT', async () => {
    stubRect()
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    connectHandles('pedido', 'cliente')

    const dialog = await screen.findByRole('dialog', { name: 'Novo relacionamento' })
    expect(within(dialog).getByText(/pedido → cliente/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(modelPuts).toHaveLength(0)
  })

  test('relacionamento reutiliza a coluna existente sem criar duplicata', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    openRelationship('pedido', 'cliente')
    const dialog = await screen.findByRole('dialog', { name: 'Novo relacionamento' })
    expect(within(dialog).getByText(/será reutilizada/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar relacionamento' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    const pedido = tableByNameOrThrow(modelPuts[0], 'pedido')
    expect(pedido.columns.filter((column) => column.name === 'cliente_id')).toHaveLength(1)
    expect(pedido.relationships.parents).toHaveLength(1)
  })

  test('conflito de coluna PK reporta erro e não faz save', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByLabelText('Adicionar coluna em cliente'))
    fireEvent.change(await screen.findByLabelText('Nome da coluna'), { target: { value: 'pedido_id' } })
    fireEvent.click(screen.getByLabelText('Chave primária'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar coluna' }))
    await waitFor(() => expect(modelPuts).toHaveLength(1))

    openRelationship('cliente', 'pedido')
    const dialog = await screen.findByRole('dialog', { name: 'Novo relacionamento' })
    expect(within(dialog).getByRole('alert').textContent).toContain('chave primária')
    const confirm = within(dialog).getByRole('button', { name: 'Criar relacionamento' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(modelPuts).toHaveLength(1)
  })

  test('exclui relacionamento pela aresta e pela FK do card', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    const edgeButton = await screen.findByTestId(/^diagram-edge-delete-/)
    fireEvent.click(edgeButton)
    const dialog = await screen.findByRole('dialog', { name: 'Excluir relacionamento' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    const pedido = tableByNameOrThrow(modelPuts[0], 'pedido')
    expect(pedido.relationships.parents).toHaveLength(0)
    expect(pedido.columns.map((column) => column.name)).toEqual(['id'])
    expect(document.querySelectorAll('.react-flow__edge')).toHaveLength(0)
  })

  test('exclui relacionamento pelo rodapé do card', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    const footer = screen.getByTestId('diagram-relationships-pedido')
    fireEvent.click(within(footer).getByRole('button', { name: /Excluir relacionamento/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir relacionamento' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    expect(tableByNameOrThrow(modelPuts[0], 'pedido').relationships.parents).toHaveLength(0)
  })

  test('undo restaura tabela excluída com colunas e relacionamento e redo reaplica', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-pedido')
    fireEvent.contextMenu(nodeWrapper('pedido'), { clientX: 120, clientY: 80, button: 2 })
    fireEvent.click(await screen.findByTestId('canvas-menu-delete-table'))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir tabela' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(modelPuts).toHaveLength(1))
    expect(modelPuts[0].tables.map((table) => table.name)).toEqual(['cliente'])
    expect(document.querySelectorAll('.react-flow__edge')).toHaveLength(0)

    fireEvent.click(await screen.findByTestId('diagram-undo'))
    await waitFor(() => expect(modelPuts).toHaveLength(2))
    const restored = tableByNameOrThrow(modelPuts[1], 'pedido')
    expect(restored.columns.map((column) => column.name)).toEqual(['id', 'cliente_id'])
    expect(restored.relationships.parents).toHaveLength(1)
    await waitFor(() => expect(document.querySelectorAll('.react-flow__edge')).toHaveLength(1))
    expect(await screen.findByTestId('diagram-node-pedido')).toBeTruthy()

    fireEvent.click(await screen.findByTestId('diagram-redo'))
    await waitFor(() => expect(modelPuts).toHaveLength(3))
    expect(modelPuts[2].tables.map((table) => table.name)).toEqual(['cliente'])
    await waitFor(() => expect(screen.queryByTestId('diagram-node-pedido')).toBeNull())
  })

  test('undo desfaz a criação com restauração e redo reaplica; botões somem sem histórico', async () => {
    const { modelPuts } = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    expect(screen.queryByTestId('diagram-undo')).toBeNull()
    expect(screen.queryByTestId('diagram-redo')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() => expect(modelPuts).toHaveLength(1))
    await screen.findByTestId('diagram-node-nova_tabela')

    fireEvent.click(await screen.findByTestId('diagram-undo'))
    await waitFor(() => expect(modelPuts).toHaveLength(2))
    expect(modelPuts[1].tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
    await waitFor(() => expect(screen.queryByTestId('diagram-node-nova_tabela')).toBeNull())
    expect(screen.queryByTestId('diagram-undo')).toBeNull()

    fireEvent.click(await screen.findByTestId('diagram-redo'))
    await waitFor(() => expect(modelPuts).toHaveLength(3))
    expect(modelPuts[2].tables.map((table) => table.name)).toContain('nova_tabela')
    expect(await screen.findByTestId('diagram-node-nova_tabela')).toBeTruthy()
    expect(screen.queryByTestId('diagram-redo')).toBeNull()
  })

  test('não emite o PUT do layout com o save do modelo em voo e re-agenda quando ele assenta', async () => {
    stubRect()
    const stub = stubEditing(emptyLayout(), { holdModelPut: true })
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() => expect(stub.modelPuts).toHaveLength(1))

    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(stub.layoutPuts).toHaveLength(0)

    stub.releaseModelPut()
    await waitFor(() => expect(stub.layoutPuts.length).toBeGreaterThan(0), { timeout: 3000 })
    const last = stub.layoutPuts[stub.layoutPuts.length - 1]
    expect(zoneFor(last, 'nova_tabela')?.name).toBe('Principal')
  })
})

function CanvasHarness({ canEdit = true }: { canEdit?: boolean }) {
  const [selection, setSelection] = useState<Selection>({ type: 'database' })
  return (
    <div>
      <button
        type="button"
        data-testid="select-pedido"
        onClick={() => setSelection({ type: 'table', table: 'pedido' })}
      >
        pedido
      </button>
      <div style={{ width: 1000, height: 700 }}>
        <DiagramCanvas
          projectId="projeto-1"
          database={sampleDatabase()}
          selection={selection}
          onSelect={setSelection}
          canEdit={canEdit}
        />
      </div>
    </div>
  )
}

function CanvasSelectionHarness({
  database,
  initialSelection = { type: 'database' },
}: {
  database: DatabaseModel
  initialSelection?: Selection
}) {
  const [selection, setSelection] = useState<Selection>(initialSelection)
  return (
    <div style={{ width: 1000, height: 700 }}>
      <DiagramCanvas
        projectId="projeto-1"
        database={database}
        selection={selection}
        onSelect={setSelection}
        canEdit
      />
    </div>
  )
}

function edgePath(): SVGPathElement {
  const path = document.querySelector('.react-flow__edge .react-flow__edge-path')
  if (!(path instanceof SVGPathElement)) throw new Error('Aresta do diagrama não encontrada.')
  return path
}

function dataTransfer(data: Record<string, string> = {}) {
  return {
    types: Object.keys(data),
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: (type: string, value: string) => {
      data[type] = value
    },
    getData: (type: string) => data[type] ?? '',
  }
}

function dropWithPosition(element: HTMLElement, table: string, x: number, y: number) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    dataTransfer: { value: dataTransfer({ [DIAGRAM_TABLE_MIME]: table }) },
  })
  fireEvent(element, event)
}

describe('DiagramCanvas zones', () => {
  test('cria, renomeia, move tabela e exclui zona devolvendo as tabelas a Principal', async () => {
    stubRect()
    const stub = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByTestId('diagram-zone-add'))
    fireEvent.change(screen.getByLabelText('Nome da zona'), { target: { value: 'Geografia' } })
    fireEvent.click(screen.getByTestId('diagram-zone-create'))

    expect(await screen.findByTestId('diagram-zone-tab-Geografia')).toBeTruthy()
    expect(screen.getByTestId('diagram-zone-tab-Geografia').getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByTestId('diagram-zone-tab-Principal'))
    fireEvent.contextMenu(nodeWrapper('cliente'), { clientX: 120, clientY: 80, button: 2 })
    fireEvent.click(await screen.findByTestId('canvas-menu-move-Geografia'))

    await waitFor(() => expect(stub.layoutPuts.length).toBeGreaterThan(0))
    const moved = stub.layoutPuts[stub.layoutPuts.length - 1]
    expect(zoneFor(moved, 'cliente')?.name).toBe('Geografia')
    expect(zoneFor(moved, 'cliente')?.members).toEqual(['cliente'])
    expect(stub.modelPuts).toHaveLength(0)

    await waitFor(() => expect(screen.queryByTestId('diagram-node-cliente')).toBeNull())
    fireEvent.click(screen.getByTestId('diagram-zone-tab-Geografia'))
    expect(await screen.findByTestId('diagram-node-cliente')).toBeTruthy()

    fireEvent.click(screen.getByTestId('diagram-zone-rename'))
    fireEvent.change(screen.getByLabelText('Novo nome da zona'), { target: { value: 'Geo' } })
    fireEvent.click(screen.getByTestId('diagram-zone-rename-save'))
    expect(await screen.findByTestId('diagram-zone-tab-Geo')).toBeTruthy()

    fireEvent.click(screen.getByTestId('diagram-zone-delete'))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir zona' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(screen.queryByTestId('diagram-zone-tab-Geo')).toBeNull())
    await waitFor(() => {
      const last = stub.layoutPuts[stub.layoutPuts.length - 1]
      expect(last.zones?.map((zone) => zone.name)).toEqual(['Principal'])
      expect(zoneFor(last, 'cliente')?.name).toBe('Principal')
    })
    expect(await screen.findByTestId('diagram-node-cliente')).toBeTruthy()
  })

  test('troca de zona restaura posições e não emite PUT', async () => {
    stubRect()
    const puts = stubLayout(twoZoneLayout())
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    await waitFor(() => expect(nodeWrapper('cliente').style.transform).toContain('translate(100px,100px)'))
    expect(screen.queryByTestId('diagram-node-pedido')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-zone-tab-Geografia'))
    await waitFor(() => expect(nodeWrapper('pedido').style.transform).toContain('translate(420px,300px)'))
    expect(screen.queryByTestId('diagram-node-cliente')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-zone-tab-Principal'))
    await waitFor(() => expect(nodeWrapper('cliente').style.transform).toContain('translate(100px,100px)'))

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(puts).toHaveLength(0)
  })

  test('reordena as abas por arrasto e persiste tabOrder na PUT', async () => {
    stubRect()
    const stub = stubEditing(twoZoneLayout())
    renderCanvas()

    await screen.findByTestId('diagram-zone-tab-Geografia')
    const transfer = dataTransfer()
    fireEvent.dragStart(screen.getByTestId('diagram-zone-tab-Geografia'), { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('diagram-zone-tab-Principal'), { dataTransfer: transfer })

    await waitFor(() => expect(stub.layoutPuts.length).toBeGreaterThan(0))
    const zones = stub.layoutPuts[stub.layoutPuts.length - 1].zones ?? []
    expect(zones.find((zone) => zone.name === 'Geografia')?.tabOrder).toBe(0)
    expect(zones.find((zone) => zone.name === 'Principal')?.tabOrder).toBe(1)
  })

  test('deriva Chaves entre modelos para relacionamento entre zonas nas duas pontas', async () => {
    stubRect()
    stubEditing(twoZoneLayout())
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    await screen.findByTestId('diagram-zone-tab-Geografia')
    await waitFor(() =>
      expect(screen.getByTestId('diagram-cross-zone-cliente').textContent).toContain('Chaves entre modelos'),
    )
    expect(screen.queryByTestId('diagram-foreign-keys-cliente')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-zone-tab-Geografia'))
    await screen.findByTestId('diagram-node-pedido')
    await waitFor(() =>
      expect(screen.getByTestId('diagram-cross-zone-pedido').textContent).toContain('Chaves entre modelos'),
    )
    expect(screen.queryByTestId('diagram-foreign-keys-pedido')).toBeNull()
  })

  test('relacionamento com as duas tabelas na mesma zona fica em Chaves estrangeiras', async () => {
    stubRect()
    stubEditing(emptyLayout())
    renderCanvas()

    await screen.findByTestId('diagram-node-pedido')
    expect(screen.getByTestId('diagram-foreign-keys-pedido').textContent).toContain('Chaves estrangeiras')
    expect(screen.queryByTestId('diagram-cross-zone-pedido')).toBeNull()
  })

  test('drop da árvore adiciona a tabela na aba ativa na posição do cursor', async () => {
    stubRect()
    const stub = stubEditing(twoZoneLayout())
    renderCanvas()

    await screen.findByTestId('diagram-zone-tab-Geografia')
    fireEvent.click(screen.getByTestId('diagram-zone-tab-Principal'))
    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByTestId('diagram-zone-tab-Geografia'))
    await screen.findByTestId('diagram-node-pedido')

    dropWithPosition(screen.getByTestId('diagram-canvas'), 'cliente', 300, 220)

    await waitFor(() => expect(stub.layoutPuts.length).toBeGreaterThan(0))
    const last = stub.layoutPuts[stub.layoutPuts.length - 1]
    expect(zoneFor(last, 'cliente')?.name).toBe('Geografia')
    expect(last.layouts.find((layout) => layout.zoneName === 'Geografia')?.positions?.cliente).toEqual({
      x: 300,
      y: 220,
    })
    expect(stub.modelPuts).toHaveLength(0)
    expect(await screen.findByTestId('diagram-node-cliente')).toBeTruthy()
  })

  test('remover do diagrama tira da zona sem alterar o modelo', async () => {
    const stub = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.contextMenu(nodeWrapper('cliente'), { clientX: 120, clientY: 80, button: 2 })
    fireEvent.click(await screen.findByTestId('canvas-menu-remove-from-diagram'))
    const dialog = await screen.findByRole('dialog', { name: 'Remover do diagrama' })
    expect(within(dialog).getByText(/continua no dicionário/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }))

    await waitFor(() => expect(stub.layoutPuts.length).toBeGreaterThan(0))
    const last = stub.layoutPuts[stub.layoutPuts.length - 1]
    expect(zoneFor(last, 'cliente')).toBeUndefined()
    expect(zoneFor(last, 'pedido')?.name).toBe('Principal')
    expect(stub.modelPuts).toHaveLength(0)
    await waitFor(() => expect(screen.queryByTestId('diagram-node-cliente')).toBeNull())
    expect(screen.getByTestId('diagram-node-pedido')).toBeTruthy()
  })

  test('localizar tabela de outra zona troca a aba e centraliza o card', async () => {
    stubRect()
    stubEditing(twoZoneLayout())
    renderWithClient(<CanvasHarness />)

    await screen.findByTestId('diagram-node-cliente')
    await screen.findByTestId('diagram-zone-tab-Geografia')
    fireEvent.click(screen.getByTestId('select-pedido'))
    await waitFor(() =>
      expect(screen.getByTestId('diagram-zone-tab-Geografia').getAttribute('aria-selected')).toBe('true'),
    )
    expect(await screen.findByTestId('diagram-node-pedido')).toBeTruthy()
  })

  test('tabela sem zona não troca de aba e oferece adicionar à aba atual', async () => {
    stubRect()
    stubEditing({
      projectId: 'projeto-1',
      zones: [{ name: 'Principal', tabOrder: 0, members: ['cliente'] }],
      layouts: [principalLayout({ positions: { cliente: { x: 100, y: 100 } } })],
    })
    renderWithClient(<CanvasHarness />)

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByTestId('select-pedido'))
    expect(await screen.findByTestId('diagram-outside-zone')).toBeTruthy()
    expect(screen.queryByTestId('diagram-node-pedido')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-add-to-zone'))
    expect(await screen.findByTestId('diagram-node-pedido')).toBeTruthy()
  })

  test('VIEWER alterna abas mas não vê controles de zona, mover ou remover', async () => {
    stubRect()
    stubLayout(twoZoneLayout())
    renderCanvas(false)

    await screen.findByTestId('diagram-node-cliente')
    await screen.findByTestId('diagram-zone-tab-Geografia')
    expect(screen.queryByTestId('diagram-zone-add')).toBeNull()
    expect(screen.queryByTestId('diagram-zone-delete')).toBeNull()
    expect(screen.queryByTestId('diagram-zone-rename')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-zone-tab-Geografia'))
    await screen.findByTestId('diagram-node-pedido')
    fireEvent.contextMenu(nodeWrapper('pedido'), { clientX: 120, clientY: 80, button: 2 })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByTestId('diagram-outside-zone')).toBeNull()
  })
})

describe('DiagramCanvas zone assignment defaults', () => {
  test('tabela nova nasce em Principal mesmo com outra aba ativa', async () => {
    stubRect()
    const stub = stubEditing(twoZoneLayout())
    renderCanvas()

    await screen.findByTestId('diagram-zone-tab-Geografia')
    fireEvent.click(screen.getByTestId('diagram-zone-tab-Geografia'))
    await screen.findByTestId('diagram-node-pedido')

    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() => expect(stub.modelPuts).toHaveLength(1))
    await waitFor(() => expect(stub.layoutPuts.length).toBeGreaterThan(0))

    const last = stub.layoutPuts[stub.layoutPuts.length - 1]
    expect(zoneFor(last, 'nova_tabela')?.name).toBe('Principal')
    expect(zoneFor(last, 'pedido')?.name).toBe('Geografia')
  })

  test('documento legado sem zones é lido como todas as tabelas em Principal e materializa na primeira escrita', async () => {
    stubRect()
    const legacy = {
      projectId: 'projeto-1',
      layouts: [
        {
          zoneName: 'Principal',
          positions: { cliente: { x: 111, y: 77 }, pedido: { x: 480, y: 90 } },
          viewport: { x: 0, y: 0 },
          zoom: 1,
          updatedAt: null,
          updatedBy: null,
        },
      ],
    } as unknown as DiagramLayout
    const puts = stubLayout(legacy)
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    await waitFor(() => expect(nodeWrapper('cliente').style.transform).toContain('translate(111px,77px)'))
    expect(screen.getByTestId('diagram-zone-tab-Principal')).toBeTruthy()

    dragTable('cliente')
    await waitFor(() => expect(puts.length).toBeGreaterThan(0))
    expect(puts[puts.length - 1].zones).toEqual([{ name: 'Principal', tabOrder: 0, members: ['cliente', 'pedido'] }])
  })
})

function viewportTransform(): string {
  const element = document.querySelector('.react-flow__viewport')
  return element instanceof HTMLElement ? element.style.transform : ''
}

describe('DiagramCanvas toolbar', () => {
  test('alterna Selecionar/Mover, faz pan sem selecionar e expõe labels acessíveis', async () => {
    stubRect()
    stubLayout(emptyLayout())
    const onSelect = mock(() => undefined)
    renderWithClient(
      <div style={{ width: 1000, height: 700 }}>
        <DiagramCanvas
          projectId="projeto-1"
          database={sampleDatabase()}
          selection={{ type: 'database' }}
          onSelect={onSelect}
          canEdit
        />
      </div>,
    )

    await screen.findByTestId('diagram-node-cliente')
    expect(screen.getByTestId('diagram-tool-select').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('diagram-tool-move').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Selecionar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mover' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aproximar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Afastar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ajustar à tela' })).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Selecionar tabela cliente'))
    expect(onSelect).toHaveBeenCalledWith({ type: 'table', table: 'cliente' })
    onSelect.mockClear()

    fireEvent.click(screen.getByTestId('diagram-tool-move'))
    expect(screen.getByTestId('diagram-tool-select').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('diagram-tool-move').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByLabelText('Selecionar tabela cliente'))
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.mouseDown(pane(), { clientX: 500, clientY: 400, button: 0 })
    fireEvent.mouseMove(document, { clientX: 560, clientY: 440 })
    fireEvent.mouseUp(document, { clientX: 560, clientY: 440 })
    expect(onSelect).not.toHaveBeenCalled()
  })

  test('abre o menu de organização e delega criar tabela e relacionamento', async () => {
    stubRect()
    const stub = stubEditing()
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    fireEvent.click(screen.getByTestId('diagram-auto-layout'))

    const menu = await screen.findByRole('menu', { name: 'Organização automática' })
    expect(within(menu).getByRole('menuitem', { name: 'Em grade' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Em estrela' })).toBeTruthy()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Em estrela' }))

    await waitFor(() => expect(stub.layoutPuts).toHaveLength(1))
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByTestId('diagram-relationship-mode'))
    expect(screen.getByTestId('diagram-relationship-mode').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Clique na tabela de origem.')).toBeTruthy()

    fireEvent.click(screen.getByTestId('diagram-add-table'))
    await waitFor(() => expect(stub.modelPuts).toHaveLength(1))
    expect(stub.modelPuts[0].tables.map((table) => table.name)).toContain('nova_tabela')
  })

  test('VIEWER vê apenas zoom, ajustar e exportar', async () => {
    stubRect()
    stubLayout(emptyLayout())
    renderCanvas(false)

    await screen.findByTestId('diagram-node-cliente')

    expect(screen.getByTestId('diagram-zoom-in')).toBeTruthy()
    expect(screen.getByTestId('diagram-zoom-out')).toBeTruthy()
    expect(screen.getByTestId('diagram-fit-view')).toBeTruthy()
    expect(screen.getByTestId('diagram-export-png')).toBeTruthy()
    expect(screen.getByTestId('diagram-export-svg')).toBeTruthy()

    expect(screen.queryByTestId('diagram-tool-select')).toBeNull()
    expect(screen.queryByTestId('diagram-tool-move')).toBeNull()
    expect(screen.queryByTestId('diagram-add-table')).toBeNull()
    expect(screen.queryByTestId('diagram-relationship-mode')).toBeNull()
    expect(screen.queryByTestId('diagram-auto-layout')).toBeNull()
  })

  test('aplicar organização grava um único PUT com viewport/zoom e em seguida ajusta a view', async () => {
    stubRect()
    const stub = stubEditing(emptyLayout({ positions: { cliente: { x: 0, y: 0 }, pedido: { x: 1200, y: 900 } } }))
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    await waitFor(() => expect(nodeWrapper('pedido').style.transform).toContain('translate(1200px,900px)'))
    const before = viewportTransform()

    fireEvent.click(screen.getByTestId('diagram-auto-layout'))
    fireEvent.click(await screen.findByTestId('diagram-layout-grid'))

    await waitFor(() => expect(stub.layoutPuts).toHaveLength(1))
    const applied = layoutFor(stub.layoutPuts[0])
    expect(applied?.positions.cliente).toEqual({ x: 80, y: 80 })
    expect(applied?.positions.pedido).toEqual({ x: 420, y: 80 })
    expect(applied?.viewport).toEqual({ x: 0, y: 0 })
    expect(applied?.zoom).toBe(1)

    await waitFor(() => expect(viewportTransform()).not.toBe(before), { timeout: 2000 })

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(stub.layoutPuts).toHaveLength(1)
  })
})

describe('DiagramCanvas layout in zones', () => {
  test('organiza apenas as tabelas da zona ativa e preserva a outra zona', async () => {
    stubRect()
    const stub = stubEditing(twoZoneLayout())
    renderCanvas()

    await screen.findByTestId('diagram-node-cliente')
    await waitFor(() => expect(nodeWrapper('cliente').style.transform).toContain('translate(100px,100px)'))

    fireEvent.click(screen.getByTestId('diagram-auto-layout'))
    fireEvent.click(await screen.findByTestId('diagram-layout-grid'))

    await waitFor(() => expect(stub.layoutPuts).toHaveLength(1))
    const put = stub.layoutPuts[0]
    expect(layoutFor(put, 'Principal')?.positions).toEqual({ cliente: { x: 80, y: 80 } })
    expect(layoutFor(put, 'Geografia')?.positions).toEqual({ pedido: { x: 420, y: 300 } })
    expect(zoneFor(put, 'pedido')?.name).toBe('Geografia')
    expect(zoneFor(put, 'cliente')?.name).toBe('Principal')
    expect(stub.modelPuts).toHaveLength(0)
  })
})

function stubReducedMotion(matches: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  restoreCallbacks.push(() => {
    window.matchMedia = original
  })
}

describe('DiagramCanvas emphasis', () => {
  test('selecionar pela árvore destaca o card e as arestas incidentes', async () => {
    const database = databaseWithConfig()
    const selections: Selection[] = []
    const tree = render(
      <SemanticTree
        database={database}
        selection={{ type: 'database' }}
        onSelect={(selection) => selections.push(selection)}
      />,
    )
    fireEvent.click(screen.getByTestId('table-row-pedido'))
    tree.unmount()
    expect(selections).toEqual([{ type: 'table', table: 'pedido' }])

    stubLayout(layoutWithMembers(['cliente', 'pedido', 'config']))
    renderWithClient(<CanvasSelectionHarness database={database} initialSelection={selections[0]} />)

    await screen.findByTestId('diagram-node-pedido')
    await waitFor(() => expect(nodeWrapper('pedido').className).toContain('diagram-node--selected'))
    expect(nodeWrapper('cliente').className).toContain('diagram-node--incident')
    expect(nodeWrapper('config').className).toContain('diagram-node--muted')

    await waitFor(() => expect(edgePath().getAttribute('class')).toContain('diagram-edge--outgoing'))
    const outgoing = edgePath()
    expect(outgoing.getAttribute('class')).toContain('diagram-edge--animated')
    expect(outgoing.getAttribute('style')).toContain('--diagram-edge-out')
    expect(outgoing.getAttribute('style')).toContain('--diagram-edge-strong-width')
  })

  test('clicar no card destaca a seleção e as tabelas incidentes', async () => {
    stubLayout(emptyLayout())
    renderWithClient(<CanvasSelectionHarness database={sampleDatabase()} />)

    await screen.findByTestId('diagram-node-pedido')
    fireEvent.click(screen.getByLabelText('Selecionar tabela cliente'))
    await waitFor(() => expect(nodeWrapper('cliente').className).toContain('diagram-node--selected'))
    expect(nodeWrapper('pedido').className).toContain('diagram-node--incident')
  })

  test('selecionar pelo canvas usa a direção incoming com padrão e espessura próprios', async () => {
    stubLayout(emptyLayout())
    renderWithClient(
      <CanvasSelectionHarness database={sampleDatabase()} initialSelection={{ type: 'table', table: 'cliente' }} />,
    )

    await screen.findByTestId('diagram-node-pedido')
    await waitFor(() => expect(nodeWrapper('cliente').className).toContain('diagram-node--selected'))
    expect(nodeWrapper('pedido').className).toContain('diagram-node--incident')

    await waitFor(() => expect(edgePath().getAttribute('class')).toContain('diagram-edge--incoming'))
    const incoming = edgePath()
    expect(incoming.getAttribute('class')).toContain('diagram-edge--animated')
    expect(incoming.getAttribute('style')).toContain('--diagram-edge-in')
    expect(incoming.getAttribute('style')).toContain('--diagram-edge-strong-width')
  })

  test('não aplica a classe de animação quando o usuário prefere movimento reduzido', async () => {
    stubLayout(emptyLayout())
    renderWithClient(<CanvasSelectionHarness database={sampleDatabase()} />)

    await screen.findByTestId('diagram-node-pedido')
    stubReducedMotion(true)
    fireEvent.click(screen.getByLabelText('Selecionar tabela pedido'))
    await waitFor(() => expect(edgePath().getAttribute('class')).toContain('diagram-edge--outgoing'))

    const path = edgePath()
    expect(path.getAttribute('class')).not.toContain('diagram-edge--animated')
    expect(path.getAttribute('class')).toContain('diagram-edge--outgoing')
  })
})
