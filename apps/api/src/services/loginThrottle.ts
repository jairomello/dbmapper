import type { LoginAttemptRepository } from '../persistence/ports'

export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_MS = 15 * 60 * 1000

export interface LoginThrottleOptions {
  maxFailures?: number
  windowMs?: number
}

export interface ThrottleStatus {
  blocked: boolean
  retryAfterSeconds: number
}

export class LoginThrottle {
  private readonly repository: LoginAttemptRepository
  private readonly maxFailures: number
  private readonly windowMs: number

  constructor(repository: LoginAttemptRepository, options: LoginThrottleOptions = {}) {
    this.repository = repository
    this.maxFailures = options.maxFailures ?? LOGIN_MAX_FAILURES
    this.windowMs = options.windowMs ?? LOGIN_WINDOW_MS
  }

  status(identity: string, now: number = Date.now()): ThrottleStatus {
    const windowStart = new Date(now - this.windowMs).toISOString()
    this.repository.pruneBefore(windowStart)

    const failures = this.repository.listSince(identity, windowStart)
    if (failures.length < this.maxFailures) {
      return { blocked: false, retryAfterSeconds: 0 }
    }

    const oldest = Date.parse(failures[0])
    if (Number.isNaN(oldest)) {
      return { blocked: true, retryAfterSeconds: Math.ceil(this.windowMs / 1000) }
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
    return { blocked: true, retryAfterSeconds }
  }

  recordFailure(identity: string, ip: string, now: number = Date.now()): void {
    this.repository.record(identity, ip, new Date(now).toISOString())
  }

  recordSuccess(identity: string): void {
    this.repository.clear(identity)
  }
}

export function createLoginThrottle(
  repository: LoginAttemptRepository,
  options: LoginThrottleOptions = {},
): LoginThrottle {
  return new LoginThrottle(repository, options)
}
