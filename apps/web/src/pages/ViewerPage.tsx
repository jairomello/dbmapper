import type { DatabaseModel } from '@dbmapper/domain'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { SemanticTree } from '../components/SemanticTree'
import { StatusBar } from '../components/StatusBar'
import { ViewerDetail } from '../components/ViewerDetail'
import type { Selection } from '../lib/selection'
import { useProject } from '../projects/queries'

function filterDatabase(database: DatabaseModel, query: string): DatabaseModel {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return database

  const matches = (value: string | undefined) => (value ?? '').toLowerCase().includes(normalized)

  return {
    ...database,
    tables: database.tables.filter(
      (table) =>
        matches(table.name) ||
        matches(table.description) ||
        table.columns.some((column) => matches(column.name) || matches(column.description)),
    ),
  }
}

function GalleryLink() {
  return (
    <Link className="text-accent underline" to="/">
      Voltar para a galeria
    </Link>
  )
}

export function ViewerPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id ?? ''
  const project = useProject(projectId)
  const [selection, setSelection] = useState<Selection>({ type: 'database' })
  const [search, setSearch] = useState('')

  if (!id) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-sm text-slate-600">
        <p>Projeto não encontrado.</p>
        <GalleryLink />
      </main>
    )
  }

  if (project.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg text-sm text-slate-500">
        Carregando dicionário…
      </main>
    )
  }

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.status === 404
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-4 text-center text-sm text-slate-600">
        <p role={notFound ? 'status' : 'alert'}>
          {notFound ? 'Projeto não encontrado.' : 'Não foi possível carregar o projeto.'}
        </p>
        <GalleryLink />
      </main>
    )
  }

  if (!project.data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-sm text-slate-600">
        <p>Projeto não encontrado.</p>
        <GalleryLink />
      </main>
    )
  }

  const database = filterDatabase(project.data.database, search)
  const hasResults = database.tables.length > 0

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-header px-4 py-3 text-header-ink">
        <Link
          to="/"
          className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Projetos
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide">DBMapper</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/70">
            {project.data.database.name}
          </span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-200">
            Somente leitura
          </span>
        </div>

        <input
          type="search"
          className="ml-auto w-full max-w-xs rounded-sm border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-400 focus:border-accent"
          aria-label="Buscar no dicionário"
          placeholder="Buscar tabelas, colunas e descrições…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setSelection({ type: 'database' })
          }}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-hidden border-r border-slate-200 bg-white">
          <SemanticTree database={database} selection={selection} onSelect={setSelection} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {search && !hasResults ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
              Nenhuma tabela corresponde à busca.
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <ViewerDetail database={database} sources={project.data.sources} selection={selection} />
            </div>
          )}
          <StatusBar database={project.data.database} />
        </main>
      </div>
    </div>
  )
}
