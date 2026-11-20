import { afterEach, describe, expect, test } from 'bun:test'
import type { DiagramLayout } from '../api/types'
import { sampleDatabase } from '../test/fixtures'
import { installFetch, jsonResponse } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { cleanup, fireEvent, screen, waitFor } from '../test/setup'
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

function renderCanvas(canEdit = true) {
  return renderWithClient(
    <div style={{ width: 1000, height: 700 }}>
      <DiagramCanvas
        projectId="projeto-1"
        database={sampleDatabase()}
        selection={{ type: 'database' }}
        onSelect={() => undefined}
        canEdit={canEdit}
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
})
