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

const INDENT = { database: 'Banco', table: 'Tabela', column: 'Campo' } as const

export function MetadataEditor({ database, selection, onSave, isSaving = false }: MetadataEditorProps) {
  const resolved = resolveSelection(database, selection)

  if (!resolved) {
    return (
      <section className="flex h-full items-center justify-center p-8 text-sm text-muted">
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
      itemType={'type' in resolved.item ? resolved.item.type : null}
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
  itemType: string | null
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
  itemType,
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
    <section className="flex h-full flex-col overflow-auto bg-surface" aria-label="Editor de metadados">
      <header className="border-b border-line px-5 py-4">
        <nav
          className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted"
          aria-label="Breadcrumb"
        >
          {breadcrumb.map((entry, index) => (
            <span key={entry.key} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <span className={index === breadcrumb.length - 1 ? 'font-semibold text-ink' : undefined}>
                {entry.label}
              </span>
            </span>
          ))}
        </nav>
        <h2 className="mt-2 truncate font-serif text-2xl leading-tight text-ink">{name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {INDENT[kind]}
          </span>
          {itemType ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink">{itemType}</span>
          ) : null}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              reviewed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
            }`}
            data-testid="metadata-review-state"
          >
            {reviewed ? 'aprovado' : 'revisar'}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-6 px-5 py-5">
        <div>
          <label className="block text-sm font-medium text-ink">
            Descrição
            <textarea
              className="mt-1 min-h-32 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descreva o significado deste item para o negócio."
            />
          </label>
          <span className="mt-1 block text-[10px] text-muted">
            Rascunho local — clique em Salvar para publicar no dicionário.
          </span>
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink">Termos de negócio</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {terms.length === 0 ? <p className="text-xs text-muted">Nenhum termo adicionado.</p> : null}
            {terms.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent"
              >
                {term}
                <button
                  type="button"
                  className="rounded-full text-accent/70 hover:text-accent"
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
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink outline-none transition focus:border-accent"
              aria-label="Adicionar termo de negócio"
              placeholder="Adicionar termo"
              value={termDraft}
              onChange={(event) => setTermDraft(event.target.value)}
              onKeyDown={handleTermKeyDown}
            />
            <button
              type="button"
              className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
              onClick={addTerm}
            >
              Adicionar
            </button>
          </div>
        </div>

        {feedback ? (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success" role="status">
            {feedback}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {!canReview ? (
          <p className="text-xs text-warning" role="status">
            Preencha a descrição antes de aprovar.
          </p>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
        <button
          type="button"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            reviewed
              ? 'border-warning/50 text-warning hover:bg-warning-soft'
              : 'border-success/50 text-success hover:bg-success-soft'
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
