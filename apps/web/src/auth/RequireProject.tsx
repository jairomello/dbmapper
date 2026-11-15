import { Link, Navigate, Outlet, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useProject } from '../projects/queries'

export function RequireProject() {
  const { id } = useParams<{ id: string }>()
  const project = useProject(id ?? '')

  if (!id) return <Navigate to="/" replace />

  if (project.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg text-sm text-slate-500">
        Carregando projeto…
      </main>
    )
  }

  if (project.isError) {
    if (project.error instanceof ApiError && project.error.status === 404) {
      return <Navigate to="/" replace />
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-sm text-slate-600">
        <p role="alert">Não foi possível carregar o projeto.</p>
        <Link className="text-accent underline" to="/">
          Voltar para a galeria
        </Link>
      </main>
    )
  }

  if (!project.data) return <Navigate to="/" replace />

  return <Outlet />
}
