import type { DatabaseModel } from '@dbmapper/domain'
import { type KeyboardEvent, useState } from 'react'
import {
  applyDraft,
  resolveSelection,
  type Selection,
  selectionBreadcrumb,
  selectionKey,
} from '../lib/selection'

interface MetadataEditorProps {
  database: DatabaseModel
  selection: Selection
  onSave: (database: DatabaseModel) => Promise<unknown>
  isSaving?: boolean
}

const INDENT = { database: '', table: 'Tabela', column: 'Coluna' } as const

export function MetadataEditor({ database, selection, onSave, isSaving = false }: MetadataEditorProps) {
  const resolved = resolveSelection(database, selection)

  if (!resolved) {
    return (
      <section className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
        Selecione um item na árvore para editar seus metadados.
      </section>
    )
  }

  return (
    <EditorForm
      key={selectionKey(selection)}
      database={database}
      selection={selection}
      kind={resolved.kind}
      name={resolved.item.name}
      initialDescription={resolved.item.description ?? ''}
      initialTerms={[...resolved.item.business_terms]}
      reviewed={Boolean(resolved.item.reviewed)}
      onSave={onSave}
      isSaving={isSaving}
    />
  )
}

interface EditorFormProps {
  database: DatabaseModel
  selection: Selection
  kind: Selection['type']
  name: string
  initialDescription: string
  initialTerms: string[]
  reviewed: boolean
  onSave: (database: DatabaseModel) => Promise<unknown>
  isSaving: boolean
}

function EditorForm({
  database,
  selection,
  kind,
  name,
  initialDescription,
  initialTerms,
  reviewed,
  onSave,
  isSaving,
}: EditorFormProps) {
  const [description, setDescription] = useState(initialDescription)
  const [terms, setTerms] = useState(initialTerms)
  const [termDraft, setTermDraft] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmedDescription = description.trim()
  const canReview = trimmedDescription.length > 0
  const breadcrumb = selectionBreadcrumb(database, selection).reduce<Array<{ label: string; key: string }>>(
    (entries, part) => {
      const key = entries.length === 0 ? part : `${entries[entries.length - 1].key} / ${part}`
      entries.push({ label: part, key })
      return entries
    },
    [],
  )

  function addTerm() {
    const next = termDraft.trim()
    if (!next || terms.includes(next)) return
    setTerms([...terms, next])
    setTermDraft('')
  }

  function removeTerm(term: string) {
    setTerms(terms.filter((candidate) => candidate !== term))
  }

  function handleTermKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addTerm()
    }
  }

  async function persist(reviewedValue?: boolean) {
    setFeedback(null)
    setError(null)

    const nextDatabase = applyDraft(
      database,
      selection,
      { description, businessTerms: terms },
      { reopenOnEdit: reviewedValue === undefined, reviewed: reviewedValue },
    )

    try {
      await onSave(nextDatabase)
      setFeedback('Alterações salvas.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as alterações.')
    }
  }

  async function handleSave() {
    await persist()
  }

  async function handleReview() {
    if (!canReview) {
      setError('Preencha a descrição antes de aprovar.')
      return
    }
    await persist(!reviewed)
  }

  return (
    <section className="flex h-full flex-col overflow-auto" aria-label="Editor de metadados">
      <header className="border-b border-slate-200 px-5 py-3">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
          {breadcrumb.map((entry, index) => (
            <span key={entry.key} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <span className={index === breadcrumb.length - 1 ? 'font-medium text-slate-700' : undefined}>
                {entry.label}
              </span>
            </span>
          ))}
        </nav>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {INDENT[kind]}
          </span>
          <h2 className="truncate text-lg font-semibold text-ink">{name}</h2>
        </div>
      </header>

      <div className="flex-1 space-y-6 px-5 py-5">
        <label className="block text-sm font-medium text-slate-700">
          Descrição
          <textarea
            className="mt-1 min-h-32 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descreva o significado deste item para o negócio."
          />
        </label>

        <div>
          <h3 className="text-sm font-medium text-slate-700">Termos de negócio</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {terms.length === 0 ? <p className="text-xs text-slate-400">Nenhum termo adicionado.</p> : null}
            {terms.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700"
              >
                {term}
                <button
                  type="button"
                  className="rounded-full text-indigo-500 hover:text-indigo-800"
                  aria-label={`Remover termo ${term}`}
                  onClick={() => removeTerm(term)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
              aria-label="Adicionar termo de negócio"
              placeholder="Adicionar termo"
              value={termDraft}
              onChange={(event) => setTermDraft(event.target.value)}
              onKeyDown={handleTermKeyDown}
            />
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={addTerm}
            >
              Adicionar
            </button>
          </div>
        </div>

        {feedback ? (
          <p className="rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
            {feedback}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {!canReview ? (
          <p className="text-xs text-amber-700" role="status">
            Preencha a descrição antes de aprovar.
          </p>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3">
        <button
          type="button"
          className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          className={`rounded-sm border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            reviewed
              ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
          }`}
          onClick={handleReview}
          disabled={!canReview || isSaving}
          title={canReview ? undefined : 'Preencha a descrição antes de aprovar'}
        >
          {reviewed ? 'Reabrir Revisão' : 'Aprovar Descrição'}
        </button>
      </footer>
    </section>
  )
}
