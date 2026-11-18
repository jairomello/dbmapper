import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { AgentSuggestion, GenerateSuggestionsInput } from '../agent/api'
import {
  invalidateAgentResults,
  useAgentJob,
  useApplySuggestions,
  useEditSuggestion,
  useGenerateSuggestions,
  usePendingSuggestions,
  useRejectSuggestions,
} from '../agent/queries'
import type { UserRole } from '../api/types'
import type { Selection } from '../lib/selection'

interface SuggestionPanelProps {
  projectId: string
  selection: Selection
  tableIds: Record<string, string>
  role: UserRole | undefined
  activeJobId: string | null
  onJobStarted: (jobId: string) => void
  onClose: () => void
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function suggestionTableName(suggestion: AgentSuggestion): string {
  return stringValue(suggestion.context?.table?.name) ?? ''
}

function suggestionItemName(suggestion: AgentSuggestion): string {
  return stringValue(suggestion.context?.item?.name) ?? suggestion.itemId
}

function suggestionPath(suggestion: AgentSuggestion): string {
  const table = suggestionTableName(suggestion)
  const item = suggestionItemName(suggestion)
  if (suggestion.itemType === 'table') return table || item || 'Tabela'
  return [table, item].filter(Boolean).join(' / ')
}

function suggestionTestId(suggestion: AgentSuggestion): string {
  const table = suggestionTableName(suggestion)
  const item = suggestionItemName(suggestion)
  if (suggestion.itemType === 'table') return `suggestion-row-table-${table || item}`
  return `suggestion-row-${table || 'tabela'}-${item}`
}

function targetOf(suggestion: AgentSuggestion) {
  const item = suggestionItemName(suggestion)
  return (suggestion.context?.targets ?? []).find(
    (target) => target.name === item && target.type === suggestion.itemType,
  )
}

function businessTermsOf(suggestion: AgentSuggestion): string[] {
  const terms = suggestion.context?.table?.businessTerms
  if (!Array.isArray(terms)) return []
  return terms.filter((term): term is string => typeof term === 'string' && term.trim().length > 0)
}

function describedColumnsOf(suggestion: AgentSuggestion): string[] {
  return (suggestion.context?.describedColumns ?? [])
    .map((column) => column.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
}

function foreignKeysOf(suggestion: AgentSuggestion): string[] {
  return (suggestion.context?.foreignKeys ?? [])
    .filter((fk) => typeof fk.column === 'string' && typeof fk.targetTable === 'string')
    .map((fk) => `${fk.column} → ${fk.targetTable}`)
}

function scopeTableName(selection: Selection): string | null {
  if (selection.type === 'table') return selection.table
  if (selection.type === 'column') return selection.table
  return null
}

function bannerProgress(value: unknown, total: unknown): string {
  if (typeof value === 'number' && typeof total === 'number') return `${value}/${total} tabelas`
  return 'processando'
}

export function SuggestionPanel({
  projectId,
  selection,
  tableIds,
  role,
  activeJobId,
  onJobStarted,
  onClose,
}: SuggestionPanelProps) {
  const queryClient = useQueryClient()
  const pending = usePendingSuggestions(projectId)
  const jobQuery = useAgentJob(projectId, activeJobId)
  const generate = useGenerateSuggestions(projectId)
  const edit = useEditSuggestion(projectId)
  const apply = useApplySuggestions(projectId)
  const reject = useRejectSuggestions(projectId)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isScopeOpen, setIsScopeOpen] = useState(false)
  const [scope, setScope] = useState<'project' | 'table'>('project')

  const settledJob = useRef<string | null>(null)
  const job = jobQuery.data?.job
  const suggestions = pending.data?.suggestions ?? []
  const canMutate = role === 'MEMBER' || role === 'ADMIN'
  const selectedTable = scopeTableName(selection)

  const tableId = selectedTable ? (tableIds[selectedTable] ?? null) : null
  const selectedSuggestions = suggestions.filter((suggestion) => selected.has(suggestion.id))
  const allSelected = suggestions.length > 0 && selectedSuggestions.length === suggestions.length
  const jobRunning = job?.status === 'queued' || job?.status === 'running'

  useEffect(() => {
    if (!job) return
    if (job.status !== 'succeeded' && job.status !== 'failed') return
    const marker = `${job.id}:${job.status}`
    if (settledJob.current === marker) return
    settledJob.current = marker
    invalidateAgentResults(queryClient, projectId)
  }, [job, projectId, queryClient])

  useEffect(() => {
    if (!canMutate) setSelected(new Set())
  }, [canMutate])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(suggestions.map((suggestion) => suggestion.id)))
  }

  function startEditing(suggestion: AgentSuggestion) {
    setEditingId(suggestion.id)
    setDraft(suggestion.suggestedDescription)
    setError(null)
  }

  function saveEdit(suggestion: AgentSuggestion) {
    const text = draft.trim()
    if (!text) {
      setError('A descrição não pode ficar vazia.')
      return
    }
    setError(null)
    edit.mutate(
      { id: suggestion.id, text },
      {
        onSuccess: () => {
          setEditingId(null)
          setNotice('Sugestão atualizada.')
        },
        onError: (cause) => setError(messageOf(cause, 'Não foi possível editar a sugestão.')),
      },
    )
  }

  function feedback(decision: 'apply' | 'reject', count: number, skipped: number) {
    const suffix = skipped > 0 ? ` ${skipped} ignorada(s) por não estar(em) mais pendente(s).` : ''
    if (decision === 'apply') {
      setNotice(count === 1 ? `Sugestão aplicada.${suffix}` : `${count} sugestões aplicadas.${suffix}`)
      return
    }
    setNotice(count === 1 ? `Sugestão rejeitada.${suffix}` : `${count} sugestões rejeitadas.${suffix}`)
  }

  function applyMany(ids: string[]) {
    if (ids.length === 0) return
    setError(null)
    apply.mutate(ids, {
      onSuccess: (result) => {
        setSelected(new Set())
        feedback('apply', result.applied.length, result.skipped.length)
      },
      onError: (cause) => setError(messageOf(cause, 'Não foi possível aplicar as sugestões.')),
    })
  }

  function rejectMany(ids: string[]) {
    if (ids.length === 0) return
    setError(null)
    reject.mutate(ids, {
      onSuccess: (result) => {
        setSelected(new Set())
        feedback('reject', result.rejected.length, result.skipped.length)
      },
      onError: (cause) => setError(messageOf(cause, 'Não foi possível rejeitar as sugestões.')),
    })
  }

  function requestGeneration() {
    const input: GenerateSuggestionsInput =
      scope === 'table' && tableId ? { scope: 'table', tableId } : { scope: 'project' }
    setError(null)
    generate.mutate(input, {
      onSuccess: (result) => {
        setIsScopeOpen(false)
        setNotice('Geração solicitada.')
        onJobStarted(result.job.id)
      },
      onError: (cause) => setError(messageOf(cause, 'Não foi possível solicitar a geração.')),
    })
  }

  function openScope() {
    setError(null)
    setScope('project')
    setIsScopeOpen(true)
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-950/40">
      <section
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Sugestões IA"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">Sugestões IA</h2>
            <p className="text-xs text-slate-500">
              Revise, edite e decida cada descrição antes de aplicá-la ao dicionário.
            </p>
          </div>
          <span
            className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
            data-testid="agent-pending-count"
          >
            {suggestions.length} pendente(s)
          </span>
          <div className="ml-auto flex items-center gap-2">
            {canMutate ? (
              <button
                type="button"
                className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                onClick={openScope}
                disabled={jobRunning || generate.isPending}
              >
                Sugerir descrições
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {jobRunning ? (
            <p
              className="rounded-sm bg-indigo-50 px-3 py-2 text-sm text-indigo-700"
              role="status"
              data-testid="agent-job-progress"
            >
              Gerando sugestões… {bannerProgress(job?.stats.tablesProcessed, job?.stats.tables)}
            </p>
          ) : null}

          {job?.status === 'failed' ? (
            <p
              className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              data-testid="agent-job-error"
            >
              Falha ao gerar sugestões: {job.error ?? 'erro desconhecido'}
            </p>
          ) : null}

          {job?.status === 'succeeded' ? (
            <p
              className="rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              role="status"
              data-testid="agent-job-done"
            >
              Geração concluída.
            </p>
          ) : null}

          {notice ? (
            <p
              className="rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              role="status"
              data-testid="agent-notice"
            >
              {notice}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-testid="agent-error">
              {error}
            </p>
          ) : null}

          {canMutate && suggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-sm border border-slate-200 px-3 py-2 text-sm">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  aria-label="Selecionar todas as sugestões"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                Selecionar todas
              </label>
              <span className="text-xs text-slate-500">{selectedSuggestions.length} selecionada(s)</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                  onClick={() => applyMany(selectedSuggestions.map((suggestion) => suggestion.id))}
                  disabled={selectedSuggestions.length === 0 || apply.isPending}
                >
                  Aplicar selecionadas
                </button>
                <button
                  type="button"
                  className="rounded-sm border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  onClick={() => rejectMany(selectedSuggestions.map((suggestion) => suggestion.id))}
                  disabled={selectedSuggestions.length === 0 || reject.isPending}
                >
                  Rejeitar selecionadas
                </button>
              </div>
            </div>
          ) : null}

          {pending.isLoading ? <p className="text-sm text-slate-500">Carregando sugestões…</p> : null}

          {pending.isError ? (
            <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              Não foi possível carregar as sugestões.
            </p>
          ) : null}

          {!pending.isLoading && !pending.isError && suggestions.length === 0 && !jobRunning ? (
            <section className="rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center">
              <h3 className="text-base font-semibold text-ink">Nenhuma sugestão pendente</h3>
              <p className="mt-1 text-sm text-slate-500">
                {canMutate
                  ? 'Solicite uma geração para receber descrições sugeridas pelo agente.'
                  : 'O agente não tem sugestões pendentes neste projeto.'}
              </p>
              {canMutate ? (
                <button
                  type="button"
                  className="mt-4 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
                  onClick={openScope}
                >
                  Sugerir descrições
                </button>
              ) : null}
            </section>
          ) : null}

          {suggestions.length > 0 ? (
            <ul className="space-y-3" aria-label="Sugestões pendentes">
              {suggestions.map((suggestion) => (
                <SuggestionRow
                  key={suggestion.id}
                  suggestion={suggestion}
                  canMutate={canMutate}
                  selected={selected.has(suggestion.id)}
                  editing={editingId === suggestion.id}
                  draft={draft}
                  isEditing={edit.isPending}
                  isApplying={apply.isPending}
                  isRejecting={reject.isPending}
                  onToggle={() => toggle(suggestion.id)}
                  onStartEditing={() => startEditing(suggestion)}
                  onCancelEditing={() => setEditingId(null)}
                  onDraftChange={setDraft}
                  onSaveEdit={() => saveEdit(suggestion)}
                  onApply={() => applyMany([suggestion.id])}
                  onReject={() => rejectMany([suggestion.id])}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {isScopeOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-950/50 p-4">
          <section
            className="mt-16 w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Sugerir descrições"
          >
            <header className="border-b border-slate-200 px-5 py-3">
              <h3 className="text-lg font-semibold text-ink">Sugerir descrições</h3>
              <p className="text-xs text-slate-500">
                O agente mira apenas tabelas e colunas sem descrição. Nada é gravado antes da sua aprovação.
              </p>
            </header>

            <div className="space-y-3 px-5 py-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">Escopo da geração</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="agent-scope"
                    value="project"
                    checked={scope === 'project'}
                    onChange={() => setScope('project')}
                  />
                  Projeto inteiro
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="agent-scope"
                    value="table"
                    checked={scope === 'table'}
                    onChange={() => setScope('table')}
                    disabled={!tableId}
                  />
                  Esta tabela{selectedTable ? ` (${selectedTable})` : ''}
                </label>
                {!tableId ? (
                  <p className="text-xs text-slate-500">
                    Selecione uma tabela na árvore que já tenha contexto conhecido pelo agente para usar este escopo.
                  </p>
                ) : null}
              </fieldset>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={() => setIsScopeOpen(false)}
                  disabled={generate.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                  onClick={requestGeneration}
                  disabled={generate.isPending || (scope === 'table' && !tableId)}
                >
                  {generate.isPending ? 'Solicitando…' : 'Gerar sugestões'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

interface SuggestionRowProps {
  suggestion: AgentSuggestion
  canMutate: boolean
  selected: boolean
  editing: boolean
  draft: string
  isEditing: boolean
  isApplying: boolean
  isRejecting: boolean
  onToggle: () => void
  onStartEditing: () => void
  onCancelEditing: () => void
  onDraftChange: (value: string) => void
  onSaveEdit: () => void
  onApply: () => void
  onReject: () => void
}

function SuggestionRow({
  suggestion,
  canMutate,
  selected,
  editing,
  draft,
  isEditing,
  isApplying,
  isRejecting,
  onToggle,
  onStartEditing,
  onCancelEditing,
  onDraftChange,
  onSaveEdit,
  onApply,
  onReject,
}: SuggestionRowProps) {
  const path = suggestionPath(suggestion)
  const target = targetOf(suggestion)
  const terms = businessTermsOf(suggestion)
  const describedColumns = describedColumnsOf(suggestion)
  const foreignKeys = foreignKeysOf(suggestion)

  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      data-testid={suggestionTestId(suggestion)}
    >
      <div className="flex items-start gap-3">
        {canMutate ? (
          <input
            type="checkbox"
            className="mt-1"
            aria-label={`Selecionar sugestão ${path}`}
            checked={selected}
            onChange={onToggle}
          />
        ) : null}

        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-semibold text-slate-800">{path}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wide">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                {suggestion.itemType === 'table' ? 'Tabela' : 'Coluna'}
              </span>
              {target?.columnType ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{target.columnType}</span>
              ) : null}
              {target?.primaryKey ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">PK</span>
              ) : null}
              {target?.foreignKey ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">FK</span> : null}
            </div>
            {terms.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">Termos de negócio: {terms.join(', ')}</p>
            ) : null}
            {describedColumns.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">Colunas já descritas: {describedColumns.join(', ')}</p>
            ) : null}
            {foreignKeys.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">Chaves estrangeiras: {foreignKeys.join(', ')}</p>
            ) : null}
          </div>

          <div className="min-w-0">
            {editing ? (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  Editar sugestão {path}
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-sm bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                    onClick={onSaveEdit}
                    disabled={isEditing}
                  >
                    Salvar edição
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    onClick={onCancelEditing}
                    disabled={isEditing}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-sm bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {suggestion.suggestedDescription}
              </p>
            )}

            {canMutate && !editing ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-sm bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                  onClick={onApply}
                  disabled={isApplying || isRejecting}
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  className="rounded-sm border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  onClick={onStartEditing}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="rounded-sm border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  onClick={onReject}
                  disabled={isApplying || isRejecting}
                >
                  Rejeitar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
}
