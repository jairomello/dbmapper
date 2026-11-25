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
import { adaptiveColumns, layoutGrid, layoutStar, type LayoutRelationship } from '../diagram/auto-layout'
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
  columnMatchKey,
  createDiagramEdges,
  createDiagramNodes,
  DIAGRAM_NODE_WIDTH,
  type DiagramDetail,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeData,
  diagramMatches,
  incidentTableNames,
} from '../diagram/layout'
import { RelationshipDialog, type RelationshipDraft } from '../diagram/RelationshipDialog'
import { TableNode } from '../diagram/TableNode'
import { type DiagramSaveState, useDiagramEditing } from '../diagram/useDiagramEditing'
import { type DiagramZones, diagramQueryKey, useDiagramZones } from '../diagram/useDiagramZones'
import { wheelActionFor } from '../diagram/wheelPan'
import { DIAGRAM_TABLE_MIME } from '../diagram/zones'
import { ZoneTabs } from '../diagram/ZoneTabs'
import type { Selection } from '../lib/selection'
import { useTheme } from '../theme/theme'

const NODE_TYPES = { table: TableNode }
const EDGE_TYPES = { crowsfoot: CrowFootEdge }

const MIN_ZOOM = 0.05
const MAX_ZOOM = 2
const WHEEL_ZOOM_SENSITIVITY = 0.0015

const TOOL_BUTTON = 'nodrag nopan rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50'
const TOOL_IDLE = 'border-line-strong text-muted hover:bg-surface-2 hover:text-ink'
const TOOL_ACTIVE = 'border-accent bg-accent-soft text-accent'

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
  const [ctrlDown, setCtrlDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [detail, setDetail] = useState<DiagramDetail>('detailed')
  const [manualExpanded, setManualExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [focusTable, setFocusTable] = useState<string | null>(null)
  const { theme } = useTheme()
  const savedFocusViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const moveMode = tool === 'move'
  const panMode = moveMode || ctrlDown

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const flowAreaRef = useRef<HTMLDivElement | null>(null)
  const ctrlDownRef = useRef(false)
  ctrlDownRef.current = ctrlDown
  const panDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: { x: number; y: number; zoom: number }
  } | null>(null)
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const flowReadyRef = useRef(false)
  const appliedSavedViewportRef = useRef(false)
  const skipViewportSaveRef = useRef(false)
  const previousZoneRef = useRef(zones.activeZone)

  const { setViewport, getViewport, setCenter, getNode, fitView, screenToFlowPosition, zoomIn, zoomOut } =
    useReactFlow<DiagramNode, DiagramEdge>()

  useEffect(() => {
    function isControlKey(event: KeyboardEvent) {
      return event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight'
    }
    function onKeyDown(event: KeyboardEvent) {
      if (isControlKey(event)) setCtrlDown(true)
    }
    function onKeyUp(event: KeyboardEvent) {
      if (isControlKey(event)) setCtrlDown(false)
    }
    function release() {
      setCtrlDown(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
    }
  }, [])

  useEffect(() => {
    const element = flowAreaRef.current
    if (!element) return
    const area = element

    function hasScrollableAncestor(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      let node: Element | null = target
      while (node && node !== area) {
        const style = getComputedStyle(node)
        const scrollsVertically = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight
        const scrollsHorizontally =
          /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth
        if (scrollsVertically || scrollsHorizontally) return true
        node = node.parentElement
      }
      return false
    }

    function onWheel(event: WheelEvent) {
      const action = wheelActionFor(event)
      if (action.kind === 'pan' && hasScrollableAncestor(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      const current = getViewport()

      if (action.kind === 'zoom') {
        const rect = area.getBoundingClientRect()
        const factor = Math.exp(-action.deltaY * WHEEL_ZOOM_SENSITIVITY)
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor))
        if (zoom === current.zoom) return
        const pointX = event.clientX - rect.left
        const pointY = event.clientY - rect.top
        const ratio = zoom / current.zoom
        void setViewport({
          x: pointX - (pointX - current.x) * ratio,
          y: pointY - (pointY - current.y) * ratio,
          zoom,
        })
        return
      }

      void setViewport({ x: current.x + action.x, y: current.y + action.y, zoom: current.zoom })
    }

    element.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => element.removeEventListener('wheel', onWheel, { capture: true })
  }, [getViewport, setViewport])

  useEffect(() => {
    const element = flowAreaRef.current
    if (!element) return
    const area = element

    function isInteractive(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      return Boolean(
        target.closest(
          'button, a, input, select, textarea, [role="menu"], [role="dialog"], .react-flow__panel, .react-flow__controls, .react-flow__minimap',
        ),
      )
    }

    function finish(event: PointerEvent) {
      const drag = panDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      panDragRef.current = null
      setIsPanning(false)
      if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId)
    }

    function onPointerDown(event: PointerEvent) {
      const withControl = event.ctrlKey || ctrlDownRef.current
      if (!withControl || event.button !== 0 || isInteractive(event.target)) return
      if (!ctrlDownRef.current) setCtrlDown(true)
      setIsPanning(true)
      panDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: getViewport(),
      }
      area.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopPropagation()
    }

    function onPointerMove(event: PointerEvent) {
      const drag = panDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      void setViewport({
        x: drag.origin.x + (event.clientX - drag.startX),
        y: drag.origin.y + (event.clientY - drag.startY),
        zoom: drag.origin.zoom,
      })
    }

    area.addEventListener('pointerdown', onPointerDown, { capture: true })
    area.addEventListener('pointermove', onPointerMove, { capture: true })
    area.addEventListener('pointerup', finish, { capture: true })
    area.addEventListener('pointercancel', finish, { capture: true })
    return () => {
      area.removeEventListener('pointerdown', onPointerDown, { capture: true })
      area.removeEventListener('pointermove', onPointerMove, { capture: true })
      area.removeEventListener('pointerup', finish, { capture: true })
      area.removeEventListener('pointercancel', finish, { capture: true })
    }
  }, [getViewport, setViewport])

  const zoneDatabase = useMemo(() => {
    const members = new Set(zones.activeMembers)
    return {
      ...workingDatabase,
      tables: workingDatabase.tables.filter((table) => table.status !== 'REMOVED' && members.has(table.name)),
    }
  }, [workingDatabase, zones.activeMembers])

  const focusNames = useMemo(() => {
    if (!focusTable) return null
    const zoneNames = new Set(zoneDatabase.tables.map((table) => table.name))
    const names = new Set([...incidentTableNames(workingDatabase, focusTable)].filter((name) => zoneNames.has(name)))
    return names.size > 1 ? names : null
  }, [focusTable, workingDatabase, zoneDatabase])

  const viewDatabase = useMemo(
    () =>
      focusNames
        ? { ...zoneDatabase, tables: zoneDatabase.tables.filter((table) => focusNames.has(table.name)) }
        : zoneDatabase,
    [zoneDatabase, focusNames],
  )

  const canEditNow = effectiveCanEdit && !focusNames
  const minimapNode = theme === 'dark' ? '#5f7482' : '#c9bdb0'
  const minimapActive = theme === 'dark' ? '#94ebca' : '#57354d'
  const minimapStroke = theme === 'dark' ? '#94ebca' : '#57354d'
  const minimapMask = theme === 'dark' ? 'rgba(10, 15, 18, 0.2)' : 'rgba(87, 53, 77, 0.04)'

  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia ao trocar de zona
  useEffect(() => {
    setManualExpanded(new Set())
    setFocusTable(null)
  }, [zones.activeZone])

  useEffect(() => {
    zones.syncDatabase(workingDatabase)
  }, [workingDatabase, zones.syncDatabase])

  const modelSaving = editor.saveState.status === 'saving'
  useEffect(() => {
    zones.setModelSaving(modelSaving)
  }, [modelSaving, zones.setModelSaving])

  const relationshipKeys = useMemo(() => {
    const activeMembers = new Set(zones.zones.find((zone) => zone.name === zones.activeZone)?.members ?? [])
    const zoneByTable = new Map<string, string>()
    for (const zone of zones.zones) {
      for (const member of zone.members) {
        if (activeMembers.has(member)) continue
        if (!zoneByTable.has(member)) zoneByTable.set(member, zone.name)
      }
    }
    return buildRelationshipKeys(
      workingDatabase,
      (table) => (activeMembers.has(table) ? zones.activeZone : (zoneByTable.get(table) ?? null)),
    )
  }, [workingDatabase, zones.zones, zones.activeZone])

  const handleNodesChange: OnNodesChange<DiagramNode> = useCallback(
    (changes) => {
      let changed = false
      const next = { ...positions }

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          const current = next[change.id]
          if (current && current.x === change.position.x && current.y === change.position.y) continue
          next[change.id] = { ...current, x: change.position.x, y: change.position.y }
          changed = true
          continue
        }

        if (change.type === 'dimensions' && change.dimensions) {
          const current = next[change.id]
          if (!current) continue
          const width = Math.round(change.dimensions.width)
          const height = Math.round(change.dimensions.height)
          if (current.width === width && current.height === height) continue
          next[change.id] = { ...current, width, height }
          changed = true
        }
      }

      if (!changed) return
      zones.updatePositions(next)
    },
    [positions, zones],
  )

  const handleNodeDragStop: OnNodeDrag<DiagramNode> = useCallback(
    (_event, node) => {
      if (!effectiveCanEdit) return
      const current = positions[node.id]
      zones.updatePositions({
        ...positions,
        [node.id]: { ...current, x: node.position.x, y: node.position.y },
      })
    },
    [effectiveCanEdit, positions, zones],
  )

  const handleNodeResize = useCallback(
    (table: string, width: number, height: number) => {
      if (!effectiveCanEdit) return
      const current = positions[table]
      if (!current) return
      zones.updatePositions({
        ...positions,
        [table]: { ...current, width: Math.round(width), height: Math.round(height) },
      })
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
    const memberships = zones.zonesOf(selection.table)
    if (memberships.length === 0) return
    if (!memberships.includes(zones.activeZone)) {
      zones.setActiveZone(memberships[0])
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
  }, [selection, zones.activeZone, zones.zonesOf, zones.setActiveZone, getNode, setCenter])

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
      if (panMode) return
      onSelect(next)
    },
    [panMode, onSelect],
  )

  const activeRelationships = useMemo<LayoutRelationship[]>(() => {
    const names = new Set(viewDatabase.tables.map((table) => table.name))
    const seen = new Set<string>()
    const relationships: LayoutRelationship[] = []
    for (const table of viewDatabase.tables) {
      for (const relationship of table.relationships?.parents ?? []) {
        if (!names.has(relationship.table) || relationship.table === table.name) continue
        const key = `${table.name}\u0000${relationship.table}`
        if (seen.has(key)) continue
        seen.add(key)
        relationships.push({ source: table.name, target: relationship.table })
      }
    }
    return relationships
  }, [viewDatabase])

  const applyAutoLayout = useCallback(
    (algorithm: LayoutAlgorithm) => {
      setLayoutMenuOpen(false)
      if (!effectiveCanEdit || zoneDatabase.tables.length === 0) return
      const nextPositions =
        algorithm === 'grid'
          ? layoutGrid(zoneDatabase.tables, { columns: adaptiveColumns(zoneDatabase.tables.length) })
          : layoutStar(zoneDatabase.tables, activeRelationships)
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

  const selectedTable = selection.type === 'database' ? null : selection.table

  const enterFocus = useCallback(() => {
    if (!selectedTable) return
    if (!zoneDatabase.tables.some((table) => table.name === selectedTable)) return
    savedFocusViewportRef.current = { ...viewportRef.current }
    setFocusTable(selectedTable)
  }, [selectedTable, zoneDatabase])

  const exitFocus = useCallback(() => {
    const saved = savedFocusViewportRef.current
    savedFocusViewportRef.current = null
    setFocusTable(null)
    skipViewportSaveRef.current = true
    if (saved) void setViewport(saved)
    setTimeout(() => {
      skipViewportSaveRef.current = false
    }, 500)
  }, [setViewport])

  useEffect(() => {
    if (!focusTable) return
    skipViewportSaveRef.current = true
    const fit = setTimeout(() => {
      void fitView({ padding: 0.3, duration: 250 })
    }, 0)
    const release = setTimeout(() => {
      skipViewportSaveRef.current = false
    }, 600)
    return () => {
      clearTimeout(fit)
      clearTimeout(release)
    }
  }, [focusTable, fitView])

  const matches = useMemo(() => diagramMatches(viewDatabase, query), [viewDatabase, query])
  const expandedTables = useMemo(() => {
    const expanded = new Set(manualExpanded)
    if (selection.type === 'column') expanded.add(selection.table)
    for (const table of viewDatabase.tables) {
      if (table.columns.some((column) => matches.has(columnMatchKey(table.name, column.name)))) {
        expanded.add(table.name)
      }
    }
    return expanded
  }, [manualExpanded, selection, viewDatabase, matches])

  const nodes = useMemo(
    () =>
      createDiagramNodes({
        database: viewDatabase,
        positions,
        selection,
        matches,
        query,
        draggable: effectiveCanEdit && !panMode && !focusNames,
        keys: relationshipKeys,
        detail,
        expandedTables,
        onSelect: selectFromCanvas,
        canEdit: canEditNow,
        relationshipMode: relationshipMode !== 'off' && !panMode,
        onPickTable: handlePickTable,
        onAddColumn: (table) => setOpenPopover({ kind: 'new-column', table }),
        onEditTable: (table) => setOpenPopover({ kind: 'table', table }),
        onEditColumn: (table, column) => setOpenPopover({ kind: 'column', table, column }),
        onDeleteColumn: (table, column) => setPendingDelete({ kind: 'column', table, column }),
        onDeleteRelationship: requestDeleteRelationship,
        onResize: handleNodeResize,
        onExpand: (table) => setManualExpanded((current) => new Set(current).add(table)),
      }),
    [
      viewDatabase,
      positions,
      selection,
      matches,
      query,
      effectiveCanEdit,
      panMode,
      selectFromCanvas,
      relationshipMode,
      handlePickTable,
      requestDeleteRelationship,
      relationshipKeys,
      handleNodeResize,
      detail,
      expandedTables,
      focusNames,
      canEditNow,
    ],
  )
  const edges = useMemo(
    () =>
      createDiagramEdges(viewDatabase, {
        canEdit: canEditNow,
        selectedTable,
        onDelete: requestDeleteRelationship,
      }),
    [viewDatabase, canEditNow, selectedTable, requestDeleteRelationship],
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
              .filter((zone) => !zones.isInZone(menu.table, zone.name))
              .map((zone) => ({
                label: `Adicionar a ${zone.name}`,
                testId: `canvas-menu-add-${zone.name}`,
                onSelect: () => zones.addTableToZone(menu.table, zone.name),
              })),
            {
              label: 'Remover desta aba',
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
    zones.zonesOf(selectedTable).length === 0 &&
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
      const background = getComputedStyle(element).backgroundColor
      const dataUrl = await renderDiagram(element, format, background)
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
      className={`flex h-full w-full flex-col ${panMode ? 'select-none' : ''}`}
      data-pan-mode={panMode ? 'true' : undefined}
      data-panning={isPanning ? 'true' : undefined}
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
        onAddTable={(table, zone) => {
          if (zones.addTableToZone(table, zone)) onSelect({ type: 'table', table })
        }}
      />
      <div ref={flowAreaRef} className="relative min-h-0 flex-1">
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
          onPaneClick={() => onSelect({ type: 'database' })}
          onPaneContextMenu={handlePaneContextMenu}
          zoomOnScroll={false}
          zoomActivationKeyCode={null}
          nodesDraggable={canEditNow && !panMode}
          nodesConnectable={canEditNow && !panMode}
          panOnDrag={moveMode || !canEditNow}
          elementsSelectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          fitView={false}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          className="bg-canvas"
          aria-label="Diagrama do modelo"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            style={{ width: 240, height: 180 }}
            nodeStrokeWidth={3}
            nodeColor={(node) => (node.selected ? minimapActive : minimapNode)}
            nodeStrokeColor={() => minimapStroke}
            maskColor={minimapMask}
          />

          <Panel position="top-left" className="flex w-72 flex-col gap-1.5">
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Buscar no diagrama
              <span className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface/95 px-2 py-1.5 shadow-sm backdrop-blur">
                <span aria-hidden="true" className="text-muted">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="search"
                  className="nodrag nopan min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
                  aria-label="Buscar no diagrama"
                  placeholder="Tabela ou campo"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
            </label>

            {focusNames ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/50 bg-surface/95 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur"
                data-testid="diagram-focus-chip"
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                  <span aria-hidden="true">◎</span> Vizinhança direta
                </span>
                <span className="text-muted">
                  {edges.length} {edges.length === 1 ? 'relação em foco' : 'relações em foco'}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-0.5 font-medium text-ink hover:bg-surface-2"
                  onClick={exitFocus}
                  data-testid="diagram-focus-exit"
                >
                  Zona completa
                </button>
              </div>
            ) : null}

            {relationshipMode !== 'off' ? (
              <p
                className="rounded-lg border border-accent/40 bg-accent-soft px-2 py-1.5 text-[11px] text-accent"
                role="status"
              >
                {relationshipMode === 'source'
                  ? 'Clique na tabela de origem.'
                  : `Origem ${relationshipSource}. Clique na tabela de destino.`}
              </p>
            ) : null}
          </Panel>

          <Panel
            position="bottom-center"
            className="flex max-w-[min(94vw,920px)] flex-wrap items-center gap-1 rounded-xl border border-line bg-surface/95 px-2 py-1.5 shadow-lg backdrop-blur"
            data-testid="diagram-toolbar"
            role="toolbar"
            aria-label="Ferramentas do diagrama"
          >
            {canEditNow ? (
              <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
                <button
                  type="button"
                  className={`nodrag nopan rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    !panMode ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                  aria-pressed={!panMode}
                  onClick={() => setTool('select')}
                  data-testid="diagram-tool-select"
                >
                  Selecionar
                </button>
                <button
                  type="button"
                  className={`nodrag nopan rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    panMode ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                  aria-pressed={panMode}
                  onClick={() => setTool('move')}
                  title="Mover (segure Ctrl para ativar temporariamente)"
                  data-testid="diagram-tool-move"
                >
                  Mover
                </button>
              </div>
            ) : null}

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={`${TOOL_BUTTON} ${TOOL_IDLE} px-2 font-semibold`}
                aria-label="Aproximar"
                title="Aproximar"
                onClick={() => void zoomIn()}
                data-testid="diagram-zoom-in"
              >
                +
              </button>
              <button
                type="button"
                className={`${TOOL_BUTTON} ${TOOL_IDLE} px-2 font-semibold`}
                aria-label="Afastar"
                title="Afastar"
                onClick={() => void zoomOut()}
                data-testid="diagram-zoom-out"
              >
                −
              </button>
              <button
                type="button"
                className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                aria-label="Ajustar à tela"
                title="Ajustar à tela"
                onClick={() => void fitView({ padding: 0.2 })}
                data-testid="diagram-fit-view"
              >
                Ajustar
              </button>
            </div>

            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />

            <button
              type="button"
              className={`${TOOL_BUTTON} ${detail === 'compact' ? TOOL_ACTIVE : TOOL_IDLE}`}
              aria-pressed={detail === 'compact'}
              onClick={() => setDetail((current) => (current === 'compact' ? 'detailed' : 'compact'))}
              data-testid="diagram-detail-toggle"
            >
              {detail === 'compact' ? 'Compacto' : 'Detalhes'}
            </button>

            {selectedTable && !focusNames ? (
              <button
                type="button"
                className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                onClick={enterFocus}
                aria-label={`Focar relações de ${selectedTable}`}
                data-testid="diagram-focus"
              >
                Focar relações
              </button>
            ) : null}

            {canEditNow ? (
              <>
                <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
                <button
                  type="button"
                  className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                  onClick={addTableAtViewportCenter}
                  data-testid="diagram-add-table"
                >
                  + Tabela
                </button>
                <button
                  type="button"
                  className={`${TOOL_BUTTON} ${relationshipMode === 'off' ? TOOL_IDLE : TOOL_ACTIVE}`}
                  onClick={toggleRelationshipMode}
                  aria-pressed={relationshipMode !== 'off'}
                  data-testid="diagram-relationship-mode"
                >
                  Relacionamento 1:n
                </button>
                <div className="relative">
                  <button
                    type="button"
                    className={`${TOOL_BUTTON} ${layoutMenuOpen ? TOOL_ACTIVE : TOOL_IDLE}`}
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
                      className="absolute bottom-full left-0 z-20 mb-1 flex w-40 flex-col rounded-lg border border-line bg-surface py-1 shadow-xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="nodrag nopan px-3 py-1.5 text-left text-[11px] font-medium text-ink hover:bg-surface-2"
                        onClick={() => applyAutoLayout('grid')}
                        data-testid="diagram-layout-grid"
                      >
                        Em grade
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="nodrag nopan px-3 py-1.5 text-left text-[11px] font-medium text-ink hover:bg-surface-2"
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
                    className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                    onClick={() => editor.undo()}
                    data-testid="diagram-undo"
                  >
                    Desfazer
                  </button>
                ) : null}
                {editor.canRedo ? (
                  <button
                    type="button"
                    className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                    onClick={() => editor.redo()}
                    data-testid="diagram-redo"
                  >
                    Refazer
                  </button>
                ) : null}
              </>
            ) : null}

            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
            <div className="flex items-center gap-1" data-testid="diagram-export-actions">
              <button
                type="button"
                className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                aria-label="Exportar PNG"
                onClick={() => void handleExport('png')}
                disabled={exporting !== null}
                data-testid="diagram-export-png"
              >
                {exporting === 'png' ? '…' : 'PNG'}
              </button>
              <button
                type="button"
                className={`${TOOL_BUTTON} ${TOOL_IDLE}`}
                aria-label="Exportar SVG"
                onClick={() => void handleExport('svg')}
                disabled={exporting !== null}
                data-testid="diagram-export-svg"
              >
                {exporting === 'svg' ? '…' : 'SVG'}
              </button>
            </div>

            {exportError ? (
              <p className="w-full rounded-md bg-danger-soft px-2 py-1 text-[11px] text-danger" role="alert">
                {exportError}
              </p>
            ) : null}
          </Panel>

          <Panel position="bottom-left" className="flex flex-col gap-1">
            <p
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] shadow-sm backdrop-blur ${
                zones.saveState.error || editor.saveState.status === 'error'
                  ? 'border-danger/40 bg-danger-soft text-danger'
                  : 'border-line bg-surface/95 text-muted'
              }`}
              data-testid="diagram-save-status"
              role={zones.saveState.error || editor.saveState.status === 'error' ? 'alert' : 'status'}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  zones.saveState.error || editor.saveState.status === 'error'
                    ? 'bg-red-500'
                    : zones.saveState.pending || editor.saveState.status === 'saving'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
              />
              {saveStatus}
            </p>
            {zones.isError ? (
              <p className="rounded-md border border-warning/40 bg-warning-soft px-2 py-1 text-[11px] text-warning">
                Não foi possível carregar o layout salvo.
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
          title="Remover desta aba"
          confirmLabel="Remover"
          message={`Remover ${pendingRemove} desta aba? A tabela continua no dicionário, na árvore semântica e nas outras abas em que aparece.`}
          onConfirm={() => {
            zones.removeTableFromActiveZone(pendingRemove)
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
