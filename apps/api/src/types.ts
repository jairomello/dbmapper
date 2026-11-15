import type { JwtPayload } from '@dbmapper/contracts'

export type AppEnv = {
  Variables: {
    user: JwtPayload
  }
}
