import { describe, expect, test } from 'bun:test'
import type { LoginAttemptRepository } from '../persistence/ports'
import { createLoginThrottle, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS } from '../services/loginThrottle'

class MemoryLoginAttempts implements LoginAttemptRepository {
  readonly rows: Array<{ identity: string; ip: string; attemptedAt: string }> = []

  record(identity: string, ip: string, attemptedAt: string): void {
    this.rows.push({ identity, ip, attemptedAt })
  }

  listSince(identity: string, since: string): string[] {
    return this.rows
      .filter((row) => row.identity === identity && row.attemptedAt >= since)
      .map((row) => row.attemptedAt)
      .sort()
  }

  pruneBefore(before: string): void {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index].attemptedAt < before) this.rows.splice(index, 1)
    }
  }

  clear(identity: string): void {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index].identity === identity) this.rows.splice(index, 1)
    }
  }
}

describe('loginThrottle', () => {
  test('bloqueia após 5 falhas na janela e informa Retry-After', () => {
    const repository = new MemoryLoginAttempts()
    const throttle = createLoginThrottle(repository)
    const now = Date.parse('2026-11-14T12:00:00.000Z')

    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
      expect(throttle.status('user@example.com', now).blocked).toBe(false)
      throttle.recordFailure('user@example.com', '127.0.0.1', now)
    }

    const blocked = throttle.status('user@example.com', now)
    expect(blocked.blocked).toBe(true)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_WINDOW_MS / 1000)
  })

  test('sucesso limpa as falhas da identidade', () => {
    const repository = new MemoryLoginAttempts()
    const throttle = createLoginThrottle(repository)
    const now = Date.parse('2026-11-14T12:00:00.000Z')

    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
      throttle.recordFailure('user@example.com', '127.0.0.1', now)
    }
    expect(throttle.status('user@example.com', now).blocked).toBe(true)

    throttle.recordSuccess('user@example.com')
    expect(throttle.status('user@example.com', now).blocked).toBe(false)
    expect(repository.rows).toEqual([])
  })

  test('identidades independentes não compartilham contador', () => {
    const repository = new MemoryLoginAttempts()
    const throttle = createLoginThrottle(repository)
    const now = Date.parse('2026-11-14T12:00:00.000Z')

    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
      throttle.recordFailure('a@example.com', '127.0.0.1', now)
    }

    expect(throttle.status('a@example.com', now).blocked).toBe(true)
    expect(throttle.status('b@example.com', now).blocked).toBe(false)
  })

  test('falhas fora da janela expiram e são podadas', () => {
    const repository = new MemoryLoginAttempts()
    const throttle = createLoginThrottle(repository)
    const now = Date.parse('2026-11-14T12:00:00.000Z')

    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
      throttle.recordFailure('user@example.com', '127.0.0.1', now)
    }

    const afterWindow = now + LOGIN_WINDOW_MS + 1
    expect(throttle.status('user@example.com', afterWindow).blocked).toBe(false)
    expect(repository.rows).toEqual([])
  })
})
