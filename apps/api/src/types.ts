import type { JwtPayload } from '@dbmapper/contracts'
import type { ApiKeyRecord } from './persistence/ports'

export type CredentialKind = 'session' | 'api_key'

export type AppEnv = {
  Variables: {
    user: JwtPayload
    credential: CredentialKind
    apiKey: ApiKeyRecord | null
  }
}
