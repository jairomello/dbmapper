import { type DragEvent, useState } from 'react'
import type { DiagramZone } from '../api/types'
import { ConfirmDialog } from './ConfirmDialog'
import { DEFAULT_ZONE } from './zones'

const ZONE_MIME = 'application/x-dbmapper-zone'

export interface ZoneTabsProps {
  zones: DiagramZone[]
  activeZone: string
  canEdit: boolean
  onActivate: (name: string) => void
  onCreate: (name: string) => boolean
  onRename: (from: string, to: string) => boolean
  onDelete: (name: string) => boolean
  onReorder: (order: string[]) => boolean
}

export function ZoneTabs({
  zones,
  activeZone,
  canEdit,
  onActivate,
  onCreate,
  onRename,
  onDelete,
  onReorder,
}: ZoneTabsProps) {
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function resetForms() {
    setCreating(false)
    setRenaming(false)
    setCreateDraft('')
    setRenameDraft('')
    setError(null)
  }

  function submitCreate() {
    const name = createDraft.trim()
    if (!name) {
      setError('Informe o nome da zona.')
      return
    }
    if (!onCreate(name)) {
      setError('Já existe uma zona com este nome.')
      return
    }
    resetForms()
  }

  function submitRename() {
    const name = renameDraft.trim()
    if (!name) {
      setError('Informe o nome da zona.')
      return
    }
    if (!onRename(activeZone, name)) {
      setError('Já existe uma zona com este nome.')
      return
    }
    resetForms()
  }

  function dropOn(target: string, event: DragEvent) {
    event.preventDefault()
    const from = event.dataTransfer.getData(ZONE_MIME) || dragging
    setDragging(null)
    if (!from || from === target) return
    const order = zones.map((zone) => zone.name).filter((name) => name !== from)
    const index = order.indexOf(target)
    order.splice(index < 0 ? order.length : index, 0, from)
    onReorder(order)
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5" data-testid="diagram-zone-tabs">
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Zonas do diagrama">
        {zones.map((zone) => {
          const active = zone.name === activeZone
          return (
            <button
              key={zone.name}
              type="button"
              role="tab"
              aria-selected={active}
              draggable={canEdit}
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition ${
                active ? 'bg-accent text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => onActivate(zone.name)}
              data-testid={`diagram-zone-tab-${zone.name}`}
              onDragStart={(event) => {
                if (!canEdit) return
                setDragging(zone.name)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData(ZONE_MIME, zone.name)
                event.dataTransfer.setData('text/plain', zone.name)
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                if (!dragging) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => dropOn(zone.name, event)}
            >
              {zone.name}
            </button>
          )
        })}
      </div>

      {canEdit ? (
        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            onClick={() => {
              setRenaming(false)
              setCreating(true)
              setError(null)
            }}
            aria-label="Criar zona"
            data-testid="diagram-zone-add"
          >
            +
          </button>
          {activeZone !== DEFAULT_ZONE ? (
            <>
              <button
                type="button"
                className="rounded-sm border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  setCreating(false)
                  setRenaming(true)
                  setRenameDraft(activeZone)
                  setError(null)
                }}
                data-testid="diagram-zone-rename"
              >
                Renomear
              </button>
              <button
                type="button"
                className="rounded-sm border border-slate-300 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                onClick={() => setPendingDelete(activeZone)}
                data-testid="diagram-zone-delete"
              >
                Excluir
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            submitCreate()
          }}
        >
          <input
            className="w-32 rounded-sm border border-slate-300 px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            aria-label="Nome da zona"
            placeholder="Nome da zona"
            value={createDraft}
            onChange={(event) => setCreateDraft(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-sm bg-accent px-2 py-1 text-xs font-semibold text-white"
            data-testid="diagram-zone-create"
          >
            Criar zona
          </button>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-600"
            onClick={resetForms}
          >
            Cancelar
          </button>
        </form>
      ) : null}

      {renaming ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            submitRename()
          }}
        >
          <input
            className="w-32 rounded-sm border border-slate-300 px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            aria-label="Novo nome da zona"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-sm bg-accent px-2 py-1 text-xs font-semibold text-white"
            data-testid="diagram-zone-rename-save"
          >
            Salvar nome
          </button>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-600"
            onClick={resetForms}
          >
            Cancelar
          </button>
        </form>
      ) : null}

      {error ? (
        <span className="text-[11px] text-red-700" role="alert">
          {error}
        </span>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Excluir zona"
          message={`Excluir a zona ${pendingDelete}? As tabelas voltam para ${DEFAULT_ZONE}.`}
          onConfirm={() => {
            if (onDelete(pendingDelete)) setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  )
}
