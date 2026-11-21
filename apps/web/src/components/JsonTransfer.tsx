import { type ChangeEvent, useState } from 'react'
import { projectsApi } from '../api/projects'
import type { ProjectDocument, ProjectView } from '../api/types'

interface JsonTransferProps {
  projectId: string
  onImported: (project: ProjectView) => void
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function downloadJson(document: ProjectDocument) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${document.database.name || 'dbmapper'}.json`
  window.document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function JsonTransfer({ projectId, onImported }: JsonTransferProps) {
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  async function handleExport() {
    setError(null)
    setIsExporting(true)
    try {
      const document = await projectsApi.exportProject(projectId)
      downloadJson(document)
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível exportar o projeto.'))
    } finally {
      setIsExporting(false)
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setIsImporting(true)
    try {
      const document = JSON.parse(await file.text()) as ProjectDocument
      const project = await projectsApi.importProject(document)
      onImported(project)
      event.target.value = ''
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível importar o arquivo JSON.'))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60"
        onClick={() => void handleExport()}
        disabled={isExporting}
      >
        {isExporting ? 'Exportando…' : 'Exportar JSON'}
      </button>
      <label className="w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs font-medium text-ink transition hover:bg-surface-2">
        {isImporting ? 'Importando…' : 'Importar JSON'}
        <input
          className="hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Importar JSON"
          onChange={handleImport}
          disabled={isImporting}
        />
      </label>
      {error ? (
        <p className="px-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
