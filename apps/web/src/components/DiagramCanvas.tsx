import { useMutation, useQuery } from '@tanstack/react-query'
import type { DatabaseModel } from '@dbmapper/domain'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type OnNodesChange,
  type OnMoveEnd,
  type OnNodeDrag,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diagramApi } from '../api/diagram'
import type { DiagramLayoutInput, DiagramPosition } from '../api/types'
import { CrowFootEdge } from '../diagram/CrowFootEdge'
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
import { TableNode } from '../diagram/TableNode'
import type { Selection } from '../lib/selection'

const SAVE_DEBOUNCE_MS = 500

const NODE_TYPES = { table: TableNode }
const EDGE_TYPES = { crowsfoot: CrowFootEdge }

export const diagramQueryKey = (projectId: string) => ['diagram', projectId] as const

function formatSavedAt(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export interface DiagramCanvasProps {
  projectId: string
  database: DatabaseModel
  selection: Selection
  onSelect: (selection: Selection) => void
  canEdit: boolean
}

export function DiagramCanvas(props: DiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      <DiagramCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function DiagramCanvasInner({ projectId, database, selection, onSelect, canEdit }: DiagramCanvasProps) {
  const layoutQuery = useQuery({
    queryKey: diagramQueryKey(projectId),
    queryFn: () => diagramApi.get(projectId),
    retry: false,
  })

  const [positions, setPositions] = useState<Record<string, DiagramPosition>>(() => buildPositions(database))
  const [query, setQuery] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  const positionsRef = useRef(positions)
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<DiagramLayoutInput | null>(null)
  const flowReadyRef = useRef(false)
  const appliedSavedViewportRef = useRef(false)
  const skipViewportSaveRef = useRef(false)
  const lastDatabaseRef = useRef<DatabaseModel | null>(null)
  const lastLayoutRef = useRef<unknown>(null)

  const { setViewport, setCenter, getNode, fitView } = useReactFlow<DiagramNode, DiagramEdge>()

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  useEffect(() => {
    const savedLayout = layoutQuery.data
    if (lastDatabaseRef.current === database && lastLayoutRef.current === savedLayout) return
    lastDatabaseRef.current = database
    lastLayoutRef.current = savedLayout

    const next = buildPositions(database, savedLayout?.positions ?? {})
    positionsRef.current = next
    setPositions(next)
  }, [database, layoutQuery.data])

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
      if (!canEdit) return
      pendingRef.current = layout
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        flush()
      }, SAVE_DEBOUNCE_MS)
    },
    [canEdit, flush],
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
      if (!canEdit) return
      const next = { ...positionsRef.current, [node.id]: node.position }
      positionsRef.current = next
      setPositions(next)
      scheduleSave({ positions: next, viewport: viewportRef.current, zoom: viewportRef.current.zoom })
    },
    [canEdit, scheduleSave],
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

  const matches = useMemo(() => diagramMatches(database, query), [database, query])
  const nodes = useMemo(
    () =>
      createDiagramNodes({
        database,
        positions,
        selection,
        matches,
        query,
        draggable: canEdit,
        onSelect,
      }),
    [database, positions, selection, matches, query, canEdit, onSelect],
  )
  const edges = useMemo(() => createDiagramEdges(database), [database])

  const saveStatus = !canEdit
    ? 'Somente leitura'
    : saveMutation.isPending
      ? 'Salvando...'
      : lastSavedAt
        ? `Salvo às: ${formatSavedAt(lastSavedAt)}`
        : 'Layout salvo automaticamente'

  return (
    <div className="h-full w-full" data-testid="diagram-canvas">
      <ReactFlow<DiagramNode, DiagramEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onInit={handleInit}
        nodesDraggable={canEdit}
        nodesConnectable={false}
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
          <p
            className={`rounded-sm px-2 py-1 text-[11px] ${
              saveFailed ? 'bg-red-50 text-red-700' : 'bg-white/90 text-slate-500'
            }`}
            data-testid="diagram-save-status"
          >
            {saveFailed ? 'Falha ao salvar o layout.' : saveStatus}
          </p>
          {layoutQuery.isError ? (
            <p className="rounded-sm bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              Não foi possível carregar o layout salvo.
            </p>
          ) : null}
        </Panel>
      </ReactFlow>
    </div>
  )
}

export type { DiagramNodeData }
