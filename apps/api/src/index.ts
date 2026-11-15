import { createApp } from './app'
import { createRuntimePersistence } from './persistence/runtime'

export const app = createApp(createRuntimePersistence())

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000)
  Bun.serve({ port, fetch: app.fetch })
  console.log(`DBMapper API listening on http://localhost:${port}`)
}
