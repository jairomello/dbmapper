import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import type { ProjectSummary } from '../api/types'
import { SESSION_QUERY_KEY, useSession } from '../auth/session'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { RenameProjectDialog } from '../components/RenameProjectDialog'
import { PROJECTS_QUERY_KEY, useProjects } from '../projects/queries'

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'data desconhecida'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ProjectCard({
  project,
  canRename,
  onRename,
}: {
  project: ProjectSummary
  canRename: boolean
  onRename: (project: ProjectSummary) => void
}) {
  return (
    <article
      className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
      data-testid={`project-card-${project.id}`}
    >
      <Link
        to={`/project/${encodeURIComponent(project.id)}`}
        className="group flex flex-1 flex-col gap-2"
        aria-label={`Abrir projeto ${project.name}`}
      >
        <h3 className="text-base font-semibold text-ink group-hover:text-accent">{project.name}</h3>
        <p className="line-clamp-2 text-sm text-slate-600">{project.description || 'Sem descrição.'}</p>
        <time className="mt-auto text-xs text-slate-500" dateTime={project.updatedAt}>
          Atualizado em {formatUpdatedAt(project.updatedAt)}
        </time>
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <Link
          to={`/viewer/${encodeURIComponent(project.id)}`}
          className="inline-flex w-fit items-center rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          aria-label={`Abrir visualização do projeto ${project.name}`}
          data-testid={`viewer-link-${project.id}`}
        >
          Abrir visualização
        </Link>
        {canRename ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-ink"
            aria-label={`Renomear projeto ${project.name}`}
            title="Renomear projeto"
            data-testid={`rename-project-${project.id}`}
            onClick={() => onRename(project)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </article>
  )
}

export function GalleryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()
  const projects = useProjects()
  const [isCreating, setIsCreating] = useState(false)
  const [renamingProject, setRenamingProject] = useState<ProjectSummary | null>(null)
  const canRename = session.data?.role === 'MEMBER' || session.data?.role === 'ADMIN'

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY })
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  const hasProjects = (projects.data?.length ?? 0) > 0

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-header px-4 py-3 text-header-ink">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" width={24} height={24} className="h-6 w-6" />
          <span className="text-sm font-semibold tracking-wide">DBMapper</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/70">
            Semantic Layer
          </span>
        </div>

        <button
          type="button"
          className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600"
          onClick={() => setIsCreating(true)}
        >
          Novo projeto
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-white/70">
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

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-ink">Seus projetos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Escolha um projeto para documentar ou crie um novo a partir de um arquivo SQL ou JSON.
          </p>
        </div>

        {projects.isLoading ? <p className="text-sm text-slate-500">Carregando projetos…</p> : null}

        {projects.isError ? (
          <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            Não foi possível carregar os projetos.
          </p>
        ) : null}

        {!projects.isLoading && !projects.isError && !hasProjects ? (
          <section className="rounded-lg border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-ink">Nenhum projeto ainda</h2>
            <p className="mt-1 text-sm text-slate-500">
              Crie seu primeiro dicionário importando um dump SQL ou um JSON exportado do DBMapper.
            </p>
            <button
              type="button"
              className="mt-4 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              onClick={() => setIsCreating(true)}
            >
              Novo projeto
            </button>
          </section>
        ) : null}

        {hasProjects ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Projetos">
            {projects.data?.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                canRename={canRename}
                onRename={setRenamingProject}
              />
            ))}
          </section>
        ) : null}
      </main>

      {isCreating ? (
        <NewProjectDialog
          onClose={() => setIsCreating(false)}
          onCreated={(project) => {
            setIsCreating(false)
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
            navigate(`/project/${encodeURIComponent(project.id)}`)
          }}
        />
      ) : null}

      {renamingProject ? (
        <RenameProjectDialog
          project={renamingProject}
          onClose={() => setRenamingProject(null)}
          onRenamed={(renamed) => {
            setRenamingProject(null)
            queryClient.setQueryData<ProjectSummary[]>(PROJECTS_QUERY_KEY, (current) =>
              current?.map((project) => (project.id === renamed.id ? { ...project, ...renamed } : project)),
            )
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
          }}
        />
      ) : null}
    </div>
  )
}
