import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireProject } from './auth/RequireProject'
import { RequireSession } from './auth/RequireSession'
import { createQueryClient } from './app/queryClient'
import { GalleryPage } from './pages/GalleryPage'
import { LoginPage } from './pages/LoginPage'
import { WorkspacePage } from './pages/WorkspacePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/project/:id" element={<RequireProject />}>
          <Route index element={<WorkspacePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
