import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from './session'

export function RequireSession() {
  const session = useSession()

  if (session.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg text-sm text-slate-500">
        Carregando sessão…
      </main>
    )
  }

  if (session.isError || !session.data) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
