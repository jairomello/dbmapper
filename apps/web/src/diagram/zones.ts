import type { DatabaseModel } from '@dbmapper/domain'
import type {
  DiagramDocument,
  DiagramLayoutInput,
  DiagramPosition,
  DiagramZone,
  DiagramZoneLayout,
} from '../api/types'
import { buildZonePositions, visibleTables } from './layout'

export const DEFAULT_ZONE = 'Principal'
export const DIAGRAM_TABLE_MIME = 'application/x-dbmapper-table'

export interface ZoneLayoutState {
  positions: Record<string, DiagramPosition>
  viewport: DiagramPosition
  zoom: number
  updatedAt: string | null
  updatedBy: string | null
}

export interface ZoneState {
  zones: DiagramZone[]
  layouts: Record<string, ZoneLayoutState>
}

export const EMPTY_ZONE_LAYOUT: ZoneLayoutState = {
  positions: {},
  viewport: { x: 0, y: 0 },
  zoom: 1,
  updatedAt: null,
  updatedBy: null,
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export function normalizeZoneLayout(
  members: readonly string[],
  stored?: DiagramZoneLayout | ZoneLayoutState,
): ZoneLayoutState {
  const saved = stored?.positions ?? {}
  return {
    positions: buildZonePositions(members, saved as Record<string, DiagramPosition>),
    viewport: stored ? { x: stored.viewport.x, y: stored.viewport.y } : { x: 0, y: 0 },
    zoom: typeof stored?.zoom === 'number' ? stored.zoom : 1,
    updatedAt: stored?.updatedAt ?? null,
    updatedBy: stored?.updatedBy ?? null,
  }
}

export function normalizeZoneState(document: DiagramDocument | undefined, database?: DatabaseModel): ZoneState {
  const visible = database ? visibleTables(database).map((table) => table.name) : []
  const visibleSet = new Set(visible)
  const documentZones = document?.zones ?? []

  let zones: DiagramZone[]
  if (documentZones.length > 0) {
    zones = documentZones.map((zone) => ({
      name: zone.name,
      tabOrder: zone.tabOrder,
      members: unique(zone.members.filter((member) => visibleSet.has(member))),
    }))
  } else {
    zones = [{ name: DEFAULT_ZONE, tabOrder: 0, members: visible }]
  }

  if (!zones.some((zone) => zone.name === DEFAULT_ZONE)) {
    zones = [{ name: DEFAULT_ZONE, tabOrder: 0, members: [] }, ...zones]
  }

  const claimed = new Set<string>()
  zones = zones.map((zone) => {
    const members = zone.members.filter((member) => {
      if (claimed.has(member)) return false
      claimed.add(member)
      return true
    })
    return { ...zone, members }
  })

  const layouts: Record<string, ZoneLayoutState> = {}
  for (const zone of zones) {
    const stored = document?.layouts?.find((layout) => layout.zoneName === zone.name)
    layouts[zone.name] = normalizeZoneLayout(zone.members, stored)
  }

  return { zones, layouts }
}

export function syncLayouts(zones: readonly DiagramZone[], layouts: Record<string, ZoneLayoutState>): Record<string, ZoneLayoutState> {
  const next: Record<string, ZoneLayoutState> = {}
  for (const zone of zones) {
    next[zone.name] = normalizeZoneLayout(zone.members, layouts[zone.name])
  }
  return next
}

export function zoneOfTable(zones: readonly DiagramZone[], table: string): string | null {
  for (const zone of zones) {
    if (zone.members.includes(table)) return zone.name
  }
  return null
}

export function assignMember(zones: readonly DiagramZone[], table: string, target: string): DiagramZone[] {
  return zones.map((zone) => {
    if (zone.name === target) {
      return { ...zone, members: [...zone.members.filter((member) => member !== table), table] }
    }
    if (!zone.members.includes(table)) return zone
    return { ...zone, members: zone.members.filter((member) => member !== table) }
  })
}

export function removeMember(zones: readonly DiagramZone[], table: string): DiagramZone[] {
  return zones.map((zone) =>
    zone.members.includes(table)
      ? { ...zone, members: zone.members.filter((member) => member !== table) }
      : zone,
  )
}

export function addMembers(zones: readonly DiagramZone[], target: string, members: readonly string[]): DiagramZone[] {
  if (members.length === 0) return [...zones]
  return zones.map((zone) =>
    zone.name === target ? { ...zone, members: unique([...zone.members, ...members]) } : zone,
  )
}

export function returnMembersToPrincipal(zones: readonly DiagramZone[], removedZone: string): DiagramZone[] {
  const removed = zones.find((zone) => zone.name === removedZone)
  const next = zones.filter((zone) => zone.name !== removedZone)
  if (!removed) return next
  return addMembers(next, DEFAULT_ZONE, removed.members)
}

export function renameTableInLayouts(
  layouts: Record<string, ZoneLayoutState>,
  from: string,
  to: string,
): Record<string, ZoneLayoutState> {
  const next: Record<string, ZoneLayoutState> = {}
  for (const [zoneName, layout] of Object.entries(layouts)) {
    const positions = { ...layout.positions }
    const position = positions[from]
    if (position) {
      delete positions[from]
      positions[to] = position
    }
    next[zoneName] = { ...layout, positions }
  }
  return next
}

export function buildDocumentInput(zones: readonly DiagramZone[], layouts: Record<string, ZoneLayoutState>): DiagramLayoutInput {
  return {
    zones: zones.map((zone) => ({ name: zone.name, tabOrder: zone.tabOrder, members: [...zone.members] })),
    layouts: zones.map((zone) => {
      const layout = layouts[zone.name] ?? EMPTY_ZONE_LAYOUT
      return {
        zoneName: zone.name,
        positions: { ...layout.positions },
        viewport: { x: layout.viewport.x, y: layout.viewport.y },
        zoom: layout.zoom,
      }
    }),
  }
}
