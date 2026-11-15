import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { authApi } from '../api/auth'
import { projectsApi } from '../api/projects'
import type { DatabaseModel } from '@dbmapper/domain'
import { SESSION_QUERY_KEY, useSession } from '../auth/session'
import { JsonTransfer } from '../components/JsonTransfer'
import { MetadataEditor } from '../components/MetadataEditor'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { SemanticTree } from '../components/SemanticTree'
import { StatusBar } from '../components/StatusBar'
import { UpdateWizard } from '../components/UpdateWizard'
import type { Selection } from '../lib/selection'
import { PROJECTS_QUERY_KEY, projectQueryKey, useProject } from '../projects/queries'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()
  const projectId = id ?? ''
  const project = useProject(projectId)

  const [selection, setSelection] = useState<Selection>({ type: 'database' })
  const [isCreating, setIsCreating] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)

  const saveProject = useMutation({
    mutationFn: (database: DatabaseModel) => {
      if (!projectId) throw new Error('Nenhum projeto selecionado.')
      return projectsApi.save(projectId, database)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(projectQueryKey(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
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

  function adoptProject(createdId: string) {
    queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    setSelection({ type: 'database' })
    navigate(`/project/${encodeURIComponent(createdId)}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-ink px-4 py-3 text-white">
        <Link to="/" className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
          Projetos
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide">DBMapper</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-300">
            {project.data?.name ?? 'Semantic Layer'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => setIsCreating(true)}
          >
            Novo projeto
          </button>

          <button
            type="button"
            className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => setIsWizardOpen(true)}
            disabled={!project.data}
          >
            Atualizar modelo
          </button>

          {projectId && project.data ? (
            <JsonTransfer
              projectId={projectId}
              onImported={(imported) => {
                queryClient.setQueryData(projectQueryKey(imported.id), imported)
                adoptProject(imported.id)
              }}
            />
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

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-hidden border-r border-slate-200 bg-white">
          {project.data ? (
            <SemanticTree database={project.data.database} selection={selection} onSelect={setSelection} />
          ) : (
            <div className="p-4 text-sm text-slate-500">Carregando projeto…</div>
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
              Carregando o projeto…
            </div>
          )}
        </main>
      </div>

      {isCreating ? (
        <NewProjectDialog
          onClose={() => setIsCreating(false)}
          onCreated={(created) => {
            setIsCreating(false)
            adoptProject(created.id)
          }}
        />
      ) : null}

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
