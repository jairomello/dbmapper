import type { ApiErrorPayload } from '@dbmapper/contracts'

export interface ApiErrorDetails {
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly details?: ApiErrorDetails

  constructor(
    status: number,
    code: string,
    message: string,
    options: { retryable?: boolean; details?: ApiErrorDetails } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!isRecord(value) || !isRecord(value.error)) return false
  return typeof value.error.code === 'string' && typeof value.error.message === 'string'
}

export function apiErrorFromEnvelope(status: number, payload: unknown): ApiError {
  if (isApiErrorPayload(payload)) {
    return new ApiError(status, payload.error.code, payload.error.message, {
      retryable: payload.error.retryable,
      details: payload.error.details,
    })
  }

  return new ApiError(status, 'UNKNOWN_ERROR', 'Não foi possível concluir a requisição.')
}

function parseBody(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  })

  const text = await response.text()
  const body = parseBody(text)

  if (!response.ok) {
    throw apiErrorFromEnvelope(response.status, body)
  }

  return body as T
}

export function jsonRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
