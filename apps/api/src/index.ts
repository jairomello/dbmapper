import { Hono } from 'hono'

export const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000)
  Bun.serve({ port, fetch: app.fetch })
  console.log(`DBMapper API listening on http://localhost:${port}`)
}
