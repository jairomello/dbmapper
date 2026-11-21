import { Handle, type NodeProps, NodeResizer, Position, useNodeId, useUpdateNodeInternals } from '@xyflow/react'
import type { RelationshipModel } from '@dbmapper/domain'
import { useCallback, useRef, useState } from 'react'
import { EMPTY_RELATIONSHIP_KEYS, type DiagramNode, type DiagramRelationshipKey } from './layout'

type SectionKey = 'crossZone' | 'foreign'

export function TableNode({ id, data }: NodeProps<DiagramNode>) {
  const {
    table,
    columns = table.columns,
    hiddenColumns = 0,
    compact = false,
    active,
    activeColumn,
    tableMatch,
    columnMatches,
    searchActive,
    canEdit,
    relationshipMode,
    keys = EMPTY_RELATIONSHIP_KEYS,
    onSelect,
    onPickTable,
    onAddColumn,
    onEditTable,
    onEditColumn,
    onDeleteColumn,
    onDeleteRelationship,
    onResize,
    onExpand,
  } = data
  const highlighted = searchActive && tableMatch

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ crossZone: true, foreign: true })
  const nodeId = useNodeId()
  const updateNodeInternals = useUpdateNodeInternals()
  const frame = useRef<number | null>(null)

  const remeasureHandles = useCallback(() => {
    if (!nodeId || frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      updateNodeInternals(nodeId)
    })
  }, [nodeId, updateNodeInternals])

  function toggleSection(section: SectionKey) {
    setExpanded((current) => ({ ...current, [section]: !current[section] }))
    remeasureHandles()
  }

  function parentFor(key: DiagramRelationshipKey): RelationshipModel | undefined {
    if (key.direction !== 'outgoing') return undefined
    return table.relationships?.parents.find(
      (relationship) =>
        relationship.table === key.table &&
        relationship.constraint_name === key.constraintName &&
        relationship.local_columns.join(',') === key.localColumns.join(','),
    )
  }

  function keyRow(key: DiagramRelationshipKey) {
    const parent = parentFor(key)
    const label =
      key.direction === 'outgoing'
        ? `→ ${key.table} (${key.localColumns.join(', ')})`
        : `← ${key.table} (${key.referencedColumns.join(', ')})`

    return (
      <li
        key={`${key.table}|${key.direction}|${key.constraintName}|${key.localColumns.join(',')}`}
        className="flex items-center gap-1"
      >
        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">{label}</span>
        {canEdit && parent ? (
          <button
            type="button"
            className="nodrag nopan shrink-0 rounded-sm border border-slate-300 px-1 text-[10px] text-red-600 hover:bg-red-50"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteRelationship?.(table.name, parent)
            }}
            aria-label={`Excluir relacionamento ${table.name} → ${parent.table}`}
            title="Excluir relacionamento"
          >
            ×
          </button>
        ) : null}
      </li>
    )
  }

  function pickTable() {
    if (relationshipMode && onPickTable) {
      onPickTable(table.name)
      return
    }
    onSelect({ type: 'table', table: table.name })
  }

  function sectionHeader(section: SectionKey, label: string, tone: 'indigo' | 'rose') {
    const controlId = `diagram-${section}-rows-${table.name}`
    return (
      <button
        type="button"
        className="nodrag nopan flex w-full items-center justify-between gap-2 rounded-sm py-0.5 text-left"
        aria-expanded={expanded[section]}
        aria-controls={controlId}
        onClick={(event) => {
          event.stopPropagation()
          toggleSection(section)
        }}
        data-testid={`diagram-${section}-toggle-${table.name}`}
      >
        <span
          className={`text-[9px] font-semibold uppercase tracking-wide ${
            tone === 'indigo' ? 'text-indigo-500' : 'text-rose-500'
          }`}
        >
          {label}
        </span>
        <span className="text-[9px] text-slate-400" aria-hidden="true">
          {expanded[section] ? '▾' : '▸'}
        </span>
      </button>
    )
  }

  const hasKeys = keys.crossZone.length > 0 || keys.foreign.length > 0

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition ${
        active ? 'border-accent ring-2 ring-accent/30' : 'border-line'
      } ${highlighted ? 'border-amber-500 bg-amber-50' : ''} ${relationshipMode ? 'cursor-crosshair' : ''}`}
      data-testid={`diagram-node-${table.name}`}
      data-active={active}
      data-search-match={highlighted}
    >
      {active && canEdit ? (
        <NodeResizer
          nodeId={id}
          minWidth={180}
          minHeight={100}
          maxWidth={1200}
          maxHeight={4000}
          onResizeEnd={(_event, params) => onResize?.(table.name, params.width, params.height)}
          lineClassName="!border-accent"
          handleClassName="!h-2 !w-2 !rounded-sm !border !border-accent !bg-white"
        />
      ) : null}

      <div
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2 ${
          active ? 'bg-accent-soft' : 'bg-card-header'
        }`}
      >
        <span
          className="diagram-drag-handle flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-xs text-slate-400"
          title={`Mover tabela ${table.name}`}
        >
          ⠿
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink"
          title={table.name}
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
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
          {compact && hiddenColumns > 0 ? `+${hiddenColumns} campos` : `${table.columns.length} campos`}
        </span>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overflow-x-hidden" onScroll={remeasureHandles}>
        {columns.map((column) => {
          const columnActive = activeColumn === column.name
          const columnMatch = searchActive && columnMatches.includes(column.name)

          return (
            <li key={column.name} className="relative flex items-center">
              <Handle
                type="target"
                position={Position.Left}
                id={`col:${column.name}`}
                style={{ left: 4, transform: 'translate(0, -50%)' }}
                className="!h-2 !w-2 !border !border-white !bg-slate-400 transition hover:!bg-accent"
              />
              <button
                type="button"
                className={`nodrag nopan flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-5 pr-3 text-left text-xs ${
                  columnActive
                    ? 'bg-accent-soft font-medium text-accent'
                    : columnMatch
                      ? 'bg-amber-100 text-amber-900'
                      : 'text-ink hover:bg-surface-2'
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
                <span className="shrink-0 text-[10px] text-muted">{column.type}</span>
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
                <span className="nodrag nopan flex shrink-0 items-center gap-1 pr-4">
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
                style={{ right: 4, transform: 'translate(0, -50%)' }}
                className="!h-2 !w-2 !border !border-white !bg-slate-400 transition hover:!bg-accent"
              />
            </li>
          )
        })}
      </ul>

      {compact && hiddenColumns > 0 && onExpand ? (
        <button
          type="button"
          className="nodrag nopan shrink-0 border-t border-line px-3 py-1 text-left text-[10px] font-medium text-accent hover:bg-surface-2"
          onClick={(event) => {
            event.stopPropagation()
            onExpand(table.name)
          }}
          aria-label={`Mostrar todos os campos de ${table.name}`}
          data-testid={`diagram-expand-${table.name}`}
        >
          Mostrar todos os {table.columns.length} campos
        </button>
      ) : null}

      {hasKeys ? (
        <div
          className="shrink-0 space-y-1 border-t border-line px-3 py-1.5"
          data-testid={canEdit ? `diagram-relationships-${table.name}` : `diagram-keys-${table.name}`}
        >
          {keys.crossZone.length > 0 ? (
            <section data-testid={`diagram-cross-zone-${table.name}`}>
              {sectionHeader('crossZone', 'Chaves entre modelos', 'indigo')}
              {expanded.crossZone ? (
                <ul id={`diagram-crossZone-rows-${table.name}`} className="mt-1 space-y-1">
                  {keys.crossZone.map(keyRow)}
                </ul>
              ) : null}
            </section>
          ) : null}
          {keys.foreign.length > 0 ? (
            <section data-testid={`diagram-foreign-keys-${table.name}`}>
              {sectionHeader('foreign', 'Chaves estrangeiras', 'rose')}
              {expanded.foreign ? (
                <ul id={`diagram-foreign-rows-${table.name}`} className="mt-1 space-y-1">
                  {keys.foreign.map(keyRow)}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
