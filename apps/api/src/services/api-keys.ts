import { createHash, randomBytes } from 'node:crypto'
import type { ApiKeyRecord } from '../persistence/ports'

export const API_KEY_PREFIX = 'dbmp_'
export const API_KEY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(20).toString('hex')}`
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

export function displayPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_PREFIX_LENGTH)
}

export type ApiKeyStatus = 'active' | 'expired' | 'revoked'

export function apiKeyStatus(key: ApiKeyRecord, now: string = new Date().toISOString()): ApiKeyStatus {
  if (key.revokedAt) return 'revoked'
  if (key.expiresAt && key.expiresAt <= now) return 'expired'
  return 'active'
}

export interface PublicApiKey {
  id: string
  name: string
  keyPrefix: string
  projectScope: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  lastUsedAt: string | null
  status: ApiKeyStatus
}

export function publicApiKey(key: ApiKeyRecord, now: string = new Date().toISOString()): PublicApiKey {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    projectScope: key.projectScope,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    status: apiKeyStatus(key, now),
  }
}
