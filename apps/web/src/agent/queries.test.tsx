import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '../test/setup'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { renderWithClient } from '../test/render'
import { useAgentJob, usePendingSuggestions } from './queries'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function PendingHarness({ projectId }: { projectId: string }) {
  const pending = usePendingSuggestions(projectId)
  if (pending.isLoading) return <p>carregando</p>
  if (pending.isError) return <p role="alert">erro na lista</p>
  return <p data-testid="pending-count">{pending.data?.suggestions.length ?? 0}</p>
}

function JobHarness({ projectId, jobId }: { projectId: string; jobId: string }) {
  const job = useAgentJob(projectId, jobId)
  return <p data-testid="job-status">{job.data?.job.status ?? 'none'}</p>
}

describe('hooks do agente', () => {
  test('lista pendentes resolve vazia', async () => {
    restoreCallbacks.push(installFetch(() => jsonResponse({ suggestions: [] })))

    renderWithClient(<PendingHarness projectId="projeto-1" />)
    expect(await screen.findByTestId('pending-count')).toBeTruthy()
    expect(screen.getByTestId('pending-count').textContent).toBe('0')
  })

  test('lista pendentes expõe erro', async () => {
    restoreCallbacks.push(installFetch(() => errorResponse('INTERNAL_ERROR', 'Falha ao listar.', 500)))

    renderWithClient(<PendingHarness projectId="projeto-1" />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('erro na lista')
  })

  test('faz polling do job enquanto queued e para ao concluir', async () => {
    let calls = 0

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects/projeto-1/agent/jobs/job-1') {
          calls += 1
          return jsonResponse({
            job: {
              id: 'job-1',
              projectId: 'projeto-1',
              scope: 'project',
              tableId: null,
              status: calls === 1 ? 'queued' : 'succeeded',
              attempts: 0,
              requestedBy: 'user-1',
              error: null,
              stats: {},
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderWithClient(<JobHarness projectId="projeto-1" jobId="job-1" />)

    expect(await screen.findByText('queued')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('job-status').textContent).toBe('succeeded'), {
      timeout: 8000,
    })
    expect(calls).toBeGreaterThanOrEqual(2)

    const settledCalls = calls
    await new Promise((resolve) => setTimeout(resolve, 2200))
    expect(calls).toBe(settledCalls)
  }, 15000)
})
