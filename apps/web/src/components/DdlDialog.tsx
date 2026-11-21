import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { projectsApi } from '../api/projects'
import type { DdlBaseline, DdlDialect, DdlGeneration, DdlMode, DdlRenameMapping, UserRole } from '../api/types'
import { PROJECTS_QUERY_KEY, projectQueryKey } from '../projects/queries'

const BASELINE_MISSING_MESSAGE =
  'Este projeto ainda não tem baseline capturado. Use o modo "create" ou marque o banco como sincronizado.'

const DIALECT_OPTIONS: Array<{ value: DdlDialect; label: string }> = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
]

const MODE_OPTIONS: Array<{ value: DdlMode; label: string }> = [
  { value: 'create', label: 'Script completo' },
  { value: 'migration', label: 'Migração a partir do baseline' },
]

interface RenameRow {
  id: number
  from: string
  to: string
}

let renameRowSequence = 0

function createRenameRow(): RenameRow {
  renameRowSequence += 1
  return { id: renameRowSequence, from: '', to: '' }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatBaselineDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'data desconhecida'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function renamesFromRows(tables: RenameRow[], columns: RenameRow[]): DdlRenameMapping {
  const tableMap: Record<string, string> = {}
  for (const row of tables) {
    const from = row.from.trim()
    const to = row.to.trim()
    if (from && to) tableMap[from] = to
  }

  const columnMap: Record<string, string> = {}
  for (const row of columns) {
    const from = row.from.trim()
    const to = row.to.trim()
    if (from && to) columnMap[from] = to
  }

  return { tables: tableMap, columns: columnMap }
}

function hasRenames(renames: DdlRenameMapping): boolean {
  return Object.keys(renames.tables).length > 0 || Object.keys(renames.columns).length > 0
}

interface RenameEditorProps {
  title: string
  testId: string
  fromLabel: string
  fromPlaceholder: string
  toLabel: string
  rows: RenameRow[]
  onRowsChange: (rows: RenameRow[]) => void
}

function RenameEditor({ title, testId, fromLabel, fromPlaceholder, toLabel, rows, onRowsChange }: RenameEditorProps) {
  function update(id: number, field: 'from' | 'to', value: string) {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  return (
    <fieldset className="rounded-sm border border-slate-200 p-3" data-testid={testId}>
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2">
            <input
              className="w-40 rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
              aria-label={`${fromLabel} ${index + 1}`}
              placeholder={fromPlaceholder}
              value={row.from}
              onChange={(event) => update(row.id, 'from', event.target.value)}
            />
            <span className="text-xs text-slate-400" aria-hidden="true">
              →
            </span>
            <input
              className="w-40 rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
              aria-label={`${toLabel} ${index + 1}`}
              placeholder="novo_nome"
              value={row.to}
              onChange={(event) => update(row.id, 'to', event.target.value)}
            />
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              aria-label={`Remover ${title} ${index + 1}`}
              onClick={() => onRowsChange(rows.filter((candidate) => candidate.id !== row.id))}
              disabled={rows.length === 1}
            >
              Remover
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 rounded-sm border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        onClick={() => onRowsChange([...rows, createRenameRow()])}
      >
        Adicionar
      </button>
    </fieldset>
  )
}

interface DdlDialogProps {
  projectId: string
  role: UserRole | undefined
  onClose: () => void
}

export function DdlDialog({ projectId, role, onClose }: DdlDialogProps) {
  const queryClient = useQueryClient()
  const [dialect, setDialect] = useState<DdlDialect>('postgres')
  const [mode, setMode] = useState<DdlMode>('create')
  const [tableRows, setTableRows] = useState<RenameRow[]>(() => [createRenameRow()])
  const [columnRows, setColumnRows] = useState<RenameRow[]>(() => [createRenameRow()])
  const [result, setResult] = useState<DdlGeneration | null>(null)
  const [baseline, setBaseline] = useState<DdlBaseline | null>(null)
  const [isBaselineLoading, setIsBaselineLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const captureStarted = useRef(false)

  const canManageBaseline = role === 'MEMBER' || role === 'ADMIN'

  useEffect(() => {
    let active = true
    async function loadBaseline() {
      try {
        const loaded = await projectsApi.readDdlBaseline(projectId)
        if (active && !captureStarted.current) setBaseline(loaded.baseline)
      } catch (cause) {
        if (active && !captureStarted.current) {
          setError(messageOf(cause, 'Não foi possível carregar o baseline do projeto.'))
        }
      } finally {
        if (active) setIsBaselineLoading(false)
      }
    }
    void loadBaseline()
    return () => {
      active = false
    }
  }, [projectId])

  async function generateScript() {
    setError(null)
    setNotice(null)
    setIsGenerating(true)
    try {
      const mapping = mode === 'migration' ? renamesFromRows(tableRows, columnRows) : null
      const generated = await projectsApi.generateDdl(projectId, {
        dialect,
        mode,
        renames: mapping && hasRenames(mapping) ? mapping : undefined,
      })
      setResult(generated)
    } catch (cause) {
      setResult(null)
      if (cause instanceof ApiError && cause.code === 'DDL_BASELINE_MISSING') {
        setError(BASELINE_MISSING_MESSAGE)
      } else {
        setError(messageOf(cause, 'Não foi possível gerar o script SQL.'))
      }
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await generateScript()
  }

  async function captureBaseline() {
    captureStarted.current = true
    setError(null)
    setNotice(null)
    setIsCapturing(true)
    try {
      const captured = await projectsApi.captureDdlBaseline(projectId)
      setBaseline(captured.baseline)
      await queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      if (mode === 'migration') await generateScript()
      setNotice('Banco marcado como sincronizado. O baseline deste projeto foi atualizado.')
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível marcar o banco como sincronizado.'))
    } finally {
      setIsCapturing(false)
    }
  }

  async function copyScript() {
    if (!result?.script) return
    try {
      await navigator.clipboard.writeText(result.script)
      setNotice('Script copiado para a área de transferência.')
    } catch {
      setError('Não foi possível copiar o script para a área de transferência.')
    }
  }

  function downloadScript() {
    if (!result?.script) return
    const blob = new Blob([result.script], { type: 'application/sql' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ddl-${result.dialect}-${result.mode}.sql`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function changeDialect(next: DdlDialect) {
    setDialect(next)
    setResult(null)
    setError(null)
  }

  function changeMode(next: DdlMode) {
    setMode(next)
    setResult(null)
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-auto bg-slate-950/50 p-4">
      <section
        className="mt-8 w-full max-w-4xl rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Gerar SQL"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Gerar SQL</h2>
            <p className="text-xs text-slate-500">
              Gere o script completo ou a migração contra o baseline do projeto. Nada é executado no banco.
            </p>
          </div>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            Fechar
          </button>
        </header>

        <div className="space-y-4 max-h-[calc(100vh-8rem)] overflow-auto px-5 py-4">
          {error ? (
            <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-testid="ddl-error">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p
              className="rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              role="status"
              data-testid="ddl-notice"
            >
              {notice}
            </p>
          ) : null}

          <form className="flex flex-wrap items-end gap-3" onSubmit={handleGenerate}>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dialeto
              <select
                className="rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
                aria-label="Dialeto"
                value={dialect}
                onChange={(event) => changeDialect(event.target.value as DdlDialect)}
                disabled={isGenerating}
              >
                {DIALECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Modo
              <select
                className="rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
                aria-label="Modo"
                value={mode}
                onChange={(event) => changeMode(event.target.value as DdlMode)}
                disabled={isGenerating}
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
              disabled={isGenerating}
            >
              {isGenerating ? 'Gerando…' : 'Gerar script'}
            </button>

            {isGenerating ? (
              <span className="text-xs text-slate-500" role="status" data-testid="ddl-loading">
                Gerando script…
              </span>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-600">
              <span className="font-semibold uppercase tracking-wide text-slate-500">Baseline</span>{' '}
              {isBaselineLoading ? (
                <span data-testid="ddl-baseline-status">Carregando baseline…</span>
              ) : baseline ? (
                <span data-testid="ddl-baseline-status">Sincronizado em {formatBaselineDate(baseline.capturedAt)}</span>
              ) : (
                <span data-testid="ddl-baseline-status">Ainda não capturado</span>
              )}
            </div>

            {canManageBaseline ? (
              <button
                type="button"
                className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => void captureBaseline()}
                disabled={isCapturing}
                data-testid="ddl-baseline-action"
              >
                {isCapturing ? 'Sincronizando…' : 'Marcar banco como sincronizado'}
              </button>
            ) : null}
          </div>

          {mode === 'migration' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <RenameEditor
                title="Renomeação de tabelas"
                testId="ddl-table-renames"
                fromLabel="Tabela de origem"
                fromPlaceholder="tabela_atual"
                toLabel="Novo nome da tabela"
                rows={tableRows}
                onRowsChange={setTableRows}
              />
              <RenameEditor
                title="Renomeação de colunas"
                testId="ddl-column-renames"
                fromLabel="Coluna de origem"
                fromPlaceholder="tabela.coluna"
                toLabel="Novo nome da coluna"
                rows={columnRows}
                onRowsChange={setColumnRows}
              />
            </div>
          ) : null}

          {result ? (
            <div className="space-y-3">
              {mode === 'migration' ? (
                <p
                  className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  data-testid="ddl-baseline-warning"
                >
                  {baseline
                    ? `Migração calculada sobre o baseline capturado em ${formatBaselineDate(baseline.capturedAt)}. Revise o script antes de executar.`
                    : 'Migração calculada sobre o baseline do projeto. Revise o script contra o banco real antes de executar.'}
                </p>
              ) : null}

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Preview do script
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      onClick={() => void copyScript()}
                      disabled={!result.script}
                    >
                      Copiar
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      onClick={downloadScript}
                      disabled={!result.script}
                    >
                      Baixar .sql
                    </button>
                  </div>
                </div>
                <textarea
                  className="min-h-56 w-full rounded-sm border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none"
                  aria-label="Script SQL gerado"
                  data-testid="ddl-script-preview"
                  value={result.script}
                  readOnly
                  spellCheck={false}
                  placeholder="Nenhuma instrução gerada para o modelo atual."
                />
              </div>

              {result.destructive.length > 0 ? (
                <section
                  className="rounded-sm border border-red-200 bg-red-50 px-3 py-2"
                  aria-label="Operações destrutivas"
                  data-testid="ddl-destructive"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">Operações destrutivas</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-red-800">
                    {result.destructive.map((statement, index) => (
                      <li key={statement} data-testid={`ddl-destructive-${index}`}>
                        <span className="font-mono">{statement}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {result.warnings.length > 0 ? (
                <section
                  className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2"
                  aria-label="Avisos"
                  data-testid="ddl-warnings"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Avisos</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-amber-800">
                    {result.warnings.map((warning, index) => (
                      <li key={warning} data-testid={`ddl-warning-${index}`}>
                        {warning}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
