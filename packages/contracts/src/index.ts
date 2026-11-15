export interface ApiErrorPayload {
  error: {
    code: string
    message: string
    retryable: boolean
    details?: Record<string, unknown>
  }
}

export interface JwtPayload {
  sub: string
  email: string
  role: 'ADMIN' | 'MEMBER' | 'VIEWER'
  iat?: number
  exp?: number
}

export interface HealthResponse {
  status: 'ok'
}
