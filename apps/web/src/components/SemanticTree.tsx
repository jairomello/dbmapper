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
  const [query, setQuery] = useState('')
  const selectedTable = selection.type === 'database' ? null : selection.table
  const selectionActive = selectedTable !== null && tables.some((table) => table.name === selectedTable)
  const incident = incidentNames(database, selectionActive ? selectedTable : null)
  const needle = query.trim().toLowerCase()

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
    `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
      active ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-surface-2'
    }`

  const visibleTables = needle
    ? tables.filter(
        (table) =>
          table.name.toLowerCase().includes(needle) ||
          table.columns.some(
            (column) =>
              column.name.toLowerCase().includes(needle) || column.type.toLowerCase().includes(needle),
          ),
      )
    : tables

  return (
    <section className="flex h-full flex-col overflow-hidden" aria-label="Árvore semântica">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Explorador</h2>
        <button
          type="button"
          className="rounded-md border border-line-strong px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
          onClick={toggleAll}
        >
          {allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
        </button>
      </div>

      <div className="border-b border-line px-3 py-2">
        <label className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-2 py-1.5">
          <span aria-hidden="true" className="text-muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tabela ou campo"
            aria-label="Buscar na árvore"
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
          />
        </label>
      </div>

      <div className="flex items-center justify-between px-3 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        <span>Tabelas</span>
        <span data-testid="tree-table-count">{visibleTables.length}</span>
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
              <span aria-hidden="true" className="text-muted">
                ▦
              </span>
              <span className="truncate font-semibold">{database.name}</span>
              <SemanticBadge item={database} />
            </button>
          </li>

          {visibleTables.map((table) => {
            const tableCollapsed = Boolean(collapsed[table.name])
            const tableActive = isActive(selection, { type: 'table', table: table.name })
            const tableZone = zoneOfTable(table.name)
            const outside = Boolean(zones) && tableZone === null
            const emphasis = selectionActive ? tableEmphasis(table.name, selectedTable, incident) : 'none'
            const tableMatchesQuery = Boolean(needle) && table.name.toLowerCase().includes(needle)
            const columns = needle && !tableMatchesQuery
              ? table.columns.filter(
                  (column) =>
                    column.name.toLowerCase().includes(needle) ||
                    column.type.toLowerCase().includes(needle),
                )
              : table.columns

            return (
              <li
                key={table.name}
                data-testid={`table-item-${table.name}`}
                data-emphasis={emphasis}
                className={emphasis === 'muted' ? 'opacity-40' : undefined}
              >
                <div className={`flex items-center gap-1 rounded-md ${tableActive ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                  <button
                    type="button"
                    className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2"
                    aria-label={`${tableCollapsed ? 'Expandir' : 'Recolher'} tabela ${table.name}`}
                    onClick={() => toggleTable(table.name)}
                  >
                    {tableCollapsed ? '▸' : '▾'}
                  </button>
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-sm ${
                      tableActive ? 'font-medium text-accent' : 'text-ink'
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
                    <span aria-hidden="true" className="text-muted">
                      ▤
                    </span>
                    <span className="truncate" title={table.name}>
                      {table.name}
                    </span>
                    <SemanticBadge item={table} />
                  </button>
                </div>

                {zones ? (
                  <div className="ml-8 flex flex-wrap items-center gap-1 px-1 pb-1">
                    {outside ? (
                      <span
                        className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning"
                        data-testid={`table-outside-${table.name}`}
                      >
                        fora do diagrama
                      </span>
                    ) : null}
                    {canMoveTables && zones.length > 0 ? (
                      <select
                        className="rounded-md border border-line-strong bg-surface px-1 py-0.5 text-[10px] text-muted"
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
                        className="rounded-md border border-warning/40 bg-surface px-1.5 py-0.5 text-[10px] font-medium text-warning hover:bg-warning-soft"
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
                  <ul className="ml-6 border-l border-line pl-1">
                    {columns.map((column) => {
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
                            <span className="truncate" title={`${table.name}.${column.name}`}>
                              {column.name}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted">{column.type}</span>
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
        {visibleTables.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted">Nenhuma tabela encontrada.</p>
        ) : null}
      </div>
    </section>
  )
}
