import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { eventsApi } from '../api/events'
import type { AuditEvent } from '../api/types'
import { useSession } from '../auth/session'

const ACTION_FAMILIES = [
  { value: '', label: 'Todas as ações' },
  { value: 'project.', label: 'Projetos' },
  { value: 'model.', label: 'Modelo' },
  { value: 'diagram.', label: 'Diagrama' },
  { value: 'user.', label: 'Usuários' },
  { value: 'item.', label: 'Itens' },
  { value: 'agent.', label: 'Agente IA' },
  { value: 'api_key.', label: 'Chaves de API' },
] as const

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'data desconhecida'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

function subjectLabel(event: AuditEvent): string {
  return `${event.subjectType} · ${event.subjectId}`
}

export function AuditPage() {
  const session = useSession()
  const [family, setFamily] = useState('')

  const events = useQuery({
    queryKey: ['events', family],
    queryFn: () => eventsApi.list({ action: family || undefined }),
  })

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-ink px-4 py-3 text-white">
        <Link
          to="/"
          className="rounded-sm border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Projetos
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide">DBMapper</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-300">
            Auditoria
          </span>
        </div>

        <span className="ml-auto text-xs text-slate-300">{session.data?.email}</span>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Eventos de auditoria</h1>
            <p className="mt-1 text-sm text-slate-500">
              Registro append-only das mutações do dicionário, mais recentes primeiro.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            Família
            <select
              aria-label="Família de ação"
              className="rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              value={family}
              onChange={(event) => setFamily(event.target.value)}
            >
              {ACTION_FAMILIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {events.isLoading ? <p className="text-sm text-slate-500">Carregando eventos…</p> : null}

        {events.isError ? (
          <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            Não foi possível carregar os eventos de auditoria.
          </p>
        ) : null}

        {!events.isLoading && !events.isError && (events.data?.events.length ?? 0) === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Nenhum evento registrado para este filtro.
          </p>
        ) : null}

        {(events.data?.events.length ?? 0) > 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Ator</th>
                  <th className="px-4 py-2 font-medium">Ação</th>
                  <th className="px-4 py-2 font-medium">Assunto</th>
                  <th className="px-4 py-2 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {events.data?.events.map((event) => (
                  <tr key={event.id} className="border-t border-slate-100" data-testid={`audit-row-${event.id}`}>
                    <td className="px-4 py-2 text-slate-700">{event.actorEmail ?? 'sistema'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ink">{event.action}</td>
                    <td className="px-4 py-2 text-slate-600">{subjectLabel(event)}</td>
                    <td className="px-4 py-2 text-slate-500">
                      <time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </main>
    </div>
  )
}
