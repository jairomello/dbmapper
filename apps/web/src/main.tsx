import '@xyflow/react/dist/style.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { initTheme } from './theme/theme'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Elemento #root não encontrado')
}

initTheme()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
