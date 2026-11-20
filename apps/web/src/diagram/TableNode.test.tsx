import type { RelationshipModel } from '@dbmapper/domain'
import { describe, expect, test } from 'bun:test'
import { ReactFlowProvider } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { createDiagramNodes, type DiagramNode, type DiagramNodeData } from './layout'
import { TableNode } from './TableNode'
import { sampleDatabase, tableByName } from '../test/fixtures'
import { fireEvent, render, screen, within } from '../test/setup'

function nodeProps(canEdit: boolean, overrides: Partial<DiagramNodeData> = {}): NodeProps<DiagramNode> {
  const database = sampleDatabase()
  const nodes = createDiagramNodes({
    database,
    positions: { cliente: { x: 0, y: 0 }, pedido: { x: 300, y: 0 } },
    selection: { type: 'database' },
    matches: new Set(),
    query: '',
    draggable: canEdit,
    onSelect: () => undefined,
  })
  const node = nodes.find((candidate) => candidate.id === 'pedido')
  if (!node) throw new Error('Nó pedido não encontrado.')

  return {
    id: node.id,
    type: 'table',
    data: { ...node.data, canEdit, ...overrides },
    selected: false,
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    draggable: canEdit,
    isConnectable: canEdit,
    positionAbsoluteX: 300,
    positionAbsoluteY: 0,
  } as NodeProps<DiagramNode>
}

function renderNode(canEdit: boolean, overrides: Partial<DiagramNodeData> = {}) {
  return render(
    <ReactFlowProvider>
      <TableNode {...nodeProps(canEdit, overrides)} />
    </ReactFlowProvider>,
  )
}

describe('TableNode', () => {
  test('expõe ações de coluna/tabela e exclusão de relacionamento para quem edita', () => {
    const calls: string[] = []
    const relationship = tableByName(sampleDatabase(), 'pedido').relationships.parents[0]

    renderNode(true, {
      onAddColumn: (table) => calls.push(`add:${table}`),
      onEditTable: (table) => calls.push(`edit-table:${table}`),
      onEditColumn: (table, column) => calls.push(`edit-column:${table}.${column}`),
      onDeleteColumn: (table, column) => calls.push(`delete-column:${table}.${column}`),
      onDeleteRelationship: (table, rel: RelationshipModel) => calls.push(`delete-rel:${table}->${rel.table}`),
    })

    fireEvent.click(screen.getByLabelText('Adicionar coluna em pedido'))
    fireEvent.click(screen.getByLabelText('Editar tabela pedido'))
    fireEvent.click(screen.getByLabelText('Editar coluna pedido.cliente_id'))
    fireEvent.click(screen.getByLabelText('Excluir coluna pedido.id'))

    const footer = screen.getByTestId('diagram-relationships-pedido')
    fireEvent.click(within(footer).getByRole('button', { name: 'Excluir relacionamento pedido → cliente' }))

    expect(calls).toEqual([
      'add:pedido',
      'edit-table:pedido',
      'edit-column:pedido.cliente_id',
      'delete-column:pedido.id',
      `delete-rel:pedido->${relationship.table}`,
    ])
  })

  test('esconde controles e o rodapé de relacionamentos em modo somente leitura', () => {
    renderNode(false)

    expect(screen.queryByLabelText('Adicionar coluna em pedido')).toBeNull()
    expect(screen.queryByLabelText('Editar tabela pedido')).toBeNull()
    expect(screen.queryByLabelText('Editar coluna pedido.id')).toBeNull()
    expect(screen.queryByLabelText('Excluir coluna pedido.id')).toBeNull()
    expect(screen.queryByTestId('diagram-relationships-pedido')).toBeNull()
    expect(screen.queryByRole('button', { name: /Excluir relacionamento/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Selecionar coluna pedido.id')).toBeTruthy()
  })

  test('no modo 1:n o clique no cabeçalho escolhe a tabela em vez de selecionar', () => {
    const picks: string[] = []
    const selections: string[] = []

    renderNode(true, {
      relationshipMode: true,
      onPickTable: (table) => picks.push(table),
      onSelect: (selection) => selections.push(selection.type),
    })

    fireEvent.click(screen.getByLabelText('Escolher tabela pedido para relacionamento'))

    expect(picks).toEqual(['pedido'])
    expect(selections).toEqual([])
  })
})
