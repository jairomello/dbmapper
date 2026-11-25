import { type FormEvent, useState } from 'react'
import { projectsApi } from '../api/projects'
import type { ProjectSummary } from '../api/types'

interface RenameProjectDialogProps {
  project: Pick<ProjectSummary, 'id' | 'name'>
  onRenamed: (project: ProjectSummary) => void
  onClose: () => void
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function RenameProjectDialog({ project, onRenamed, onClose }: RenameProjectDialogProps) {
  const [name, setName] = useState(project.name)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome do projeto.')
      return
    }
    if (trimmed === project.name) {
      onClose()
      return
    }

    setIsSaving(true)
    try {
      const renamed = await projectsApi.rename(project.id, trimmed)
      onRenamed(renamed)
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível renomear o projeto.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
      <section
        className="w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Renomear projeto"
      >
        <header className="border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Renomear projeto</h2>
          <p className="mt-0.5 text-xs text-muted">Só o nome muda; o modelo e o histórico ficam intactos.</p>
        </header>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <label className="block text-sm font-medium text-ink">
            Nome do projeto
            <input
              className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              // biome-ignore lint/a11y/noAutofocus: diálogo curto de renomeação
              autoFocus
              required
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? 'Salvando…' : 'Salvar nome'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
