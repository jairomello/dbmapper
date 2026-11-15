import type { DatabaseModel } from '@dbmapper/domain'
import { useState } from 'react'
import type { Selection } from '../lib/selection'
import { SemanticBadge } from './SemanticBadge'

interface SemanticTreeProps {
  database: DatabaseModel
  selection: Selection
  onSelect: (selection: Selection) => void
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

export function SemanticTree({ database, selection, onSelect }: SemanticTreeProps) {
  const tables = database.tables.filter((table) => table.status !== 'REMOVED')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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

            return (
              <li key={table.name} data-testid={`table-item-${table.name}`}>
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
                  >
                    <span className="truncate">{table.name}</span>
                    <SemanticBadge item={table} />
                  </button>
                </div>

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
