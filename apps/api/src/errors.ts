import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorDetails = Record<string, unknown>

export class ApiError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  readonly retryable: boolean
  readonly details?: ErrorDetails

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    options: { retryable?: boolean; details?: ErrorDetails } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }
}

export function errorEnvelope(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    },
  }
}

export function errorHandler(error: Error, c: Context) {
  if (error instanceof ApiError) {
    return c.json(errorEnvelope(error), error.status)
  }

  console.error('Unexpected API error', error)
  return c.json(
    errorEnvelope(
      new ApiError(500, 'INTERNAL_ERROR', 'Erro interno do servidor. Tente novamente mais tarde.', {
        retryable: true,
      }),
    ),
    500,
  )
}

export function notFoundHandler(c: Context) {
  return c.json(errorEnvelope(new ApiError(404, 'NOT_FOUND', 'Recurso não encontrado.')), 404)
}
