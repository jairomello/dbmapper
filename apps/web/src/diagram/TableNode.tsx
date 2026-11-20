import { Handle, type NodeProps, Position } from '@xyflow/react'
import type { DiagramNode } from './layout'

export function TableNode({ data }: NodeProps<DiagramNode>) {
  const {
    table,
    active,
    activeColumn,
    tableMatch,
    columnMatches,
    searchActive,
    canEdit,
    relationshipMode,
    onSelect,
    onPickTable,
    onAddColumn,
    onEditTable,
    onEditColumn,
    onDeleteColumn,
    onDeleteRelationship,
  } = data
  const highlighted = searchActive && tableMatch

  function pickTable() {
    if (relationshipMode && onPickTable) {
      onPickTable(table.name)
      return
    }
    onSelect({ type: 'table', table: table.name })
  }

  return (
    <div
      className={`w-full overflow-hidden rounded-md border bg-white text-left shadow-sm transition ${
        active ? 'border-accent ring-2 ring-accent/40' : 'border-slate-300'
      } ${highlighted ? 'border-amber-400 bg-amber-50' : ''} ${relationshipMode ? 'cursor-crosshair' : ''}`}
      data-testid={`diagram-node-${table.name}`}
      data-active={active}
      data-search-match={highlighted}
    >
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${active ? 'bg-indigo-50' : 'bg-slate-50'}`}>
        <span
          className="diagram-drag-handle flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-xs text-slate-400"
          title={`Mover tabela ${table.name}`}
        >
          ⠿
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink"
          onClick={(event) => {
            event.stopPropagation()
            pickTable()
          }}
          aria-label={
            relationshipMode ? `Escolher tabela ${table.name} para relacionamento` : `Selecionar tabela ${table.name}`
          }
        >
          {table.name}
        </button>
        {canEdit ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="nodrag nopan rounded-sm border border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100"
              onClick={(event) => {
                event.stopPropagation()
                onEditTable?.(table.name)
              }}
              aria-label={`Editar tabela ${table.name}`}
              title="Propriedades da tabela"
            >
              ✎
            </button>
            <button
              type="button"
              className="nodrag nopan rounded-sm border border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100"
              onClick={(event) => {
                event.stopPropagation()
                onAddColumn?.(table.name)
              }}
              aria-label={`Adicionar coluna em ${table.name}`}
              title="Adicionar coluna"
            >
              +
            </button>
          </span>
        ) : null}
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
          {table.columns.length} campos
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {table.columns.map((column) => {
          const columnActive = activeColumn === column.name
          const columnMatch = searchActive && columnMatches.includes(column.name)

          return (
            <li key={column.name} className="relative flex items-center">
              <Handle
                type="target"
                position={Position.Left}
                id={`col:${column.name}`}
                className="!h-2 !w-2 !border-0 !bg-slate-400"
              />
              <button
                type="button"
                className={`nodrag nopan flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  columnActive
                    ? 'bg-indigo-50 font-medium text-accent'
                    : columnMatch
                      ? 'bg-amber-100 text-amber-900'
                      : 'text-slate-600 hover:bg-slate-50'
                }`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ type: 'column', table: table.name, column: column.name })
                }}
                data-testid={`diagram-column-${table.name}-${column.name}`}
                data-active={columnActive}
                data-search-match={columnMatch}
                aria-label={`Selecionar coluna ${table.name}.${column.name}`}
              >
                <span className="min-w-0 flex-1 truncate">{column.name}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{column.type}</span>
                {column.primary_key ? (
                  <span
                    className="shrink-0 rounded-sm bg-indigo-100 px-1 py-0.5 text-[9px] font-semibold text-indigo-700"
                    data-testid={`diagram-pk-${table.name}-${column.name}`}
                  >
                    PK
                  </span>
                ) : null}
                {column.foreign_key ? (
                  <span
                    className="shrink-0 rounded-sm bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700"
                    data-testid={`diagram-fk-${table.name}-${column.name}`}
                  >
                    FK
                  </span>
                ) : null}
              </button>
              {canEdit ? (
                <span className="nodrag nopan flex shrink-0 items-center gap-1 pr-2">
                  <button
                    type="button"
                    className="rounded-sm border border-slate-300 px-1 text-[10px] text-slate-600 hover:bg-slate-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      onEditColumn?.(table.name, column.name)
                    }}
                    aria-label={`Editar coluna ${table.name}.${column.name}`}
                    title="Propriedades da coluna"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-slate-300 px-1 text-[10px] text-red-600 hover:bg-red-50"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteColumn?.(table.name, column.name)
                    }}
                    aria-label={`Excluir coluna ${table.name}.${column.name}`}
                    title="Excluir coluna"
                  >
                    ×
                  </button>
                </span>
              ) : null}
              <Handle
                type="source"
                position={Position.Right}
                id={`col:${column.name}`}
                className="!h-2 !w-2 !border-0 !bg-slate-400"
              />
            </li>
          )
        })}
      </ul>

      {canEdit && (table.relationships?.parents.length ?? 0) > 0 ? (
        <div className="border-t border-slate-100 px-3 py-1.5" data-testid={`diagram-relationships-${table.name}`}>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Relacionamentos</p>
          <ul className="mt-1 space-y-1">
            {table.relationships.parents.map((relationship) => (
              <li
                key={`${relationship.table}|${relationship.local_columns.join(',')}`}
                className="flex items-center gap-1"
              >
                <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
                  → {relationship.table} ({relationship.local_columns.join(', ')})
                </span>
                <button
                  type="button"
                  className="nodrag nopan rounded-sm border border-slate-300 px-1 text-[10px] text-red-600 hover:bg-red-50"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteRelationship?.(table.name, relationship)
                  }}
                  aria-label={`Excluir relacionamento ${table.name} → ${relationship.table}`}
                  title="Excluir relacionamento"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
