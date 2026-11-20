import type { DatabaseModel } from '@dbmapper/domain'
import { useState } from 'react'
import { columnNameError, tableNameError } from './commands'

export interface ColumnDraft {
  name: string
  type: string
  primaryKey: boolean
}

export interface ColumnPopoverProps {
  mode: 'create' | 'edit'
  database: DatabaseModel
  table: string
  initial?: ColumnDraft
  onCancel: () => void
  onConfirm: (draft: ColumnDraft) => void
}

export function ColumnPopover({ mode, database, table, initial, onCancel, onConfirm }: ColumnPopoverProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? 'text')
  const [primaryKey, setPrimaryKey] = useState(initial?.primaryKey ?? false)
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    const nameError = columnNameError(database, table, name, mode === 'edit' ? initial?.name : undefined)
    if (nameError) {
      setError(nameError)
      return
    }
    if (!type.trim()) {
      setError('Informe o tipo da coluna.')
      return
    }
    setError(null)
    onConfirm({ name: name.trim(), type: type.trim(), primaryKey })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-slate-950/40" onClick={onCancel} />
      <section
        className="relative w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'Nova coluna' : 'Editar coluna'}
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">
            {mode === 'create' ? 'Nova coluna' : 'Editar coluna'} · {table}
          </h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <label className="block text-xs font-medium text-slate-600">
            Nome da coluna
            <input
              className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Nome da coluna"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Tipo / tamanho
            <input
              className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={type}
              onChange={(event) => setType(event.target.value)}
              aria-label="Tipo / tamanho"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={primaryKey}
              onChange={(event) => setPrimaryKey(event.target.checked)}
              aria-label="Chave primária"
            />
            Chave primária
          </label>
          {error ? (
            <p className="rounded-sm bg-red-50 px-2 py-1.5 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600"
            onClick={handleConfirm}
          >
            Salvar coluna
          </button>
        </footer>
      </section>
    </div>
  )
}

export interface TablePopoverProps {
  database: DatabaseModel
  table: string
  onCancel: () => void
  onConfirm: (name: string) => void
}

export function TablePopover({ database, table, onCancel, onConfirm }: TablePopoverProps) {
  const [name, setName] = useState(table)
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    const nameError = tableNameError(database, name, table)
    if (nameError) {
      setError(nameError)
      return
    }
    setError(null)
    onConfirm(name.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-slate-950/40" onClick={onCancel} />
      <section
        className="relative w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Editar tabela"
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Editar tabela</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <label className="block text-xs font-medium text-slate-600">
            Nome da tabela
            <input
              className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Nome da tabela"
            />
          </label>
          {error ? (
            <p className="rounded-sm bg-red-50 px-2 py-1.5 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600"
            onClick={handleConfirm}
          >
            Salvar tabela
          </button>
        </footer>
      </section>
    </div>
  )
}
