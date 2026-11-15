import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor } from '../test/setup'
import { errorResponse, installFetch, jsonResponse } from '../test/fetch'
import { sampleUser } from '../test/fixtures'
import { renderApp } from '../test/render'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function submitLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginPage', () => {
  test('faz login e cai na galeria de projetos', async () => {
    let loginPayload: unknown

    restoreCallbacks.push(
      installFetch((url, init) => {
        if (url === '/api/auth/login' && init?.method === 'POST') {
          loginPayload = JSON.parse(String(init.body))
          return jsonResponse(sampleUser)
        }
        if (url === '/api/auth/me') return jsonResponse(sampleUser)
        if (url === '/api/projects') return jsonResponse([])
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/login'])
    submitLogin(sampleUser.email, 'tester-password')

    expect(await screen.findByRole('heading', { name: 'Seus projetos' })).toBeTruthy()
    expect(await screen.findByText('Nenhum projeto ainda')).toBeTruthy()
    expect(loginPayload).toEqual({ email: sampleUser.email, password: 'tester-password' })
  })

  test('mostra a mesma mensagem genérica para email desconhecido e senha errada', async () => {
    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/auth/login') {
          return errorResponse('INVALID_CREDENTIALS', 'Credenciais inválidas.', 401)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    renderApp(['/login'])
    submitLogin('ninguem@example.com', 'qualquer-senha')

    const firstAlert = await screen.findByRole('alert')
    const firstMessage = firstAlert.textContent
    expect(firstMessage).toBe('E-mail ou senha inválidos.')
    expect(firstMessage).not.toMatch(/desconhecid|senha errada|não existe/i)

    submitLogin(sampleUser.email, 'senha-errada')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(firstMessage))
  })
})
