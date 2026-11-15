export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        retryable: options.retryable ?? false,
        ...(options.details ? { details: options.details } : {}),
      },
    },
    status,
  )
}

export type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>

export function installFetch(handler: FetchHandler): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return Promise.resolve(handler(url, init))
  }) as typeof fetch

  return () => {
    globalThis.fetch = original
  }
}

export async function readJsonBody<T>(init: RequestInit | undefined): Promise<T> {
  if (typeof init?.body !== 'string') throw new Error('Requisição sem corpo JSON.')
  return JSON.parse(init.body) as T
}
