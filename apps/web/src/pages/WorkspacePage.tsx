import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { projectsApi } from '../api/projects'
import type { ProjectView } from '../api/types'
import { SESSION_QUERY_KEY, useSession } from '../auth/session'
import { JsonTransfer } from '../components/JsonTransfer'
import { MetadataEditor } from '../components/MetadataEditor'
import { SemanticTree } from '../components/SemanticTree'
import { SqlProjectCreator } from '../components/SqlProjectCreator'
import { StatusBar } from '../components/StatusBar'
import { UpdateWizard } from '../components/UpdateWizard'
import type { Selection } from '../lib/selection'

const PROJECTS_QUERY_KEY = ['projects'] as const
const projectQueryKey = (id: string) => ['project', id] as const

export function WorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({ type: 'database' })
  const [isCreating, setIsCreating] = useState(false)
  const [isSqlCreating, setIsSqlCreating] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const projects = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => projectsApi.list(),
  })

  useEffect(() => {
    if (selectedId) {
      const stillExists = projects.data?.some((project) => project.id === selectedId)
      if (stillExists) return
    }
    const first = projects.data?.[0]
    if (first) {
      setSelectedId(first.id)
      setSelection({ type: 'database' })
    }
  }, [projects.data, selectedId])

  const project = useQuery({
    queryKey: projectQueryKey(selectedId ?? ''),
    queryFn: () => projectsApi.get(selectedId ?? ''),
    enabled: Boolean(selectedId),
  })

  const saveProject = useMutation({
    mutationFn: (database: Parameters<typeof projectsApi.save>[1]) => {
      if (!selectedId) throw new Error('Nenhum projeto selecionado.')
      return projectsApi.save(selectedId, database)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(projectQueryKey(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })

  const createProject = useMutation({
    mutationFn: (name: string) => projectsApi.create({ name }),
    onSuccess: (created) => {
      queryClient.setQueryData(projectQueryKey(created.id), created)
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      setSelectedId(created.id)
      setSelection({ type: 'database' })
      setIsCreating(false)
      setCreateError(null)
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : 'Não foi possível criar o projeto.')
    },
  })

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY })
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  function adoptProject(project: ProjectView) {
    queryClient.setQueryData(projectQueryKey(project.id), project)
    queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    setSelectedId(project.id)
    setSelection({ type: 'database' })
    setIsCreating(false)
    setIsSqlCreating(false)
    setCreateError(null)
  }

  function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    setCreateError(null)
    createProject.mutate(name)
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide">DBMapper</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-300">
            Semantic Layer
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Projeto
            <select
              className="min-w-48 rounded-sm border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
              value={selectedId ?? ''}
              onChange={(event) => {
                setSelectedId(event.target.value || null)
                setSelection({ type: 'database' })
              }}
              disabled={projects.data?.length === 0}
            >
              {!projects.data || projects.data.length === 0 ? <option value="">Nenhum projeto</option> : null}
              {projects.data?.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => {
              setIsCreating((current) => !current)
              setIsSqlCreating(false)
            }}
          >
            Novo projeto
          </button>

          <button
            type="button"
            className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => {
              setIsSqlCreating((current) => !current)
              setIsCreating(false)
            }}
          >
            Novo projeto a partir de SQL
          </button>

          <button
            type="button"
            className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => setIsWizardOpen(true)}
            disabled={!project.data}
          >
            Atualizar modelo
          </button>

          {selectedId && project.data ? (
            <JsonTransfer projectId={selectedId} onImported={adoptProject} />
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-slate-300">
          <span>{session.data?.email}</span>
          <button
            type="button"
            className="rounded-sm border border-slate-600 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sair
          </button>
        </div>
      </header>

      {isCreating ? (
        <form
          className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-4 py-3"
          onSubmit={handleCreateProject}
        >
          <label className="block text-xs font-medium text-slate-700">
            Nome do novo projeto
            <input
              className="mt-1 block w-64 rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
              name="name"
              defaultValue=""
              required
            />
          </label>
          <button
            type="submit"
            className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
            disabled={createProject.isPending}
          >
            Criar projeto
          </button>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => setIsCreating(false)}
          >
            Cancelar
          </button>
          {createError ? (
            <p className="text-xs text-red-700" role="alert">
              {createError}
            </p>
          ) : null}
        </form>
      ) : null}

      {isSqlCreating ? (
        <SqlProjectCreator onCreated={adoptProject} onCancel={() => setIsSqlCreating(false)} />
      ) : null}

      {projects.isError ? (
        <p className="m-4 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          Não foi possível carregar os projetos.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-hidden border-r border-slate-200 bg-white">
          {project.data ? (
            <SemanticTree database={project.data.database} selection={selection} onSelect={setSelection} />
          ) : (
            <div className="p-4 text-sm text-slate-500">
              {projects.isLoading || project.isLoading ? 'Carregando projetos…' : 'Nenhum projeto selecionado.'}
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {project.data ? (
            <>
              <div className="min-h-0 flex-1">
                <MetadataEditor
                  database={project.data.database}
                  selection={selection}
                  onSave={saveProject.mutateAsync}
                  isSaving={saveProject.isPending}
                />
              </div>
              <StatusBar database={project.data.database} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
              Crie ou selecione um projeto para começar a documentar.
            </div>
          )}
        </main>
      </div>

      {isWizardOpen && project.data ? (
        <UpdateWizard
          projectId={project.data.id}
          onClose={() => setIsWizardOpen(false)}
          onApplied={(applied) => {
            queryClient.setQueryData(projectQueryKey(applied.id), applied)
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
          }}
        />
      ) : null}
    </div>
  )
}
