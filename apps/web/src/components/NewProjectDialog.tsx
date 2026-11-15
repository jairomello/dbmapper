import { type FormEvent, useState } from 'react'
import { projectsApi } from '../api/projects'
import type { ProjectDocument, ProjectView } from '../api/types'
import { FileImportButton } from './FileImportButton'

const NO_CREATE_TABLE_MESSAGE =
  "Nenhuma tabela encontrada. Verifique se o arquivo contém comandos 'CREATE TABLE' válidos."

interface NewProjectDialogProps {
  onCreated: (project: ProjectView) => void
  onClose: () => void
}

function nameFromFile(file: File): string {
  return file.name.replace(/\.(sql|json)$/i, '').trim()
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function NewProjectDialog({ onCreated, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [sql, setSql] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isImportingJson, setIsImportingJson] = useState(false)

  const isBusy = isCreating || isImportingJson

  async function handleSqlFile(file: File, text: string) {
    setFileName(file.name)
    setSql(text)
    setError(null)
    if (!name.trim()) setName(nameFromFile(file))
  }

  async function handleJsonFile(_file: File, text: string) {
    setError(null)
    setIsImportingJson(true)
    try {
      const document = JSON.parse(text) as ProjectDocument
      const project = await projectsApi.importProject(document)
      onCreated(project)
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível importar o arquivo JSON.'))
    } finally {
      setIsImportingJson(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Informe o nome do projeto.')
      return
    }

    if (!/\bcreate\s+table\b/i.test(sql)) {
      setError(NO_CREATE_TABLE_MESSAGE)
      return
    }

    setIsCreating(true)
    try {
      const project = await projectsApi.create({ name: name.trim() })
      const preview = await projectsApi.previewImport(project.id, sql)
      const applied = await projectsApi.applyImport(project.id, sql, { tables: [], columns: [] }, preview.plan)
      onCreated(applied.project)
    } catch (cause) {
      setError(messageOf(cause, 'Não foi possível criar o projeto a partir do SQL.'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-auto bg-slate-950/50 p-4">
      <section
        className="mt-8 w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Novo projeto"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Novo projeto</h2>
            <p className="text-xs text-slate-500">Importe um arquivo SQL, cole o script ou abra um JSON do DBMapper.</p>
          </div>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancelar
          </button>
        </header>

        <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            Nome do projeto
            <input
              className="mt-1 block w-full rounded-sm border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <FileImportButton
              label="Importar arquivo .sql"
              accept=".sql,text/plain"
              description="Clique ou arraste um dump .sql"
              disabled={isBusy}
              onFile={handleSqlFile}
            />
            <FileImportButton
              label="Importar arquivo .json"
              accept=".json,application/json"
              description="Abra um projeto exportado pelo DBMapper"
              disabled={isBusy}
              onFile={handleJsonFile}
            />
          </div>

          <label className="block text-sm font-medium text-slate-700">
            SQL
            <textarea
              className="mt-1 min-h-40 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              placeholder="Cole aqui os comandos CREATE TABLE ou selecione um arquivo .sql."
            />
          </label>

          {fileName ? <p className="text-xs text-slate-500">Arquivo selecionado: {fileName}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
              disabled={isBusy}
            >
              {isCreating ? 'Criando…' : 'Criar projeto'}
            </button>
            <span className="text-xs text-slate-500">
              {isImportingJson
                ? 'Importando o arquivo JSON…'
                : 'O JSON importa na hora; o SQL é enviado ao servidor após você clicar em Criar.'}
            </span>
          </div>
        </form>
      </section>
    </div>
  )
}
