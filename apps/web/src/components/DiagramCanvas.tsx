import { useMutation, useQuery } from '@tanstack/react-query'
import type { ColumnModel, DatabaseModel, RelationshipModel } from '@dbmapper/domain'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeMouseHandler,
  type OnConnect,
  type OnNodesChange,
  type OnMoveEnd,
  type OnNodeDrag,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diagramApi } from '../api/diagram'
import type { DiagramLayoutInput, DiagramPosition } from '../api/types'
import { CrowFootEdge } from '../diagram/CrowFootEdge'
import { CanvasContextMenu, type CanvasMenuItem } from '../diagram/CanvasContextMenu'
import { ColumnPopover, type ColumnDraft, TablePopover } from '../diagram/ColumnPopover'
import {
  columnNameError,
  createColumnCommand,
  createRelationshipCommand,
  createTableCommand,
  deleteColumnCommand,
  deleteRelationshipCommand,
  deleteTableCommand,
  renameTableCommand,
  type TableCreateParams,
  updateColumnCommand,
} from '../diagram/commands'
import { ConfirmDialog } from '../diagram/ConfirmDialog'
import {
  buildPositions,
  createDiagramEdges,
  createDiagramNodes,
  DIAGRAM_NODE_WIDTH,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeData,
  diagramMatches,
} from '../diagram/layout'
import { RelationshipDialog, type RelationshipDraft } from '../diagram/RelationshipDialog'
import { TableNode } from '../diagram/TableNode'
import { type DiagramSaveState, useDiagramEditing } from '../diagram/useDiagramEditing'
import type { Selection } from '../lib/selection'

const SAVE_DEBOUNCE_MS = 500

const NODE_TYPES = { table: TableNode }
const EDGE_TYPES = { crowsfoot: CrowFootEdge }

export const diagramQueryKey = (projectId: string) => ['diagram', projectId] as const

function formatSavedAt(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

type CanvasMenu =
  | { kind: 'canvas'; x: number; y: number; flow: DiagramPosition }
  | { kind: 'node'; x: number; y: number; table: string }

type PendingDelete =
  | { kind: 'table'; table: string }
  | { kind: 'column'; table: string; column: string }
  | { kind: 'relationship'; table: string; relationship: RelationshipModel }

type OpenPopover =
  | { kind: 'table'; table: string }
  | { kind: 'column'; table: string; column: string }
  | { kind: 'new-column'; table: string }

type RelationshipMode = 'off' | 'source' | 'target'

export interface DiagramCanvasProps {
  projectId: string
  database: DatabaseModel
  selection: Selection
  onSelect: (selection: Selection) => void
  canEdit: boolean
  locked?: boolean
  onSaveStateChange?: (state: DiagramSaveState) => void
}

export function DiagramCanvas(props: DiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      <DiagramCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function DiagramCanvasInner({
  projectId,
  database,
  selection,
  onSelect,
  canEdit,
  locked = false,
  onSaveStateChange,
}: DiagramCanvasProps) {
  const layoutQuery = useQuery({
    queryKey: diagramQueryKey(projectId),
    queryFn: () => diagramApi.get(projectId),
    retry: false,
  })

  const editor = useDiagramEditing({
    projectId,
    database,
    canEdit,
    locked,
    onSaveStateChange,
  })
  const workingDatabase = editor.database
  const effectiveCanEdit = canEdit && !locked

  const [positions, setPositions] = useState<Record<string, DiagramPosition>>(() => buildPositions(workingDatabase))
  const [query, setQuery] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [menu, setMenu] = useState<CanvasMenu | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [openPopover, setOpenPopover] = useState<OpenPopover | null>(null)
  const [pendingRelationship, setPendingRelationship] = useState<{ source: string; target: string } | null>(null)
  const [relationshipMode, setRelationshipMode] = useState<RelationshipMode>('off')
  const [relationshipSource, setRelationshipSource] = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const positionsRef = useRef(positions)
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<DiagramLayoutInput | null>(null)
  const flowReadyRef = useRef(false)
  const appliedSavedViewportRef = useRef(false)
  const skipViewportSaveRef = useRef(false)
  const lastDatabaseRef = useRef<DatabaseModel | null>(null)
  const lastLayoutRef = useRef<unknown>(null)

  const { setViewport, setCenter, getNode, fitView, screenToFlowPosition } = useReactFlow<DiagramNode, DiagramEdge>()

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  useEffect(() => {
    const savedLayout = layoutQuery.data
    if (lastDatabaseRef.current === workingDatabase && lastLayoutRef.current === savedLayout) return
    lastDatabaseRef.current = workingDatabase
    lastLayoutRef.current = savedLayout

    const savedPositions = savedLayout?.positions ?? {}
    const next = buildPositions(workingDatabase, savedPositions)
    for (const [name, position] of Object.entries(positionsRef.current)) {
      if (!savedPositions[name] && next[name]) next[name] = position
    }
    positionsRef.current = next
    setPositions(next)
  }, [workingDatabase, layoutQuery.data])

  const saveMutation = useMutation({
    mutationFn: (layout: DiagramLayoutInput) => diagramApi.save(projectId, layout),
    onSuccess: () => {
      setLastSavedAt(new Date())
      setSaveFailed(false)
    },
    onError: () => setSaveFailed(true),
  })
  const saveLayout = saveMutation.mutate

  const flush = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    saveLayout(pending)
  }, [saveLayout])

  const scheduleSave = useCallback(
    (layout: DiagramLayoutInput) => {
      if (!effectiveCanEdit) return
      pendingRef.current = layout
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        flush()
      }, SAVE_DEBOUNCE_MS)
    },
    [effectiveCanEdit, flush],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const handleNodesChange: OnNodesChange<DiagramNode> = useCallback(
    (changes) => {
      let changed = false
      const next = { ...positionsRef.current }

      for (const change of changes) {
        if (change.type !== 'position' || !change.position) continue
        const current = next[change.id]
        if (current && current.x === change.position.x && current.y === change.position.y) continue
        next[change.id] = change.position
        changed = true
      }

      if (!changed) return
      positionsRef.current = next
      setPositions(next)
      scheduleSave({ positions: next, viewport: viewportRef.current, zoom: viewportRef.current.zoom })
    },
    [scheduleSave],
  )

  const handleNodeDragStop: OnNodeDrag<DiagramNode> = useCallback(
    (_event, node) => {
      if (!effectiveCanEdit) return
      const next = { ...positionsRef.current, [node.id]: node.position }
      positionsRef.current = next
      setPositions(next)
      scheduleSave({ positions: next, viewport: viewportRef.current, zoom: viewportRef.current.zoom })
    },
    [effectiveCanEdit, scheduleSave],
  )

  const handleMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      const previous = viewportRef.current
      const unchanged = previous.x === viewport.x && previous.y === viewport.y && previous.zoom === viewport.zoom
      viewportRef.current = viewport
      if (unchanged) return
      if (skipViewportSaveRef.current) {
        skipViewportSaveRef.current = false
        return
      }
      scheduleSave({
        positions: positionsRef.current,
        viewport: { x: viewport.x, y: viewport.y },
        zoom: viewport.zoom,
      })
    },
    [scheduleSave],
  )

  const applySavedViewport = useCallback(
    (instance: ReactFlowInstance<DiagramNode, DiagramEdge>) => {
      const layout = layoutQuery.data
      if (!layout) return false
      const viewport = { x: layout.viewport.x, y: layout.viewport.y, zoom: layout.zoom }
      viewportRef.current = viewport
      skipViewportSaveRef.current = true
      void instance.setViewport(viewport)
      return true
    },
    [layoutQuery.data],
  )

  const handleInit = useCallback(
    (instance: ReactFlowInstance<DiagramNode, DiagramEdge>) => {
      flowReadyRef.current = true
      if (layoutQuery.isLoading) return
      if (applySavedViewport(instance)) {
        appliedSavedViewportRef.current = true
        return
      }
      appliedSavedViewportRef.current = true
      skipViewportSaveRef.current = true
      void instance.fitView({ padding: 0.2 })
      setTimeout(() => {
        skipViewportSaveRef.current = false
      }, 400)
    },
    [applySavedViewport, layoutQuery.isLoading],
  )

  useEffect(() => {
    if (!layoutQuery.data || !flowReadyRef.current || appliedSavedViewportRef.current) return
    appliedSavedViewportRef.current = true
    const hasSavedPositions = Object.keys(layoutQuery.data.positions).length > 0
    skipViewportSaveRef.current = true
    if (hasSavedPositions) {
      const viewport = {
        x: layoutQuery.data.viewport.x,
        y: layoutQuery.data.viewport.y,
        zoom: layoutQuery.data.zoom,
      }
      viewportRef.current = viewport
      void setViewport(viewport)
    } else {
      void fitView({ padding: 0.2 })
    }
    setTimeout(() => {
      skipViewportSaveRef.current = false
    }, 400)
  }, [layoutQuery.data, setViewport, fitView])

  useEffect(() => {
    if (!flowReadyRef.current || selection.type === 'database') return
    const node = getNode(selection.table)
    if (!node) return
    const width = node.measured?.width ?? node.width ?? DIAGRAM_NODE_WIDTH
    const height = node.measured?.height ?? node.height ?? 180
    skipViewportSaveRef.current = true
    void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: viewportRef.current.zoom,
      duration: 250,
    })
  }, [selection, getNode, setCenter])

  const setTablePosition = useCallback((table: string, position: DiagramPosition) => {
    const next = { ...positionsRef.current, [table]: position }
    positionsRef.current = next
    setPositions(next)
  }, [])

  const persistPositions = useCallback(() => {
    scheduleSave({
      positions: positionsRef.current,
      viewport: viewportRef.current,
      zoom: viewportRef.current.zoom,
    })
  }, [scheduleSave])

  const addTableAt = useCallback(
    (position: DiagramPosition) => {
      if (!effectiveCanEdit) return
      const command = createTableCommand(workingDatabase)
      const table = (command.params as TableCreateParams).table.name
      setTablePosition(table, position)
      if (!editor.execute(command)) return
      onSelect({ type: 'table', table })
      persistPositions()
    },
    [effectiveCanEdit, workingDatabase, editor, onSelect, persistPositions, setTablePosition],
  )

  const addTableAtViewportCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : 200
    const y = rect ? rect.top + rect.height / 2 : 200
    addTableAt(screenToFlowPosition({ x, y }))
  }, [addTableAt, screenToFlowPosition])

  const requestDeleteRelationship = useCallback((table: string, relationship: RelationshipModel) => {
    setPendingDelete({ kind: 'relationship', table, relationship })
  }, [])

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'table') {
      editor.execute(deleteTableCommand(workingDatabase, pendingDelete.table))
      if (selection.type !== 'database' && selection.table === pendingDelete.table) {
        onSelect({ type: 'database' })
      }
      const next = { ...positionsRef.current }
      delete next[pendingDelete.table]
      positionsRef.current = next
      setPositions(next)
    } else if (pendingDelete.kind === 'column') {
      editor.execute(deleteColumnCommand(workingDatabase, pendingDelete.table, pendingDelete.column))
      if (
        selection.type === 'column' &&
        selection.table === pendingDelete.table &&
        selection.column === pendingDelete.column
      ) {
        onSelect({ type: 'table', table: pendingDelete.table })
      }
    } else {
      editor.execute(deleteRelationshipCommand(workingDatabase, pendingDelete.table, pendingDelete.relationship))
    }
    setPendingDelete(null)
  }, [pendingDelete, workingDatabase, editor, selection, onSelect])

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      if (!effectiveCanEdit) return
      if (!connection.source || !connection.target) return
      if (connection.source === connection.target) return
      setPendingRelationship({ source: connection.source, target: connection.target })
    },
    [effectiveCanEdit],
  )

  const handleNodeContextMenu: NodeMouseHandler<DiagramNode> = useCallback(
    (event, node) => {
      event.preventDefault()
      if (!effectiveCanEdit) return
      setMenu({ kind: 'node', x: event.clientX, y: event.clientY, table: node.id })
    },
    [effectiveCanEdit],
  )

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault()
      if (!effectiveCanEdit) return
      setMenu({
        kind: 'canvas',
        x: event.clientX,
        y: event.clientY,
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      })
    },
    [effectiveCanEdit, screenToFlowPosition],
  )

  const handlePickTable = useCallback(
    (table: string) => {
      if (relationshipMode === 'source') {
        setRelationshipSource(table)
        setRelationshipMode('target')
        return
      }
      if (relationshipMode === 'target' && relationshipSource) {
        if (table !== relationshipSource) {
          setPendingRelationship({ source: relationshipSource, target: table })
        }
        setRelationshipMode('off')
        setRelationshipSource(null)
      }
    },
    [relationshipMode, relationshipSource],
  )

  function toggleRelationshipMode() {
    if (relationshipMode === 'off') {
      setRelationshipMode('source')
      setRelationshipSource(null)
    } else {
      setRelationshipMode('off')
      setRelationshipSource(null)
    }
  }

  const matches = useMemo(() => diagramMatches(workingDatabase, query), [workingDatabase, query])
  const nodes = useMemo(
    () =>
      createDiagramNodes({
        database: workingDatabase,
        positions,
        selection,
        matches,
        query,
        draggable: effectiveCanEdit,
        onSelect,
        canEdit: effectiveCanEdit,
        relationshipMode: relationshipMode !== 'off',
        onPickTable: handlePickTable,
        onAddColumn: (table) => setOpenPopover({ kind: 'new-column', table }),
        onEditTable: (table) => setOpenPopover({ kind: 'table', table }),
        onEditColumn: (table, column) => setOpenPopover({ kind: 'column', table, column }),
        onDeleteColumn: (table, column) => setPendingDelete({ kind: 'column', table, column }),
        onDeleteRelationship: requestDeleteRelationship,
      }),
    [
      workingDatabase,
      positions,
      selection,
      matches,
      query,
      effectiveCanEdit,
      onSelect,
      relationshipMode,
      handlePickTable,
      requestDeleteRelationship,
    ],
  )
  const edges = useMemo(
    () => createDiagramEdges(workingDatabase, { canEdit: effectiveCanEdit, onDelete: requestDeleteRelationship }),
    [workingDatabase, effectiveCanEdit, requestDeleteRelationship],
  )

  const layoutStatus = !canEdit
    ? 'Somente leitura'
    : locked
      ? 'Edição bloqueada durante a atualização'
      : saveMutation.isPending
        ? 'Salvando...'
        : lastSavedAt
          ? `Salvo às: ${formatSavedAt(lastSavedAt)}`
          : 'Layout salvo automaticamente'

  const modelStatus = !effectiveCanEdit
    ? null
    : editor.saveState.status === 'saving'
      ? 'Salvando...'
      : editor.saveState.status === 'saved' && editor.saveState.savedAt
        ? `Salvo às: ${formatSavedAt(editor.saveState.savedAt)}`
        : editor.saveState.status === 'error'
          ? `Falha ao salvar: ${editor.saveState.error}`
          : null

  const saveStatus = modelStatus ?? (saveFailed ? 'Falha ao salvar o layout.' : layoutStatus)

  const menuItems: CanvasMenuItem[] =
    menu?.kind === 'canvas'
      ? [
          {
            label: 'Adicionar tabela',
            testId: 'canvas-menu-add-table',
            onSelect: () => addTableAt(menu.flow),
          },
        ]
      : menu?.kind === 'node'
        ? [
            {
              label: 'Propriedades',
              testId: 'canvas-menu-properties',
              onSelect: () => setOpenPopover({ kind: 'table', table: menu.table }),
            },
            {
              label: 'Excluir tabela',
              testId: 'canvas-menu-delete-table',
              danger: true,
              onSelect: () => setPendingDelete({ kind: 'table', table: menu.table }),
            },
          ]
        : []

  const editingColumn =
    openPopover?.kind === 'column'
      ? workingDatabase.tables
          .find((table) => table.name === openPopover.table)
          ?.columns.find((column) => column.name === openPopover.column)
      : undefined

  return (
    <div ref={wrapperRef} className="h-full w-full" data-testid="diagram-canvas">
      <ReactFlow<DiagramNode, DiagramEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onInit={handleInit}
        onConnect={handleConnect}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        nodesDraggable={effectiveCanEdit}
        nodesConnectable={effectiveCanEdit}
        elementsSelectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
        fitView={false}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        className="bg-slate-50"
        aria-label="Diagrama do modelo"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
        <Panel position="top-left" className="flex w-72 flex-col gap-1">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
            Buscar no diagrama
            <input
              type="search"
              className="nodrag nopan w-full rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
              aria-label="Buscar no diagrama"
              placeholder="Tabela ou campo"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {effectiveCanEdit ? (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                onClick={addTableAtViewportCenter}
                data-testid="diagram-add-table"
              >
                Adicionar tabela
              </button>
              <button
                type="button"
                className={`nodrag nopan rounded-sm border px-2 py-1 text-[11px] font-medium ${
                  relationshipMode === 'off'
                    ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                    : 'border-accent bg-indigo-50 text-accent'
                }`}
                onClick={toggleRelationshipMode}
                aria-pressed={relationshipMode !== 'off'}
                data-testid="diagram-relationship-mode"
              >
                Relacionamento 1:n
              </button>
              {editor.canUndo ? (
                <button
                  type="button"
                  className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                  onClick={() => editor.undo()}
                  data-testid="diagram-undo"
                >
                  Desfazer
                </button>
              ) : null}
              {editor.canRedo ? (
                <button
                  type="button"
                  className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                  onClick={() => editor.redo()}
                  data-testid="diagram-redo"
                >
                  Refazer
                </button>
              ) : null}
            </div>
          ) : null}
          {relationshipMode !== 'off' ? (
            <p className="rounded-sm bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700" role="status">
              {relationshipMode === 'source'
                ? 'Clique na tabela de origem.'
                : `Origem ${relationshipSource}. Clique na tabela de destino.`}
            </p>
          ) : null}
          <p
            className={`rounded-sm px-2 py-1 text-[11px] ${
              saveFailed || editor.saveState.status === 'error'
                ? 'bg-red-50 text-red-700'
                : 'bg-white/90 text-slate-500'
            }`}
            data-testid="diagram-save-status"
            role={saveFailed || editor.saveState.status === 'error' ? 'alert' : 'status'}
          >
            {saveStatus}
          </p>
          {layoutQuery.isError ? (
            <p className="rounded-sm bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              Não foi possível carregar o layout salvo.
            </p>
          ) : null}
        </Panel>
      </ReactFlow>

      {menu ? <CanvasContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={
            pendingDelete.kind === 'table'
              ? 'Excluir tabela'
              : pendingDelete.kind === 'column'
                ? 'Excluir coluna'
                : 'Excluir relacionamento'
          }
          message={
            pendingDelete.kind === 'table'
              ? `Excluir a tabela ${pendingDelete.table} e seus relacionamentos?`
              : pendingDelete.kind === 'column'
                ? `Excluir a coluna ${pendingDelete.table}.${pendingDelete.column}?`
                : `Excluir o relacionamento ${pendingDelete.table} → ${pendingDelete.relationship.table}?`
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {openPopover?.kind === 'new-column' ? (
        <ColumnPopover
          mode="create"
          database={workingDatabase}
          table={openPopover.table}
          onCancel={() => setOpenPopover(null)}
          onConfirm={(draft) => {
            const error = columnNameError(workingDatabase, openPopover.table, draft.name)
            if (error) return
            editor.execute(createColumnCommand(workingDatabase, openPopover.table, draft))
            onSelect({ type: 'column', table: openPopover.table, column: draft.name })
            setOpenPopover(null)
          }}
        />
      ) : null}

      {openPopover?.kind === 'column' && editingColumn ? (
        <ColumnPopover
          mode="edit"
          database={workingDatabase}
          table={openPopover.table}
          initial={{ name: editingColumn.name, type: editingColumn.type, primaryKey: editingColumn.primary_key }}
          onCancel={() => setOpenPopover(null)}
          onConfirm={(draft: ColumnDraft) => {
            const after: ColumnModel = {
              ...editingColumn,
              name: draft.name,
              type: draft.type,
              primary_key: draft.primaryKey,
            }
            editor.execute(updateColumnCommand(workingDatabase, openPopover.table, editingColumn, after))
            onSelect({ type: 'column', table: openPopover.table, column: draft.name })
            setOpenPopover(null)
          }}
        />
      ) : null}

      {openPopover?.kind === 'table' ? (
        <TablePopover
          database={workingDatabase}
          table={openPopover.table}
          onCancel={() => setOpenPopover(null)}
          onConfirm={(name) => {
            editor.execute(renameTableCommand(workingDatabase, openPopover.table, name))
            const nextPositions = { ...positionsRef.current }
            const position = nextPositions[openPopover.table]
            delete nextPositions[openPopover.table]
            if (position) nextPositions[name] = position
            positionsRef.current = nextPositions
            setPositions(nextPositions)
            if (selection.type !== 'database' && selection.table === openPopover.table) {
              onSelect({ ...selection, table: name })
            }
            setOpenPopover(null)
            persistPositions()
          }}
        />
      ) : null}

      {pendingRelationship ? (
        <RelationshipDialog
          database={workingDatabase}
          source={pendingRelationship.source}
          target={pendingRelationship.target}
          onCancel={() => setPendingRelationship(null)}
          onConfirm={(draft: RelationshipDraft) => {
            editor.execute(
              createRelationshipCommand(workingDatabase, {
                source: pendingRelationship.source,
                target: pendingRelationship.target,
                fkColumnName: draft.fkColumnName,
                createFkColumn: draft.createFkColumn,
              }),
            )
            onSelect({ type: 'table', table: pendingRelationship.source })
            setPendingRelationship(null)
          }}
        />
      ) : null}
    </div>
  )
}

export type { DiagramNodeData }
