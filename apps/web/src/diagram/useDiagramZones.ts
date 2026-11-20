import type { DatabaseModel } from '@dbmapper/domain'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { diagramApi } from '../api/diagram'
import type {
  DiagramDocument,
  DiagramLayoutInput,
  DiagramPosition,
  DiagramZone,
} from '../api/types'
import { visibleTables } from './layout'
import {
  addMembers,
  assignMember,
  buildDocumentInput,
  DEFAULT_ZONE,
  EMPTY_ZONE_LAYOUT,
  normalizeZoneState,
  removeMember,
  renameTableInLayouts,
  returnMembersToPrincipal,
  syncLayouts,
  type ZoneLayoutState,
  type ZoneState,
  zoneOfTable,
} from './zones'

const SAVE_DEBOUNCE_MS = 500

export const diagramQueryKey = (projectId: string) => ['diagram', projectId] as const

export interface DiagramZonesSaveState {
  pending: boolean
  error: boolean
  savedAt: Date | null
}

export interface DiagramZones {
  zones: DiagramZone[]
  layouts: Record<string, ZoneLayoutState>
  activeZone: string
  activeLayout: ZoneLayoutState
  activeMembers: string[]
  isLoading: boolean
  isError: boolean
  saveState: DiagramZonesSaveState
  zoneOf: (table: string) => string | null
  setActiveZone: (name: string) => void
  createZone: (name: string) => boolean
  renameZone: (from: string, to: string) => boolean
  deleteZone: (name: string) => boolean
  reorderZones: (order: readonly string[]) => boolean
  moveTable: (table: string, target: string, position?: DiagramPosition) => boolean
  removeTable: (table: string) => boolean
  addTableToActiveZone: (table: string, position?: DiagramPosition) => boolean
  addTableToPrincipal: (table: string, position?: DiagramPosition) => boolean
  renameTable: (from: string, to: string) => void
  forgetTable: (table: string) => void
  syncDatabase: (database: DatabaseModel) => void
  updatePositions: (positions: Record<string, DiagramPosition>) => void
  updateViewport: (viewport: DiagramPosition, zoom: number) => void
  scheduleSave: () => void
  setModelSaving: (saving: boolean) => void
}

export interface UseDiagramZonesOptions {
  projectId: string
  database: DatabaseModel | undefined
  canEdit: boolean
  locked?: boolean
  enabled?: boolean
}

export function useDiagramZones({
  projectId,
  database,
  canEdit,
  locked = false,
  enabled = true,
}: UseDiagramZonesOptions): DiagramZones {
  const [state, setState] = useState<ZoneState>(() => normalizeZoneState(undefined, database))
  const [activeZone, setActiveZoneState] = useState(DEFAULT_ZONE)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [failed, setFailed] = useState(false)

  const stateRef = useRef(state)
  const activeZoneRef = useRef(activeZone)
  const databaseRef = useRef(database)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const initializedRef = useRef(false)
  const knownInitializedRef = useRef(false)
  const knownTablesRef = useRef<Set<string>>(new Set())
  const pendingNewRef = useRef<Set<string>>(new Set())
  const lastDocumentRef = useRef<DiagramDocument | null | undefined>(undefined)
  const scheduleRef = useRef<() => void>(() => undefined)
  const enabledRef = useRef(enabled)
  const loadedRef = useRef(false)
  const wasEnabledRef = useRef(false)
  const modelSavingRef = useRef(false)

  databaseRef.current = database
  enabledRef.current = enabled

  const commit = useCallback((next: ZoneState, nextActive?: string) => {
    const desired = nextActive ?? activeZoneRef.current
    const active = next.zones.some((zone) => zone.name === desired) ? desired : DEFAULT_ZONE
    activeZoneRef.current = active
    setActiveZoneState(active)
    stateRef.current = next
    setState(next)
  }, [])

  const previousProjectRef = useRef(projectId)
  useEffect(() => {
    if (previousProjectRef.current === projectId) return
    previousProjectRef.current = projectId
    initializedRef.current = false
    knownInitializedRef.current = false
    knownTablesRef.current = new Set()
    pendingNewRef.current = new Set()
    lastDocumentRef.current = undefined
    loadedRef.current = false
    dirtyRef.current = false
    wasEnabledRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    activeZoneRef.current = DEFAULT_ZONE
    setActiveZoneState(DEFAULT_ZONE)
    commit(normalizeZoneState(undefined, databaseRef.current))
  }, [projectId, commit])

  const layoutQuery = useQuery({
    queryKey: diagramQueryKey(projectId),
    queryFn: () => diagramApi.get(projectId),
    retry: false,
    enabled,
  })

  const mutation = useMutation({
    mutationFn: (input: DiagramLayoutInput) => diagramApi.save(projectId, input),
    onSuccess: (_saved, variables) => {
      setSavedAt(new Date())
      setFailed(false)
      const current = stateRef.current
      const touched = new Set(variables.layouts.map((layout) => layout.zoneName))
      const now = new Date().toISOString()
      const layouts: Record<string, ZoneLayoutState> = { ...current.layouts }
      for (const name of touched) {
        const layout = layouts[name]
        if (layout) layouts[name] = { ...layout, updatedAt: now }
      }
      commit({ zones: current.zones, layouts })
    },
    onError: () => setFailed(true),
  })
  const mutateRef = useRef(mutation.mutate)
  mutateRef.current = mutation.mutate

  const flush = useCallback(() => {
    if (!canEdit || locked) return
    if (!dirtyRef.current) return
    if (modelSavingRef.current) return
    dirtyRef.current = false
    mutateRef.current(buildDocumentInput(stateRef.current.zones, stateRef.current.layouts))
  }, [canEdit, locked])

  const schedule = useCallback(() => {
    if (!canEdit) return
    dirtyRef.current = true
    if (locked) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      flush()
    }, SAVE_DEBOUNCE_MS)
  }, [canEdit, locked, flush])
  scheduleRef.current = schedule

  const setModelSaving = useCallback((saving: boolean) => {
    modelSavingRef.current = saving
    if (!saving && dirtyRef.current && !timerRef.current) scheduleRef.current()
  }, [])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const hydrate = useCallback(
    (document: DiagramDocument | undefined) => {
      if (!databaseRef.current) return
      const normalized = normalizeZoneState(document, databaseRef.current)
      const visible = new Set(visibleTables(databaseRef.current).map((table) => table.name))
      const pending = [...pendingNewRef.current].filter((name) => visible.has(name))
      pendingNewRef.current.clear()

      const assigned = new Set(normalized.zones.flatMap((zone) => zone.members))
      const extras = pending.filter((name) => !assigned.has(name))
      let zones = normalized.zones
      let layouts = normalized.layouts
      if (extras.length > 0) {
        zones = addMembers(zones, DEFAULT_ZONE, extras)
        layouts = syncLayouts(zones, layouts)
      }

      lastDocumentRef.current = document
      initializedRef.current = true
      if (document) loadedRef.current = true
      commit({ zones, layouts })
      if (extras.length > 0) scheduleRef.current()
    },
    [commit],
  )

  useEffect(() => {
    if (!database) return
    const document = layoutQuery.data
    const justEnabled = enabled && !wasEnabledRef.current
    wasEnabledRef.current = enabled

    if (!document) {
      if (!initializedRef.current) hydrate(undefined)
      return
    }

    if (initializedRef.current && !justEnabled) {
      if (document === lastDocumentRef.current) return
      if (timerRef.current || dirtyRef.current || mutation.isPending) return
    }
    hydrate(document)
  }, [database, enabled, layoutQuery.data, mutation.isPending, hydrate])

  const syncDatabase = useCallback(
    (next: DatabaseModel) => {
      const visible = new Set(visibleTables(next).map((table) => table.name))
      if (!knownInitializedRef.current) {
        knownTablesRef.current = visible
        knownInitializedRef.current = true
        return
      }

      const previous = knownTablesRef.current
      const added = [...visible].filter((name) => !previous.has(name))
      const removed = [...previous].filter((name) => !visible.has(name))
      knownTablesRef.current = visible
      if (added.length === 0 && removed.length === 0) return

      if (!initializedRef.current || !enabledRef.current || !loadedRef.current) {
        for (const name of added) pendingNewRef.current.add(name)
        return
      }

      const current = stateRef.current
      let zones = current.zones
      for (const name of removed) zones = removeMember(zones, name)
      const assigned = new Set(zones.flatMap((zone) => zone.members))
      const toPrincipal = added.filter((name) => !assigned.has(name))
      if (toPrincipal.length > 0) zones = addMembers(zones, DEFAULT_ZONE, toPrincipal)

      commit({ zones, layouts: syncLayouts(zones, current.layouts) })
      scheduleRef.current()
    },
    [commit],
  )
  const syncDatabaseRef = useRef(syncDatabase)
  syncDatabaseRef.current = syncDatabase

  useEffect(() => {
    if (!database) return
    syncDatabaseRef.current(database)
  }, [database])

  useEffect(() => {
    if (!locked && dirtyRef.current && !timerRef.current) scheduleRef.current()
  }, [locked])

  const setActiveZone = useCallback((name: string) => {
    if (!stateRef.current.zones.some((zone) => zone.name === name)) return
    activeZoneRef.current = name
    setActiveZoneState(name)
  }, [])

  const createZone = useCallback(
    (rawName: string) => {
      if (!canEdit || locked) return false
      const name = rawName.trim()
      if (!name) return false
      const current = stateRef.current
      if (current.zones.some((zone) => zone.name === name)) return false
      const tabOrder = current.zones.reduce((max, zone) => Math.max(max, zone.tabOrder), -1) + 1
      const zones = [...current.zones, { name, tabOrder, members: [] }]
      commit({ zones, layouts: syncLayouts(zones, current.layouts) }, name)
      schedule()
      return true
    },
    [canEdit, locked, commit, schedule],
  )

  const renameZone = useCallback(
    (from: string, rawTo: string) => {
      if (!canEdit || locked) return false
      const to = rawTo.trim()
      if (!to || to === from || from === DEFAULT_ZONE) return false
      const current = stateRef.current
      if (!current.zones.some((zone) => zone.name === from)) return false
      if (current.zones.some((zone) => zone.name === to)) return false

      const zones = current.zones.map((zone) => (zone.name === from ? { ...zone, name: to } : zone))
      const layouts = { ...current.layouts }
      const layout = layouts[from] ?? EMPTY_ZONE_LAYOUT
      delete layouts[from]
      layouts[to] = layout
      commit({ zones, layouts }, activeZoneRef.current === from ? to : activeZoneRef.current)
      schedule()
      return true
    },
    [canEdit, locked, commit, schedule],
  )

  const deleteZone = useCallback(
    (name: string) => {
      if (!canEdit || locked) return false
      if (name === DEFAULT_ZONE) return false
      const current = stateRef.current
      if (!current.zones.some((zone) => zone.name === name)) return false
      const zones = returnMembersToPrincipal(current.zones, name)
      commit({ zones, layouts: syncLayouts(zones, current.layouts) })
      schedule()
      return true
    },
    [canEdit, locked, commit, schedule],
  )

  const reorderZones = useCallback(
    (order: readonly string[]) => {
      if (!canEdit || locked) return false
      const current = stateRef.current
      if (order.length !== current.zones.length) return false
      const positions = new Map(order.map((name, index) => [name, index]))
      if (positions.size !== current.zones.length) return false
      if (!current.zones.every((zone) => positions.has(zone.name))) return false
      const zones = current.zones.map((zone) => ({ ...zone, tabOrder: positions.get(zone.name) ?? zone.tabOrder }))
      commit({ zones, layouts: current.layouts })
      schedule()
      return true
    },
    [canEdit, locked, commit, schedule],
  )

  const moveTable = useCallback(
    (table: string, target: string, position?: DiagramPosition) => {
      if (!canEdit || locked) return false
      const current = stateRef.current
      if (!current.zones.some((zone) => zone.name === target)) return false
      const source = zoneOfTable(current.zones, table)
      if (source === target && !position) return false

      const zones = assignMember(current.zones, table, target)
      let layouts = current.layouts
      if (position) {
        const nextLayouts: Record<string, ZoneLayoutState> = {}
        for (const [zoneName, layout] of Object.entries(current.layouts)) {
          const positions = { ...layout.positions }
          delete positions[table]
          nextLayouts[zoneName] = { ...layout, positions }
        }
        const targetLayout = nextLayouts[target] ?? EMPTY_ZONE_LAYOUT
        nextLayouts[target] = {
          ...targetLayout,
          positions: { ...targetLayout.positions, [table]: { x: position.x, y: position.y } },
        }
        layouts = nextLayouts
      }

      commit({ zones, layouts: syncLayouts(zones, layouts) })
      schedule()
      return true
    },
    [canEdit, locked, commit, schedule],
  )

  const removeTable = useCallback(
    (table: string) => {
      if (!canEdit || locked) return false
      const current = stateRef.current
      if (!zoneOfTable(current.zones, table)) return false
      const zones = removeMember(current.zones, table)
      commit({ zones, layouts: syncLayouts(zones, current.layouts) })
      schedule()
      return true
    },
    [canEdit, locked, commit, schedule],
  )

  const addTableToActiveZone = useCallback(
    (table: string, position?: DiagramPosition) => moveTable(table, activeZoneRef.current, position),
    [moveTable],
  )

  const addTableToPrincipal = useCallback(
    (table: string, position?: DiagramPosition) => moveTable(table, DEFAULT_ZONE, position),
    [moveTable],
  )

  const renameTable = useCallback(
    (from: string, to: string) => {
      if (!canEdit || locked || from === to) return
      const current = stateRef.current
      const zones = current.zones.map((zone) =>
        zone.members.includes(from)
          ? { ...zone, members: zone.members.map((member) => (member === from ? to : member)) }
          : zone,
      )
      const layouts = renameTableInLayouts(current.layouts, from, to)
      commit({ zones, layouts: syncLayouts(zones, layouts) })
      schedule()
    },
    [canEdit, locked, commit, schedule],
  )

  const forgetTable = useCallback(
    (table: string) => {
      if (!canEdit || locked) return
      const current = stateRef.current
      const zones = removeMember(current.zones, table)
      commit({ zones, layouts: syncLayouts(zones, current.layouts) })
      schedule()
    },
    [canEdit, locked, commit, schedule],
  )

  const updatePositions = useCallback(
    (positions: Record<string, DiagramPosition>) => {
      if (!canEdit || locked) return
      const current = stateRef.current
      const name = activeZoneRef.current
      const layout = current.layouts[name] ?? EMPTY_ZONE_LAYOUT
      commit({ zones: current.zones, layouts: { ...current.layouts, [name]: { ...layout, positions } } })
      schedule()
    },
    [canEdit, locked, commit, schedule],
  )

  const updateViewport = useCallback(
    (viewport: DiagramPosition, zoom: number) => {
      if (!canEdit || locked) return
      const current = stateRef.current
      const name = activeZoneRef.current
      const layout = current.layouts[name] ?? EMPTY_ZONE_LAYOUT
      commit({
        zones: current.zones,
        layouts: { ...current.layouts, [name]: { ...layout, viewport: { x: viewport.x, y: viewport.y }, zoom } },
      })
      schedule()
    },
    [canEdit, locked, commit, schedule],
  )

  const activeMembers = useMemo(
    () => state.zones.find((zone) => zone.name === activeZone)?.members ?? [],
    [state.zones, activeZone],
  )
  const activeLayout = state.layouts[activeZone] ?? EMPTY_ZONE_LAYOUT
  const zoneOf = useCallback((table: string) => zoneOfTable(stateRef.current.zones, table), [])

  return {
    zones: state.zones,
    layouts: state.layouts,
    activeZone,
    activeLayout,
    activeMembers,
    isLoading:
      layoutQuery.isPending ||
      (enabled && layoutQuery.data !== undefined && layoutQuery.data !== lastDocumentRef.current),
    isError: layoutQuery.isError,
    saveState: { pending: mutation.isPending, error: failed, savedAt },
    zoneOf,
    setActiveZone,
    createZone,
    renameZone,
    deleteZone,
    reorderZones,
    moveTable,
    removeTable,
    addTableToActiveZone,
    addTableToPrincipal,
    renameTable,
    forgetTable,
    syncDatabase,
    updatePositions,
    updateViewport,
    scheduleSave: schedule,
    setModelSaving,
  }
}
