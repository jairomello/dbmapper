import { afterEach, describe, expect, mock, test } from 'bun:test'
import { createElement } from 'react'
import type { DiagramLayout } from '../api/types'
import { sampleDatabase } from '../test/fixtures'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { cleanup, fireEvent, screen, waitFor } from '../test/setup'

const pngElements: HTMLElement[] = []
const svgElements: HTMLElement[] = []

mock.module('html-to-image', () => ({
  toPng: async (element: HTMLElement) => {
    pngElements.push(element)
    return 'data:image/png;base64,AAAA'
  },
  toSvg: async (element: HTMLElement) => {
    svgElements.push(element)
    return 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E'
  },
}))

const { diagramFileName, renderDiagram } = await import('./exportDiagram')
const { DiagramCanvas } = await import('../components/DiagramCanvas')

const originalFetch = globalThis.fetch
const originalAnchorClick = HTMLAnchorElement.prototype.click
const downloads: string[] = []

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
  HTMLAnchorElement.prototype.click = originalAnchorClick
  pngElements.length = 0
  svgElements.length = 0
  downloads.length = 0
})

describe('renderDiagram', () => {
  test('gera PNG e SVG sem fazer nenhuma requisição de rede', async () => {
    const requests: string[] = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
      requests.push(typeof input === 'string' ? input : String(input))
      return Promise.reject(new Error('exportação não deve acessar a rede'))
    }) as typeof fetch
    const element = document.createElement('div')

    const png = await renderDiagram(element, 'png')
    const svg = await renderDiagram(element, 'svg')

    expect(png.startsWith('data:image/png')).toBe(true)
    expect(svg.startsWith('data:image/svg+xml')).toBe(true)
    expect(requests).toEqual([])
    expect(pngElements).toEqual([element])
    expect(svgElements).toEqual([element])
  })
})

describe('DiagramCanvas export', () => {
  test('os botões exportam PNG e SVG sem emitir requisição de save', async () => {
    const layout: DiagramLayout = {
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
    const requests: string[] = []
    const restoreFetch = installFetch((url, init) => {
      requests.push(`${init?.method ?? 'GET'} ${url}`)
      if (url === '/api/projects/projeto-1/diagram') return jsonResponse(layout)
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    })
    HTMLAnchorElement.prototype.click = function click() {
      downloads.push(this.download)
    }

    try {
      renderWithClient(
        createElement(DiagramCanvas, {
          projectId: 'projeto-1',
          database: sampleDatabase(),
          selection: { type: 'database' },
          onSelect: () => undefined,
          canEdit: true,
        }),
      )

      await screen.findByTestId('diagram-node-cliente')
      fireEvent.click(screen.getByTestId('diagram-export-png'))
      await waitFor(() => expect(pngElements).toHaveLength(1))
      await waitFor(() => expect(downloads).toEqual(['diagrama-principal.png']))

      fireEvent.click(screen.getByTestId('diagram-export-svg'))
      await waitFor(() => expect(svgElements).toHaveLength(1))
      await waitFor(() => expect(downloads).toEqual(['diagrama-principal.png', 'diagrama-principal.svg']))

      expect(requests.filter((request) => !request.startsWith('GET '))).toEqual([])
    } finally {
      restoreFetch()
    }
  })
})

describe('diagramFileName', () => {
  test('normaliza o nome da zona e usa a extensão do formato', () => {
    expect(diagramFileName('Principal', 'png')).toBe('diagrama-principal.png')
    expect(diagramFileName('Cadastro & Geografia', 'svg')).toBe('diagrama-cadastro-geografia.svg')
  })
})
