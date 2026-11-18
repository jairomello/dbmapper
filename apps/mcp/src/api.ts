export interface ApiClientConfig {
  baseUrl: string
  apiKey: string
  projectId?: string
}

export type ConfigResolution =
  | { ok: true; config: ApiClientConfig }
  | { ok: false; message: string }

export const CONFIG_ERROR_MESSAGE =
  'Configuração ausente: defina DBMAPPER_API_KEY e DBMAPPER_URL para conectar o DBMapper MCP.'

export function resolveConfig(env: Record<string, string | undefined> = process.env): ConfigResolution {
  const apiKey = env.DBMAPPER_API_KEY?.trim()
  const rawUrl = env.DBMAPPER_URL?.trim()

  if (!apiKey || !rawUrl) {
    return { ok: false, message: CONFIG_ERROR_MESSAGE }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return { ok: false, message: 'DBMAPPER_URL inválida: informe uma URL HTTP(S) da API do DBMapper.' }
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, message: 'DBMAPPER_URL inválida: informe uma URL HTTP(S) da API do DBMapper.' }
  }

  const projectId = env.DBMAPPER_PROJECT_ID?.trim()

  return {
    ok: true,
    config: {
      baseUrl: rawUrl.replace(/\/+$/, ''),
      apiKey,
      projectId: projectId && projectId.length > 0 ? projectId : undefined,
    },
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean

  constructor(status: number, code: string, message: string, retryable = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

interface ErrorEnvelope {
  error?: {
    code?: unknown
    message?: unknown
    retryable?: unknown
  }
}

function envelopeError(status: number, parsed: unknown): ApiError {
  if (parsed !== null && typeof parsed === 'object') {
    const envelope = parsed as ErrorEnvelope
    const code = envelope.error?.code
    const message = envelope.error?.message
    if (typeof code === 'string' && typeof message === 'string') {
      return new ApiError(status, code, message, envelope.error?.retryable === true)
    }
  }
  return new ApiError(status, 'API_ERROR', 'A API do DBMapper respondeu com um erro inesperado.')
}

export class ApiClient {
  private readonly config: ApiClientConfig

  constructor(config: ApiClientConfig) {
    this.config = config
  }

  get defaultProjectId(): string | undefined {
    return this.config.projectId
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.apiKey}`,
      accept: 'application/json',
    }
    if (body !== undefined) headers['content-type'] = 'application/json'

    let response: Response
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(502, 'NETWORK_ERROR', 'Não foi possível conectar à API do DBMapper.', true)
    }

    const text = await response.text()
    let parsed: unknown
    let hasJson = false
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
        hasJson = true
      } catch {
        hasJson = false
      }
    }

    if (!response.ok) {
      throw envelopeError(response.status, hasJson ? parsed : null)
    }

    if (!hasJson) {
      throw new ApiError(502, 'INVALID_RESPONSE', 'A API do DBMapper retornou uma resposta inválida.')
    }

    return parsed as T
  }
}
