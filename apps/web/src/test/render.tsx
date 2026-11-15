import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../App'
import { render } from './setup'

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithClient(ui: ReactElement) {
  const queryClient = testQueryClient()

  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

  return { ...view, queryClient }
}

export function renderApp(initialEntries: string[] = ['/']) {
  const queryClient = testQueryClient()

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...view, queryClient }
}
