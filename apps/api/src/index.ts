import { createApp } from './app'
import { createRuntimePersistence } from './persistence/runtime'

export const MAX_REQUEST_BODY_BYTES = 128 * 1024 * 1024

export const app = createApp(createRuntimePersistence())

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000)
  Bun.serve({ port, fetch: app.fetch, maxRequestBodySize: MAX_REQUEST_BODY_BYTES })
  console.log(`DBMapper API listening on http://localhost:${port}`)
}
