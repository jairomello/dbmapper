import { type ChangeEvent, type FormEvent, useState } from 'react'
import { projectsApi } from '../api/projects'
import type { ProjectView } from '../api/types'

const NO_CREATE_TABLE_MESSAGE =
  "Nenhuma tabela encontrada. Verifique se o arquivo contém comandos 'CREATE TABLE' válidos."

interface SqlProjectCreatorProps {
  onCreated: (project: ProjectView) => void
  onCancel: () => void
}

export function SqlProjectCreator({ onCreated, onCancel }: SqlProjectCreatorProps) {
  const [name, setName] = useState('')
  const [sql, setSql] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSql(await file.text())
    setError(null)
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
      setError(cause instanceof Error && cause.message ? cause.message : 'Não foi possível criar o projeto a partir do SQL.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3"
      aria-label="Novo projeto a partir de SQL"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-medium text-slate-700">
          Nome do projeto
          <input
            className="mt-1 block w-64 rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Arquivo SQL
          <input
            className="mt-1 block w-64 text-sm text-slate-600"
            type="file"
            accept=".sql,text/plain"
            onChange={handleFile}
          />
        </label>
        {fileName ? <span className="pb-2 text-xs text-slate-500">Arquivo selecionado: {fileName}</span> : null}
      </div>

      <label className="block text-xs font-medium text-slate-700">
        SQL
        <textarea
          className="mt-1 min-h-28 w-full rounded-sm border border-slate-300 px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          placeholder="Cole aqui os comandos CREATE TABLE ou selecione um arquivo .sql."
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
          disabled={isCreating}
        >
          {isCreating ? 'Criando…' : 'Criar a partir de SQL'}
        </button>
        <button
          type="button"
          className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          onClick={onCancel}
          disabled={isCreating}
        >
          Cancelar
        </button>
        {error ? (
          <p className="text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}
