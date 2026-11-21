import type { DatabaseModel } from '@dbmapper/domain'
import { type DragEvent, useState } from 'react'
import type { DiagramZone } from '../api/types'
import { DIAGRAM_TABLE_MIME } from '../diagram/zones'
import type { Selection } from '../lib/selection'
import { SemanticBadge } from './SemanticBadge'

interface SemanticTreeProps {
  database: DatabaseModel
  selection: Selection
  onSelect: (selection: Selection) => void
  zones?: DiagramZone[]
  activeZone?: string
  canMoveTables?: boolean
  onMoveTable?: (table: string, zone: string) => void
  onAddToActiveZone?: (table: string) => void
}

function isActive(selection: Selection, candidate: Selection): boolean {
  if (selection.type !== candidate.type) return false
  if (selection.type === 'database') return true
  if (selection.type === 'table' && candidate.type === 'table') return selection.table === candidate.table
  if (selection.type === 'column' && candidate.type === 'column') {
    return selection.table === candidate.table && selection.column === candidate.column
  }
  return false
}

function incidentNames(database: DatabaseModel, selectedTable: string | null): Set<string> {
  const incident = new Set<string>()
  if (selectedTable === null) return incident

  const names = new Set(database.tables.filter((table) => table.status !== 'REMOVED').map((table) => table.name))
  if (!names.has(selectedTable)) return incident

  incident.add(selectedTable)
  for (const table of database.tables) {
    if (table.status === 'REMOVED') continue
    for (const relationship of table.relationships?.parents ?? []) {
      if (!names.has(relationship.table)) continue
      if (table.name === selectedTable) incident.add(relationship.table)
      else if (relationship.table === selectedTable) incident.add(table.name)
    }
  }

  return incident
}

function tableEmphasis(
  table: string,
  selectedTable: string | null,
  incident: Set<string>,
): 'selected' | 'incident' | 'muted' | 'none' {
  if (selectedTable === null) return 'none'
  if (table === selectedTable) return 'selected'
  return incident.has(table) ? 'incident' : 'muted'
}

export function SemanticTree({
  database,
  selection,
  onSelect,
  zones,
  activeZone,
  canMoveTables = false,
  onMoveTable,
  onAddToActiveZone,
}: SemanticTreeProps) {
  const tables = database.tables.filter((table) => table.status !== 'REMOVED')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const selectedTable = selection.type === 'database' ? null : selection.table
  const selectionActive = selectedTable !== null && tables.some((table) => table.name === selectedTable)
  const incident = incidentNames(database, selectionActive ? selectedTable : null)

  function zoneOfTable(table: string): string | null {
    if (!zones) return null
    return zones.find((zone) => zone.members.includes(table))?.name ?? null
  }

  const allCollapsed = tables.length > 0 && tables.every((table) => collapsed[table.name])

  function toggleTable(tableName: string) {
    setCollapsed((current) => ({ ...current, [tableName]: !current[tableName] }))
  }

  function toggleAll() {
    if (allCollapsed) {
      setCollapsed({})
      return
    }
    setCollapsed(Object.fromEntries(tables.map((table) => [table.name, true])))
  }

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition ${
      active ? 'bg-indigo-50 font-medium text-accent' : 'text-slate-700 hover:bg-slate-100'
    }`

  return (
    <section className="flex h-full flex-col overflow-hidden" aria-label="Árvore semântica">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-ink">Estrutura</h2>
        <button
          type="button"
          className="rounded-sm border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          onClick={toggleAll}
        >
          {allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
        </button>
      </div>

      <div className="flex-1 overflow-auto px-2 py-2">
        <ul className="space-y-0.5">
          <li>
            <button
              type="button"
              className={rowClass(isActive(selection, { type: 'database' }))}
              onClick={() => onSelect({ type: 'database' })}
              data-testid="database-row"
              data-active={isActive(selection, { type: 'database' })}
            >
              <span className="truncate font-semibold">{database.name}</span>
              <SemanticBadge item={database} />
            </button>
          </li>

          {tables.map((table) => {
            const tableCollapsed = Boolean(collapsed[table.name])
            const tableActive = isActive(selection, { type: 'table', table: table.name })
            const tableZone = zoneOfTable(table.name)
            const outside = Boolean(zones) && tableZone === null
            const emphasis = selectionActive ? tableEmphasis(table.name, selectedTable, incident) : 'none'

            return (
              <li
                key={table.name}
                data-testid={`table-item-${table.name}`}
                data-emphasis={emphasis}
                className={emphasis === 'muted' ? 'opacity-40' : undefined}
              >
                <div
                  className={`flex items-center gap-1 rounded-sm ${
                    tableActive ? 'bg-indigo-50' : 'hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-200"
                    aria-label={`${tableCollapsed ? 'Expandir' : 'Recolher'} tabela ${table.name}`}
                    onClick={() => toggleTable(table.name)}
                  >
                    {tableCollapsed ? '▸' : '▾'}
                  </button>
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-sm ${
                      tableActive ? 'font-medium text-accent' : 'text-slate-700'
                    }`}
                    onClick={() => onSelect({ type: 'table', table: table.name })}
                    data-testid={`table-row-${table.name}`}
                    data-active={tableActive}
                    draggable={canMoveTables}
                    onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                      if (!canMoveTables) return
                      event.dataTransfer.setData(DIAGRAM_TABLE_MIME, table.name)
                      event.dataTransfer.setData('text/plain', table.name)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    <span className="truncate">{table.name}</span>
                    <SemanticBadge item={table} />
                  </button>
                </div>

                {zones ? (
                  <div className="ml-8 flex flex-wrap items-center gap-1 px-1 pb-1">
                    {outside ? (
                      <span
                        className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                        data-testid={`table-outside-${table.name}`}
                      >
                        fora do diagrama
                      </span>
                    ) : null}
                    {canMoveTables && zones.length > 0 ? (
                      <select
                        className="rounded-sm border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-600"
                        aria-label={`Mover tabela ${table.name} para zona`}
                        data-testid={`table-zone-${table.name}`}
                        value={tableZone ?? ''}
                        onChange={(event) => {
                          if (!event.target.value) return
                          onMoveTable?.(table.name, event.target.value)
                        }}
                      >
                        {outside ? <option value="">Fora do diagrama</option> : null}
                        {zones.map((zone) => (
                          <option key={zone.name} value={zone.name}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {outside && canMoveTables && onAddToActiveZone ? (
                      <button
                        type="button"
                        className="rounded-sm border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-50"
                        aria-label={`Adicionar ${table.name} à aba atual`}
                        data-testid={`table-add-to-zone-${table.name}`}
                        onClick={() => {
                          onAddToActiveZone(table.name)
                          onSelect({ type: 'table', table: table.name })
                        }}
                      >
                        Adicionar à aba atual{activeZone ? ` (${activeZone})` : ''}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {tableCollapsed ? null : (
                  <ul className="ml-6 border-l border-slate-200 pl-1">
                    {table.columns.map((column) => {
                      const columnSelection: Selection = {
                        type: 'column',
                        table: table.name,
                        column: column.name,
                      }
                      const columnActive = isActive(selection, columnSelection)

                      return (
                        <li key={column.name}>
                          <button
                            type="button"
                            className={rowClass(columnActive)}
                            onClick={() => onSelect(columnSelection)}
                            data-testid={`column-row-${table.name}-${column.name}`}
                            data-active={columnActive}
                          >
                            <span className="truncate">{column.name}</span>
                            <span className="shrink-0 text-[10px] text-slate-400">{column.type}</span>
                            <SemanticBadge item={column} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
