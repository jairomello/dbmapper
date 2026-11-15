import { jsonRequest, request } from './client'
import type { AuthUser, LoginInput } from './types'

export const authApi = {
  login(input: LoginInput): Promise<AuthUser> {
    return jsonRequest<AuthUser>('/api/auth/login', 'POST', input)
  },
  me(): Promise<AuthUser> {
    return request<AuthUser>('/api/auth/me')
  },
  logout(): Promise<{ status: string }> {
    return jsonRequest<{ status: string }>('/api/auth/logout', 'POST')
  },
}
