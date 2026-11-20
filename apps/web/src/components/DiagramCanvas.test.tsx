import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import type { DiagramLayout } from '../api/types'
import { sampleDatabase, sampleProject } from '../test/fixtures'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { cleanup, fireEvent, screen, waitFor, within } from '../test/setup'
import { DiagramCanvas } from './DiagramCanvas'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function emptyLayout(overrides: Partial<DiagramLayout> = {}): DiagramLayout {
  return {
    projectId: 'projeto-1',
    zoneName: 'Principal',
    positions: {},
    viewport: { x: 0, y: 0 },
    zoom: 1,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  }
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

function stubLayout(layout: DiagramLayout, puts: DiagramLayout[] = []) {
  restoreCallbacks.push(
    installFetch((url, init) => {
      if (url !== '/api/projects/projeto-1/diagram') return jsonResponse({}, 404)
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)) as DiagramLayout)
        return jsonResponse({ ...layout, ...(JSON.parse(String(init.body)) as DiagramLayout) })
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
    expect(puts[0].positions.cliente).not.toEqual({ x: 80, y: 80 })
    expect(puts[0].positions.pedido).toEqual({ x: 420, y: 80 })
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

function stubEditing() {
  const project = sampleProject()
  const modelPuts: DatabaseModel[] = []
  const layout = emptyLayout()

  restoreCallbacks.push(
    installFetch((url, init) => {
      if (url === '/api/projects/projeto-1/diagram') {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as DiagramLayout
          return jsonResponse({ ...layout, ...body })
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

  return { modelPuts, project }
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
})
