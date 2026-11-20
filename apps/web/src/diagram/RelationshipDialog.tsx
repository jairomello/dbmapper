import type { DatabaseModel } from '@dbmapper/domain'
import { useState } from 'react'
import { relationshipConflict, suggestForeignKeyName, targetPrimaryColumn } from './commands'

export interface RelationshipDraft {
  fkColumnName: string
  createFkColumn: boolean
}

export interface RelationshipDialogProps {
  database: DatabaseModel
  source: string
  target: string
  onCancel: () => void
  onConfirm: (draft: RelationshipDraft) => void
}

export function RelationshipDialog({ database, source, target, onCancel, onConfirm }: RelationshipDialogProps) {
  const sourceTable = database.tables.find((table) => table.name === source)
  const targetTable = database.tables.find((table) => table.name === target)
  const referencedColumn = targetPrimaryColumn(targetTable) ?? targetTable?.columns[0]?.name ?? ''
  const [fkColumnName, setFkColumnName] = useState(suggestForeignKeyName(target))
  const [createFkColumn, setCreateFkColumn] = useState(true)

  const existing = sourceTable?.columns.find((column) => column.name === fkColumnName.trim())
  const conflict = relationshipConflict(database, source, target, fkColumnName)
  const missingWithoutCreate = !existing && !createFkColumn && fkColumnName.trim().length > 0
  const error =
    conflict ?? (missingWithoutCreate ? 'Marque a criação da coluna estrangeira ou informe uma existente.' : null)
  const canConfirm = !error

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-slate-950/40" onClick={onCancel} />
      <section
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Novo relacionamento"
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Novo relacionamento 1:n</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {source} → {target}
            {referencedColumn ? ` · referencia ${target}.${referencedColumn}` : ''}
          </p>
        </header>

        <div className="space-y-3 px-4 py-4">
          <label className="block text-xs font-medium text-slate-600">
            Nome da coluna estrangeira
            <input
              className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={fkColumnName}
              onChange={(event) => setFkColumnName(event.target.value)}
              aria-label="Nome da coluna estrangeira"
            />
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={existing ? false : createFkColumn}
              disabled={Boolean(existing)}
              onChange={(event) => setCreateFkColumn(event.target.checked)}
              aria-label="Criar coluna estrangeira"
            />
            Criar coluna estrangeira em {source}
          </label>

          {existing && !conflict ? (
            <p className="rounded-sm bg-amber-50 px-2 py-1.5 text-xs text-amber-700" role="status">
              A coluna {existing.name} já existe em {source} e será reutilizada.
            </p>
          ) : null}

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
            className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({ fkColumnName: fkColumnName.trim(), createFkColumn: existing ? false : createFkColumn })
            }
          >
            Criar relacionamento
          </button>
        </footer>
      </section>
    </div>
  )
}
