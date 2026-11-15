import type { DatabaseModel } from '@dbmapper/domain'
import { type FormEvent, useState } from 'react'
import { projectsApi } from '../api/projects'
import type { ImportPlan, ProjectView, RenameMapping } from '../api/types'
import { FileImportButton } from './FileImportButton'

type WizardStep = 'upload' | 'tables' | 'columns' | 'relationships' | 'summary' | 'result'

const STEP_LABELS: Array<{ step: WizardStep; label: string }> = [
  { step: 'upload', label: 'Upload' },
  { step: 'tables', label: 'Tabelas' },
  { step: 'columns', label: 'Colunas' },
  { step: 'relationships', label: 'Relacionamentos' },
  { step: 'summary', label: 'Resumo' },
]

const EMPTY_RENAMES: RenameMapping = { tables: [], columns: [] }

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function countParts(parts: number[]): number {
  return parts.reduce((total, value) => total + value, 0)
}

interface UpdateWizardProps {
  projectId: string
  onClose: () => void
  onApplied: (project: ProjectView, database: DatabaseModel) => void
}

export function UpdateWizard({ projectId, onClose, onApplied }: UpdateWizardProps) {
  const [sql, setSql] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [step, setStep] = useState<WizardStep>('upload')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [renames, setRenames] = useState<RenameMapping>(EMPTY_RENAMES)
  const [error, setError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  const stepIndex = STEP_LABELS.findIndex((candidate) => candidate.step === step)

  async function runPreview(nextRenames: RenameMapping): Promise<ImportPlan | null> {
    setError(null)
    setIsPreviewing(true)
    try {
      const result = await projectsApi.previewImport(projectId, sql, nextRenames)
      setPlan(result.plan)
      setRenames(nextRenames)
      return result.plan
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível gerar a prévia da atualização.'))
      return null
    } finally {
      setIsPreviewing(false)
    }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sql.trim()) {
      setError('Informe o SQL atualizado antes de gerar a prévia.')
      return
    }
    const nextPlan = await runPreview(renames)
    if (nextPlan) setStep('tables')
  }

  async function handleSqlFile(file: File, text: string) {
    setFileName(file.name)
    setSql(text)
    setError(null)
  }

  async function handleTableRename(from: string, to: string) {
    const nextTables = renames.tables.filter((rename) => rename.from !== from)
    if (to) nextTables.push({ from, to })
    await runPreview({ ...renames, tables: nextTables })
  }

  async function handleColumnRename(table: string, from: string, to: string) {
    const nextColumns = renames.columns.filter((rename) => !(rename.table === table && rename.from === from))
    if (to) nextColumns.push({ table, from, to })
    await runPreview({ ...renames, columns: nextColumns })
  }

  async function handleApply() {
    if (!plan) return
    setError(null)
    setIsApplying(true)
    try {
      const result = await projectsApi.applyImport(projectId, sql, renames, plan)
      setPlan(result.plan)
      setStep('result')
      onApplied(result.project, result.project.database)
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível aplicar a atualização.'))
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-auto bg-slate-950/50 p-4">
      <section
        className="mt-8 w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Wizard de atualização"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Atualizar modelo</h2>
            <p className="text-xs text-slate-500">
              Prévia do diff calculada pelo servidor; nada é gravado antes da confirmação.
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

        <nav className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-2 text-xs" aria-label="Passos do wizard">
          {STEP_LABELS.map((entry, index) => {
            const active = entry.step === step
            const completed = stepIndex > index || step === 'result'
            return (
              <span
                key={entry.step}
                className={`rounded-full px-2 py-0.5 font-medium ${
                  active ? 'bg-accent text-white' : completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {entry.label}
              </span>
            )
          })}
        </nav>

        <div className="space-y-4 px-5 py-4">
          {error ? (
            <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {step === 'upload' ? (
            <form className="space-y-3" onSubmit={handlePreview}>
              <label className="block text-sm font-medium text-slate-700">
                SQL de atualização
                <textarea
                  className="mt-1 min-h-40 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
                  value={sql}
                  onChange={(event) => setSql(event.target.value)}
                  placeholder="Cole aqui o novo script SQL ou selecione um arquivo."
                />
              </label>
              <FileImportButton
                label="Importar arquivo .sql"
                accept=".sql,text/plain"
                description="Clique ou arraste o dump SQL com as mudanças do modelo"
                disabled={isPreviewing}
                onFile={handleSqlFile}
              />
              {fileName ? <p className="text-xs text-slate-500">Arquivo selecionado: {fileName}</p> : null}
              <button
                type="submit"
                className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                disabled={isPreviewing}
              >
                {isPreviewing ? 'Gerando prévia…' : 'Gerar prévia'}
              </button>
            </form>
          ) : null}

          {step === 'tables' && plan ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Tabelas</h3>
              <ul className="space-y-1 text-sm">
                {plan.tables.kept.map((name) => (
                  <li key={`kept-${name}`} className="rounded-sm bg-slate-50 px-2 py-1" data-testid={`table-kept-${name}`}>
                    Mantida: <strong>{name}</strong>
                  </li>
                ))}
                {plan.tables.added.map((name) => (
                  <li key={`added-${name}`} className="rounded-sm bg-emerald-50 px-2 py-1" data-testid={`table-added-${name}`}>
                    Adicionada: <strong>{name}</strong>
                  </li>
                ))}
                {plan.tables.renamed.map((rename) => (
                  <li
                    key={`renamed-${rename.from}`}
                    className="rounded-sm bg-sky-50 px-2 py-1"
                    data-testid={`table-renamed-${rename.from}-${rename.to}`}
                  >
                    Renomeada: <strong>{rename.from}</strong> → <strong>{rename.to}</strong>
                  </li>
                ))}
                {plan.tables.removed.map((name) => {
                  const currentTarget = renames.tables.find((rename) => rename.from === name)?.to ?? ''
                  return (
                    <li
                      key={`removed-${name}`}
                      className="flex flex-wrap items-center gap-2 rounded-sm bg-red-50 px-2 py-1"
                      data-testid={`table-removed-${name}`}
                    >
                      <span>
                        Removida: <strong>{name}</strong>
                      </span>
                      {plan.tables.added.length > 0 ? (
                        <label className="flex items-center gap-2 text-xs text-slate-700">
                          Renomear tabela {name} para
                          <select
                            className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs"
                            aria-label={`Renomear tabela ${name} para`}
                            value={currentTarget}
                            onChange={(event) => void handleTableRename(name, event.target.value)}
                            disabled={isPreviewing}
                          >
                            <option value="">Não renomear</option>
                            {plan.tables.added.map((target) => (
                              <option key={target} value={target}>
                                {target}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {step === 'columns' && plan ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Colunas</h3>
              <ul className="space-y-1 text-sm">
                {plan.columns.kept.map((column) => (
                  <li
                    key={`kept-${column.table}-${column.name}`}
                    className="rounded-sm bg-slate-50 px-2 py-1"
                    data-testid={`column-kept-${column.table}-${column.name}`}
                  >
                    Mantida: <strong>{column.table}.{column.name}</strong>
                  </li>
                ))}
                {plan.columns.added.map((column) => (
                  <li
                    key={`added-${column.table}-${column.name}`}
                    className="rounded-sm bg-emerald-50 px-2 py-1"
                    data-testid={`column-added-${column.table}-${column.name}`}
                  >
                    Adicionada: <strong>{column.table}.{column.name}</strong> ({column.type})
                  </li>
                ))}
                {plan.columns.changed.map((column) => (
                  <li
                    key={`changed-${column.table}-${column.name}`}
                    className="rounded-sm bg-amber-50 px-2 py-1"
                    data-testid={`column-changed-${column.table}-${column.name}`}
                  >
                    Tipo alterado: <strong>{column.table}.{column.name}</strong> ({column.from} → {column.to})
                  </li>
                ))}
                {plan.columns.renamed.map((column) => (
                  <li
                    key={`renamed-${column.table}-${column.from}`}
                    className="rounded-sm bg-sky-50 px-2 py-1"
                    data-testid={`column-renamed-${column.table}-${column.from}-${column.to}`}
                  >
                    Renomeada: <strong>{column.table}.{column.from}</strong> →{' '}
                    <strong>{column.table}.{column.to}</strong>
                  </li>
                ))}
                {plan.columns.removed.map((column) => {
                  const currentTarget =
                    renames.columns.find((rename) => rename.table === column.table && rename.from === column.name)?.to ?? ''
                  const targets = plan.columns.added.filter((candidate) => candidate.table === column.table)
                  return (
                    <li
                      key={`removed-${column.table}-${column.name}`}
                      className="flex flex-wrap items-center gap-2 rounded-sm bg-red-50 px-2 py-1"
                      data-testid={`column-removed-${column.table}-${column.name}`}
                    >
                      <span>
                        Removida: <strong>{column.table}.{column.name}</strong>
                      </span>
                      {targets.length > 0 ? (
                        <label className="flex items-center gap-2 text-xs text-slate-700">
                          Renomear coluna {column.name} para
                          <select
                            className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs"
                            aria-label={`Renomear coluna ${column.table}.${column.name} para`}
                            value={currentTarget}
                            onChange={(event) => void handleColumnRename(column.table, column.name, event.target.value)}
                            disabled={isPreviewing}
                          >
                            <option value="">Não renomear</option>
                            {targets.map((target) => (
                              <option key={target.name} value={target.name}>
                                {target.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {step === 'relationships' && plan ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Relacionamentos</h3>
              <ul className="space-y-1 text-sm">
                {plan.relationships.kept.map((relationship) => (
                  <li
                    key={`kept-${relationship.table}-${relationship.target}`}
                    className="rounded-sm bg-slate-50 px-2 py-1"
                    data-testid={`relationship-kept-${relationship.table}-${relationship.target}`}
                  >
                    Mantido: <strong>{relationship.table}</strong> → <strong>{relationship.target}</strong>
                  </li>
                ))}
                {plan.relationships.added.map((relationship) => (
                  <li
                    key={`added-${relationship.table}-${relationship.target}`}
                    className="rounded-sm bg-emerald-50 px-2 py-1"
                    data-testid={`relationship-added-${relationship.table}-${relationship.target}`}
                  >
                    Adicionado: <strong>{relationship.table}</strong> → <strong>{relationship.target}</strong>
                  </li>
                ))}
                {plan.relationships.removed.map((relationship) => (
                  <li
                    key={`removed-${relationship.table}-${relationship.target}`}
                    className="rounded-sm bg-red-50 px-2 py-1"
                    data-testid={`relationship-removed-${relationship.table}-${relationship.target}`}
                  >
                    Removido: <strong>{relationship.table}</strong> → <strong>{relationship.target}</strong>
                  </li>
                ))}
                {plan.relationships.kept.length +
                  plan.relationships.added.length +
                  plan.relationships.removed.length ===
                0 ? (
                  <li className="text-xs text-slate-500">Nenhuma alteração de relacionamento.</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {step === 'summary' && plan ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">Resumo</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-sm bg-slate-50 px-3 py-2" data-testid="summary-tables">
                  Tabelas: {plan.tables.kept.length} mantidas · {plan.tables.renamed.length} renomeadas ·{' '}
                  {plan.tables.added.length} adicionadas · {plan.tables.removed.length} removidas
                </div>
                <div className="rounded-sm bg-slate-50 px-3 py-2" data-testid="summary-columns">
                  Colunas: {plan.columns.kept.length} mantidas · {plan.columns.renamed.length} renomeadas ·{' '}
                  {plan.columns.added.length} adicionadas · {plan.columns.removed.length} removidas ·{' '}
                  {plan.columns.changed.length} com tipo alterado
                </div>
                <div className="rounded-sm bg-slate-50 px-3 py-2" data-testid="summary-relationships">
                  Relacionamentos: {plan.relationships.kept.length} mantidos · {plan.relationships.added.length}{' '}
                  adicionados · {plan.relationships.removed.length} removidos
                </div>
                <div className="rounded-sm bg-slate-50 px-3 py-2" data-testid="summary-renames">
                  Renomes explícitos: {renames.tables.length} tabela(s) · {renames.columns.length} coluna(s)
                </div>
              </dl>
              <p className="text-xs text-slate-500">
                Ao confirmar, a atualização é aplicada de forma atômica. Itens preservados mantêm descrição, termos e
                revisão.
              </p>
            </div>
          ) : null}

          {step === 'result' ? (
            <div className="space-y-2" role="status">
              <h3 className="text-sm font-semibold text-ink">Importação aplicada</h3>
              <p className="text-sm text-slate-600">
                {countParts([
                  plan?.tables.added.length ?? 0,
                  plan?.tables.removed.length ?? 0,
                  plan?.tables.renamed.length ?? 0,
                  plan?.columns.added.length ?? 0,
                  plan?.columns.removed.length ?? 0,
                  plan?.columns.renamed.length ?? 0,
                  plan?.columns.changed.length ?? 0,
                ])}{' '}
                alteração(ões) processada(s). A árvore e a barra de cobertura foram atualizadas.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <div className="flex gap-2">
            {step !== 'upload' && step !== 'result' ? (
              <button
                type="button"
                className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  const previous = STEP_LABELS[stepIndex - 1]?.step ?? 'upload'
                  setStep(previous)
                }}
              >
                Voltar
              </button>
            ) : null}
          </div>

          <div className="flex gap-2">
            {step === 'tables' || step === 'columns' || step === 'relationships' ? (
              <button
                type="button"
                className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                onClick={() => {
                  const next = STEP_LABELS[stepIndex + 1]?.step ?? 'summary'
                  setStep(next)
                }}
                disabled={isPreviewing}
              >
                Continuar
              </button>
            ) : null}

            {step === 'summary' ? (
              <button
                type="button"
                className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={() => void handleApply()}
                disabled={isApplying}
              >
                {isApplying ? 'Aplicando…' : 'Confirmar e aplicar'}
              </button>
            ) : null}

            {step === 'result' ? (
              <button
                type="button"
                className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
                onClick={onClose}
              >
                Concluir
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  )
}
