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
import {
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { DiagramPosition } from '../api/types'
import { layoutGrid, layoutStar, type LayoutRelationship } from '../diagram/auto-layout'
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
import { diagramFileName, downloadDiagram, renderDiagram, type DiagramExportFormat } from '../diagram/exportDiagram'
import {
  buildRelationshipKeys,
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
import { type DiagramZones, diagramQueryKey, useDiagramZones } from '../diagram/useDiagramZones'
import { DIAGRAM_TABLE_MIME } from '../diagram/zones'
import { ZoneTabs } from '../diagram/ZoneTabs'
import type { Selection } from '../lib/selection'

const NODE_TYPES = { table: TableNode }
const EDGE_TYPES = { crowsfoot: CrowFootEdge }

export { diagramQueryKey }

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

type CanvasTool = 'select' | 'move'

type LayoutAlgorithm = 'grid' | 'star'

export interface DiagramCanvasProps {
  projectId: string
  database: DatabaseModel
  selection: Selection
  onSelect: (selection: Selection) => void
  canEdit: boolean
  locked?: boolean
  onSaveStateChange?: (state: DiagramSaveState) => void
  zones?: DiagramZones
}

export function DiagramCanvas(props: DiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      {props.zones ? <DiagramCanvasInner {...props} zones={props.zones} /> : <DiagramCanvasWithZones {...props} />}
    </ReactFlowProvider>
  )
}

function DiagramCanvasWithZones(props: DiagramCanvasProps) {
  const zones = useDiagramZones({
    projectId: props.projectId,
    database: props.database,
    canEdit: props.canEdit,
    locked: props.locked,
  })
  return <DiagramCanvasInner {...props} zones={zones} />
}

function DiagramCanvasInner({
  projectId,
  database,
  selection,
  onSelect,
  canEdit,
  locked = false,
  onSaveStateChange,
  zones,
}: DiagramCanvasProps & { zones: DiagramZones }) {
  const editor = useDiagramEditing({
    projectId,
    database,
    canEdit,
    locked,
    onSaveStateChange,
  })
  const workingDatabase = editor.database
  const effectiveCanEdit = canEdit && !locked
  const positions = zones.activeLayout.positions

  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<CanvasMenu | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [openPopover, setOpenPopover] = useState<OpenPopover | null>(null)
  const [pendingRelationship, setPendingRelationship] = useState<{ source: string; target: string } | null>(null)
  const [relationshipMode, setRelationshipMode] = useState<RelationshipMode>('off')
  const [relationshipSource, setRelationshipSource] = useState<string | null>(null)
  const [exporting, setExporting] = useState<DiagramExportFormat | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const moveMode = tool === 'move'

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const flowReadyRef = useRef(false)
  const appliedSavedViewportRef = useRef(false)
  const skipViewportSaveRef = useRef(false)
  const previousZoneRef = useRef(zones.activeZone)

  const { setViewport, setCenter, getNode, fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow<
    DiagramNode,
    DiagramEdge
  >()

  const zoneDatabase = useMemo(() => {
    const members = new Set(zones.activeMembers)
    return {
      ...workingDatabase,
      tables: workingDatabase.tables.filter((table) => table.status !== 'REMOVED' && members.has(table.name)),
    }
  }, [workingDatabase, zones.activeMembers])

  useEffect(() => {
    zones.syncDatabase(workingDatabase)
  }, [workingDatabase, zones.syncDatabase])

  const modelSaving = editor.saveState.status === 'saving'
  useEffect(() => {
    zones.setModelSaving(modelSaving)
  }, [modelSaving, zones.setModelSaving])

  const relationshipKeys = useMemo(() => {
    const zoneByTable = new Map<string, string>()
    for (const zone of zones.zones) {
      for (const member of zone.members) zoneByTable.set(member, zone.name)
    }
    return buildRelationshipKeys(workingDatabase, (table) => zoneByTable.get(table) ?? null)
  }, [workingDatabase, zones.zones])

  const handleNodesChange: OnNodesChange<DiagramNode> = useCallback(
    (changes) => {
      let changed = false
      const next = { ...positions }

      for (const change of changes) {
        if (change.type !== 'position' || !change.position) continue
        const current = next[change.id]
        if (current && current.x === change.position.x && current.y === change.position.y) continue
        next[change.id] = change.position
        changed = true
      }

      if (!changed) return
      zones.updatePositions(next)
    },
    [positions, zones],
  )

  const handleNodeDragStop: OnNodeDrag<DiagramNode> = useCallback(
    (_event, node) => {
      if (!effectiveCanEdit) return
      zones.updatePositions({ ...positions, [node.id]: node.position })
    },
    [effectiveCanEdit, positions, zones],
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
      zones.updateViewport({ x: viewport.x, y: viewport.y }, viewport.zoom)
    },
    [zones],
  )

  const applySavedViewport = useCallback(
    (instance: ReactFlowInstance<DiagramNode, DiagramEdge>) => {
      if (zones.activeLayout.updatedAt === null) return false
      const viewport = {
        x: zones.activeLayout.viewport.x,
        y: zones.activeLayout.viewport.y,
        zoom: zones.activeLayout.zoom,
      }
      viewportRef.current = viewport
      skipViewportSaveRef.current = true
      void instance.setViewport(viewport)
      return true
    },
    [zones.activeLayout],
  )

  const handleInit = useCallback(
    (instance: ReactFlowInstance<DiagramNode, DiagramEdge>) => {
      flowReadyRef.current = true
      if (zones.isLoading) return
      appliedSavedViewportRef.current = true
      skipViewportSaveRef.current = true
      if (!applySavedViewport(instance)) void instance.fitView({ padding: 0.2 })
      setTimeout(() => {
        skipViewportSaveRef.current = false
      }, 400)
    },
    [applySavedViewport, zones.isLoading],
  )

  useEffect(() => {
    if (zones.isLoading || !flowReadyRef.current || appliedSavedViewportRef.current) return
    appliedSavedViewportRef.current = true
    skipViewportSaveRef.current = true
    if (zones.activeLayout.updatedAt !== null) {
      const viewport = {
        x: zones.activeLayout.viewport.x,
        y: zones.activeLayout.viewport.y,
        zoom: zones.activeLayout.zoom,
      }
      viewportRef.current = viewport
      void setViewport(viewport)
    } else {
      void fitView({ padding: 0.2 })
    }
    setTimeout(() => {
      skipViewportSaveRef.current = false
    }, 400)
  }, [zones.isLoading, zones.activeLayout, setViewport, fitView])

  useEffect(() => {
    if (previousZoneRef.current === zones.activeZone) return
    previousZoneRef.current = zones.activeZone
    if (!flowReadyRef.current) return
    skipViewportSaveRef.current = true
    if (zones.activeLayout.updatedAt !== null) {
      const viewport = {
        x: zones.activeLayout.viewport.x,
        y: zones.activeLayout.viewport.y,
        zoom: zones.activeLayout.zoom,
      }
      viewportRef.current = viewport
      void setViewport(viewport)
    } else {
      void fitView({ padding: 0.2 })
    }
    setTimeout(() => {
      skipViewportSaveRef.current = false
    }, 400)
  }, [zones.activeZone, zones.activeLayout, setViewport, fitView])

  useEffect(() => {
    if (!flowReadyRef.current || selection.type === 'database') return
    const zone = zones.zoneOf(selection.table)
    if (!zone) return
    if (zone !== zones.activeZone) {
      zones.setActiveZone(zone)
      return
    }
    const node = getNode(selection.table)
    if (!node) return
    const width = node.measured?.width ?? node.width ?? DIAGRAM_NODE_WIDTH
    const height = node.measured?.height ?? node.height ?? 180
    skipViewportSaveRef.current = true
    void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: viewportRef.current.zoom,
      duration: 250,
    })
  }, [selection, zones.activeZone, zones.zoneOf, zones.setActiveZone, getNode, setCenter])

  const addTableAt = useCallback(
    (position: DiagramPosition) => {
      if (!effectiveCanEdit) return
      const command = createTableCommand(workingDatabase)
      const table = (command.params as TableCreateParams).table.name
      if (!editor.execute(command)) return
      zones.addTableToPrincipal(table, position)
      onSelect({ type: 'table', table })
    },
    [effectiveCanEdit, workingDatabase, editor, zones, onSelect],
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
      zones.forgetTable(pendingDelete.table)
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
  }, [pendingDelete, workingDatabase, editor, selection, onSelect, zones])

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

  const selectFromCanvas = useCallback(
    (next: Selection) => {
      if (moveMode) return
      onSelect(next)
    },
    [moveMode, onSelect],
  )

  const activeRelationships = useMemo<LayoutRelationship[]>(() => {
    const names = new Set(zoneDatabase.tables.map((table) => table.name))
    const seen = new Set<string>()
    const relationships: LayoutRelationship[] = []
    for (const table of zoneDatabase.tables) {
      for (const relationship of table.relationships?.parents ?? []) {
        if (!names.has(relationship.table) || relationship.table === table.name) continue
        const key = `${table.name}\u0000${relationship.table}`
        if (seen.has(key)) continue
        seen.add(key)
        relationships.push({ source: table.name, target: relationship.table })
      }
    }
    return relationships
  }, [zoneDatabase])

  const applyAutoLayout = useCallback(
    (algorithm: LayoutAlgorithm) => {
      setLayoutMenuOpen(false)
      if (!effectiveCanEdit || zoneDatabase.tables.length === 0) return
      const nextPositions =
        algorithm === 'grid' ? layoutGrid(zoneDatabase.tables) : layoutStar(zoneDatabase.tables, activeRelationships)
      const applied = zones.applyActiveLayout(
        nextPositions,
        { x: viewportRef.current.x, y: viewportRef.current.y },
        viewportRef.current.zoom,
      )
      if (!applied) return
      skipViewportSaveRef.current = true
      void fitView({ padding: 0.2 })
      setTimeout(() => {
        skipViewportSaveRef.current = false
      }, 400)
    },
    [effectiveCanEdit, zoneDatabase, activeRelationships, zones, fitView],
  )

  const matches = useMemo(() => diagramMatches(zoneDatabase, query), [zoneDatabase, query])
  const selectedTable = selection.type === 'database' ? null : selection.table
  const nodes = useMemo(
    () =>
      createDiagramNodes({
        database: zoneDatabase,
        positions,
        selection,
        matches,
        query,
        draggable: effectiveCanEdit && !moveMode,
        keys: relationshipKeys,
        onSelect: selectFromCanvas,
        canEdit: effectiveCanEdit,
        relationshipMode: relationshipMode !== 'off' && !moveMode,
        onPickTable: handlePickTable,
        onAddColumn: (table) => setOpenPopover({ kind: 'new-column', table }),
        onEditTable: (table) => setOpenPopover({ kind: 'table', table }),
        onEditColumn: (table, column) => setOpenPopover({ kind: 'column', table, column }),
        onDeleteColumn: (table, column) => setPendingDelete({ kind: 'column', table, column }),
        onDeleteRelationship: requestDeleteRelationship,
      }),
    [
      zoneDatabase,
      positions,
      selection,
      matches,
      query,
      effectiveCanEdit,
      moveMode,
      selectFromCanvas,
      relationshipMode,
      handlePickTable,
      requestDeleteRelationship,
      relationshipKeys,
    ],
  )
  const edges = useMemo(
    () =>
      createDiagramEdges(zoneDatabase, {
        canEdit: effectiveCanEdit,
        selectedTable,
        onDelete: requestDeleteRelationship,
      }),
    [zoneDatabase, effectiveCanEdit, selectedTable, requestDeleteRelationship],
  )

  const layoutStatus = !canEdit
    ? 'Somente leitura'
    : locked
      ? 'Edição bloqueada durante a atualização'
      : zones.saveState.pending
        ? 'Salvando...'
        : zones.saveState.savedAt
          ? `Salvo às: ${formatSavedAt(zones.saveState.savedAt)}`
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

  const saveStatus = modelStatus ?? (zones.saveState.error ? 'Falha ao salvar o layout.' : layoutStatus)

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
            ...zones.zones
              .filter((zone) => zone.name !== zones.zoneOf(menu.table))
              .map((zone) => ({
                label: `Mover para ${zone.name}`,
                testId: `canvas-menu-move-${zone.name}`,
                onSelect: () => zones.moveTable(menu.table, zone.name),
              })),
            {
              label: 'Remover do diagrama',
              testId: 'canvas-menu-remove-from-diagram',
              onSelect: () => setPendingRemove(menu.table),
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

  const selectedOutsideZone =
    selectedTable !== null &&
    zones.zoneOf(selectedTable) === null &&
    workingDatabase.tables.some((table) => table.name === selectedTable && table.status !== 'REMOVED')

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!effectiveCanEdit) return
    if (!event.dataTransfer.types.includes(DIAGRAM_TABLE_MIME) && !event.dataTransfer.types.includes('text/plain'))
      return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!effectiveCanEdit) return
    const table = event.dataTransfer.getData(DIAGRAM_TABLE_MIME) || event.dataTransfer.getData('text/plain')
    if (!table) return
    event.preventDefault()
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    if (zones.addTableToActiveZone(table, position)) onSelect({ type: 'table', table })
  }

  async function handleExport(format: DiagramExportFormat) {
    const element = wrapperRef.current?.querySelector<HTMLElement>('.react-flow')
    if (!element) {
      setExportError('Não foi possível localizar o diagrama para exportar.')
      return
    }
    setExporting(format)
    setExportError(null)
    try {
      const dataUrl = await renderDiagram(element, format)
      downloadDiagram(dataUrl, diagramFileName(zones.activeZone, format))
    } catch {
      setExportError('Não foi possível exportar o diagrama.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="flex h-full w-full flex-col"
      data-testid="diagram-canvas"
      role="application"
      aria-label="Área do diagrama"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ZoneTabs
        zones={zones.zones}
        activeZone={zones.activeZone}
        canEdit={effectiveCanEdit}
        onActivate={zones.setActiveZone}
        onCreate={zones.createZone}
        onRename={zones.renameZone}
        onDelete={zones.deleteZone}
        onReorder={zones.reorderZones}
      />
      <div className="relative min-h-0 flex-1">
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
          nodesDraggable={effectiveCanEdit && !moveMode}
          nodesConnectable={effectiveCanEdit && !moveMode}
        panOnDrag={moveMode || !effectiveCanEdit}
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
            {relationshipMode !== 'off' ? (
              <p className="rounded-sm bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700" role="status">
                {relationshipMode === 'source'
                  ? 'Clique na tabela de origem.'
                  : `Origem ${relationshipSource}. Clique na tabela de destino.`}
              </p>
            ) : null}
            <p
              className={`rounded-sm px-2 py-1 text-[11px] ${
                zones.saveState.error || editor.saveState.status === 'error'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-white/90 text-slate-500'
              }`}
              data-testid="diagram-save-status"
              role={zones.saveState.error || editor.saveState.status === 'error' ? 'alert' : 'status'}
            >
              {saveStatus}
            </p>
            {zones.isError ? (
              <p className="rounded-sm bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                Não foi possível carregar o layout salvo.
              </p>
            ) : null}
          </Panel>
          <Panel
            position="top-center"
            className="flex max-w-[min(92vw,860px)] flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 shadow-sm"
            data-testid="diagram-toolbar"
            role="toolbar"
            aria-label="Ferramentas do diagrama"
          >
            {effectiveCanEdit ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`nodrag nopan rounded-sm border px-2 py-1 text-[11px] font-medium ${
                    tool === 'select'
                      ? 'border-accent bg-indigo-50 text-accent'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-pressed={tool === 'select'}
                  onClick={() => setTool('select')}
                  data-testid="diagram-tool-select"
                >
                  Selecionar
                </button>
                <button
                  type="button"
                  className={`nodrag nopan rounded-sm border px-2 py-1 text-[11px] font-medium ${
                    tool === 'move'
                      ? 'border-accent bg-indigo-50 text-accent'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-pressed={tool === 'move'}
                  onClick={() => setTool('move')}
                  data-testid="diagram-tool-move"
                >
                  Mover
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                aria-label="Aproximar"
                title="Aproximar"
                onClick={() => void zoomIn()}
                data-testid="diagram-zoom-in"
              >
                +
              </button>
              <button
                type="button"
                className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                aria-label="Afastar"
                title="Afastar"
                onClick={() => void zoomOut()}
                data-testid="diagram-zoom-out"
              >
                −
              </button>
              <button
                type="button"
                className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                aria-label="Ajustar à tela"
                title="Ajustar à tela"
                onClick={() => void fitView({ padding: 0.2 })}
                data-testid="diagram-fit-view"
              >
                Ajustar
              </button>
            </div>
            <div className="flex flex-wrap gap-1" data-testid="diagram-export-actions">
              <button
                type="button"
                className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => void handleExport('png')}
                disabled={exporting !== null}
                data-testid="diagram-export-png"
              >
                {exporting === 'png' ? 'Exportando…' : 'Exportar PNG'}
              </button>
              <button
                type="button"
                className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => void handleExport('svg')}
                disabled={exporting !== null}
                data-testid="diagram-export-svg"
              >
                {exporting === 'svg' ? 'Exportando…' : 'Exportar SVG'}
              </button>
            </div>
            {effectiveCanEdit ? (
              <div className="flex flex-wrap items-center gap-1">
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
                <div className="relative">
                  <button
                    type="button"
                    className="nodrag nopan rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                    aria-haspopup="menu"
                    aria-expanded={layoutMenuOpen}
                    onClick={() => setLayoutMenuOpen((open) => !open)}
                    data-testid="diagram-auto-layout"
                  >
                    Organizar
                  </button>
                  {layoutMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="Organização automática"
                      className="absolute left-0 top-full z-20 mt-1 flex w-40 flex-col rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="nodrag nopan px-3 py-1.5 text-left text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        onClick={() => applyAutoLayout('grid')}
                        data-testid="diagram-layout-grid"
                      >
                        Em grade
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="nodrag nopan px-3 py-1.5 text-left text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        onClick={() => applyAutoLayout('star')}
                        data-testid="diagram-layout-star"
                      >
                        Em estrela
                      </button>
                    </div>
                  ) : null}
                </div>
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
            {exportError ? (
              <p className="w-full rounded-sm bg-red-50 px-2 py-1 text-[11px] text-red-700" role="alert">
                {exportError}
              </p>
            ) : null}
          </Panel>
        </ReactFlow>

        {selectedOutsideZone && selectedTable ? (
          <div
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-md"
            data-testid="diagram-outside-zone"
            role="status"
          >
            <span>
              {effectiveCanEdit
                ? `A tabela ${selectedTable} está fora do diagrama.`
                : `A tabela ${selectedTable} está fora do diagrama.`}
            </span>
            {effectiveCanEdit ? (
              <button
                type="button"
                className="rounded-sm border border-amber-400 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                onClick={() => {
                  zones.addTableToActiveZone(selectedTable)
                }}
                data-testid="diagram-add-to-zone"
              >
                Adicionar à aba atual
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {menu ? <CanvasContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}

      {pendingRemove ? (
        <ConfirmDialog
          title="Remover do diagrama"
          confirmLabel="Remover"
          message={`Remover ${pendingRemove} do diagrama? A tabela continua no dicionário e na árvore semântica.`}
          onConfirm={() => {
            zones.removeTable(pendingRemove)
            setPendingRemove(null)
          }}
          onCancel={() => setPendingRemove(null)}
        />
      ) : null}

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
            const from = openPopover.table
            editor.execute(renameTableCommand(workingDatabase, from, name))
            zones.renameTable(from, name)
            if (selection.type !== 'database' && selection.table === from) {
              onSelect({ ...selection, table: name })
            }
            setOpenPopover(null)
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
