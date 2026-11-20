import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = `http://localhost:${process.env.PORT ?? 3000}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['html-to-image'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
})
