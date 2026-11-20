import { afterEach, describe, expect, test } from 'bun:test'
import type { AuditEvent } from '../api/types'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'
import { cleanup, fireEvent, screen, waitFor } from '../test/setup'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

const admin = { ...sampleUser, email: 'admin@example.com', role: 'ADMIN' as const }

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'event-1',
    projectId: 'projeto-1',
    actorUserId: 'user-1',
    actorEmail: admin.email,
    action: 'project.saved',
    subjectType: 'project',
    subjectId: 'projeto-1',
    payload: { tables: 2, columns: 3 },
    createdAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('AuditPage', () => {
  test('ADMIN vê os eventos com ator, ação, assunto e data', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(admin)
        if (url === '/api/events') {
          return jsonResponse({
            events: [
              event({ id: 'event-2', action: 'user.role_changed', subjectType: 'user', subjectId: 'user-9' }),
              event(),
            ],
          })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/audit'])

    expect(await screen.findByRole('heading', { name: 'Eventos de auditoria' })).toBeTruthy()
    const row = await screen.findByTestId('audit-row-event-2')
    expect(row.textContent).toContain(admin.email)
    expect(row.textContent).toContain('user.role_changed')
    expect(row.textContent).toContain('user · user-9')
    expect(screen.getByTestId('audit-row-event-1').textContent).toContain('project.saved')
  })

  test('filtro por família envia o prefixo para a API', async () => {
    const requested: string[] = []

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(admin)
        if (url.startsWith('/api/events')) {
          requested.push(url)
          if (url.includes('action=project.')) return jsonResponse({ events: [event()] })
          return jsonResponse({ events: [event({ id: 'event-agent', action: 'agent.generate_requested' })] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/audit'])

    await screen.findByTestId('audit-row-event-agent')
    fireEvent.change(screen.getByLabelText('Família de ação'), { target: { value: 'project.' } })

    await waitFor(() => expect(requested).toContain('/api/events?action=project.'))
    expect(await screen.findByTestId('audit-row-event-1')).toBeTruthy()
    expect(screen.queryByTestId('audit-row-event-agent')).toBeNull()
  })

  test('família diagram. aparece no filtro e filtra o evento do layout', async () => {
    const requested: string[] = []

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(admin)
        if (url.startsWith('/api/events')) {
          requested.push(url)
          if (url.includes('action=diagram.')) {
            return jsonResponse({
              events: [event({ id: 'event-diagram', action: 'diagram.layout_saved' })],
            })
          }
          return jsonResponse({ events: [event({ id: 'event-project', action: 'project.saved' })] })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/audit'])

    await screen.findByTestId('audit-row-event-project')
    const select = screen.getByLabelText('Família de ação') as HTMLSelectElement
    const option = Array.from(select.options).find((candidate) => candidate.value === 'diagram.')
    expect(option).toBeTruthy()
    expect(option!.textContent).toBe('Diagrama')

    fireEvent.change(select, { target: { value: 'diagram.' } })

    await waitFor(() => expect(requested).toContain('/api/events?action=diagram.'))
    const diagramRow = await screen.findByTestId('audit-row-event-diagram')
    expect(diagramRow.textContent).toContain('diagram.layout_saved')
    expect(screen.queryByTestId('audit-row-event-project')).toBeNull()
  })

  test('mostra o estado vazio em português', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(admin)
        if (url === '/api/events') return jsonResponse({ events: [] })
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/audit'])

    expect(await screen.findByText('Nenhum evento registrado para este filtro.')).toBeTruthy()
  })

  test('MEMBER é redirecionado para a galeria', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects') return jsonResponse([])
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/audit'])

    expect(await screen.findByRole('heading', { name: 'Seus projetos' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Eventos de auditoria' })).toBeNull()
  })
})
