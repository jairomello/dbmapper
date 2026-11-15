import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen } from '../test/setup'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

describe('guarda de sessão', () => {
  test('sem sessão redireciona para o login', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') return errorResponse('UNAUTHORIZED', 'Sessão inválida.', 401)
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])

    expect(await screen.findByLabelText('E-mail')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
  })

  test('logout encerra a sessão e volta para o login', async () => {
    let loggedIn = true

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/me') {
          return loggedIn ? jsonResponse(sampleUser) : errorResponse('UNAUTHORIZED', 'Sessão inválida.', 401)
        }
        if (url === '/api/auth/logout') {
          loggedIn = false
          return jsonResponse({ status: 'ok' })
        }
        if (url === '/api/projects') return jsonResponse([])
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/'])

    const logout = await screen.findByRole('button', { name: 'Sair' })
    fireEvent.click(logout)

    expect(await screen.findByLabelText('E-mail')).toBeTruthy()
    expect(loggedIn).toBe(false)
  })
})
