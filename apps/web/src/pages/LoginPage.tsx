import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { SESSION_QUERY_KEY } from '../auth/session'

const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos.'
const UNEXPECTED_LOGIN_ERROR = 'Não foi possível entrar. Tente novamente.'

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, user)
      navigate('/', { replace: true })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setErrorMessage(GENERIC_LOGIN_ERROR)
        return
      }
      setErrorMessage(UNEXPECTED_LOGIN_ERROR)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    login.mutate({ email, password })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-md">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">DBMapper</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Entrar no dicionário</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse o workspace semântico do seu projeto.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            E-mail
            <input
              className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              type="email"
              name="email"
              autoComplete="email"
              defaultValue=""
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Senha
            <input
              className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              type="password"
              name="password"
              autoComplete="current-password"
              defaultValue=""
              required
            />
          </label>

          {errorMessage ? (
            <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="w-full rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={login.isPending}
          >
            {login.isPending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
