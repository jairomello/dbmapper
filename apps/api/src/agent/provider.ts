import OpenAI from 'openai'

export interface ModelProviderInput {
  prompt: string
  system: string
  signal?: AbortSignal
}

export interface ModelProvider {
  readonly name: string
  complete(input: ModelProviderInput): Promise<string>
}

export const LLM_PROVIDER_NAMES = ['openai', 'openrouter', 'fake'] as const
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number]

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini'
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const PROVIDER_TIMEOUT_MS = 60_000
export const PROVIDER_MAX_RETRIES = 1

export interface ModelProviderConfig {
  provider: LlmProviderName
  apiKey: string
  model: string
  baseURL?: string
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function openAICompatibleConfig(
  provider: 'openai' | 'openrouter',
  apiKey: string,
  env: Record<string, string | undefined>,
): ModelProviderConfig {
  if (provider === 'openrouter') {
    return {
      provider,
      apiKey,
      model: normalize(env.OPENROUTER_MODEL) ?? DEFAULT_OPENROUTER_MODEL,
      baseURL: OPENROUTER_BASE_URL,
    }
  }

  return {
    provider,
    apiKey,
    model: normalize(env.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL,
  }
}

export function resolveProviderConfig(env: Record<string, string | undefined> = process.env): ModelProviderConfig | null {
  const selected = normalize(env.DBMAPPER_LLM_PROVIDER)?.toLowerCase()

  if (selected === 'fake') {
    return { provider: 'fake', apiKey: 'fake', model: 'fake' }
  }

  const openaiKey = normalize(env.OPENAI_API_KEY)
  const openrouterKey = normalize(env.OPENROUTER_API_KEY)

  if (selected === 'openai') return openaiKey ? openAICompatibleConfig('openai', openaiKey, env) : null
  if (selected === 'openrouter') return openrouterKey ? openAICompatibleConfig('openrouter', openrouterKey, env) : null
  if (selected) return null

  if (openaiKey) return openAICompatibleConfig('openai', openaiKey, env)
  if (openrouterKey) return openAICompatibleConfig('openrouter', openrouterKey, env)
  return null
}

function safeProviderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number') return `Falha ao consultar o provider de LLM (HTTP ${status}).`
    if (/timeout/i.test(error.name) || error.name === 'AbortError') {
      return 'O provider de LLM excedeu o tempo limite.'
    }
  }
  return 'Falha ao consultar o provider de LLM.'
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: string
  private readonly client: OpenAI
  private readonly model: string

  constructor(config: ModelProviderConfig) {
    this.name = config.provider
    this.model = config.model
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: PROVIDER_TIMEOUT_MS,
      maxRetries: PROVIDER_MAX_RETRIES,
    })
  }

  async complete(input: ModelProviderInput): Promise<string> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.prompt },
          ],
        },
        { signal: input.signal },
      )

      const content = response.choices[0]?.message?.content
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new ProviderError('O provider de LLM retornou uma resposta vazia.')
      }
      return content
    } catch (error) {
      if (error instanceof ProviderError) throw error
      throw new ProviderError(safeProviderErrorMessage(error))
    }
  }
}

interface FakePromptTarget {
  type?: unknown
  name?: unknown
  columnType?: unknown
}

interface FakePromptPayload {
  table?: { name?: unknown }
  targets?: unknown
}

function parseFakePrompt(prompt: string): FakePromptPayload | null {
  try {
    const parsed: unknown = JSON.parse(prompt)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as FakePromptPayload
  } catch {
    return null
  }
}

function fakeDescription(target: FakePromptTarget, tableName: string): string {
  const name = typeof target.name === 'string' ? target.name : 'item'
  if (target.type === 'table') return `Tabela ${name} do modelo de dados.`
  const columnType = typeof target.columnType === 'string' && target.columnType.length > 0 ? target.columnType : null
  return columnType
    ? `Campo ${name} (${columnType}) da tabela ${tableName}.`
    : `Campo ${name} da tabela ${tableName}.`
}

export function createFakeProvider(): ModelProvider {
  return {
    name: 'fake',
    async complete(input: ModelProviderInput): Promise<string> {
      const payload = parseFakePrompt(input.prompt)
      const tableName = typeof payload?.table?.name === 'string' ? payload.table.name : 'tabela'
      const targets = Array.isArray(payload?.targets) ? (payload.targets as FakePromptTarget[]) : []
      const suggestions = targets.map((target) => ({
        item: typeof target.name === 'string' ? target.name : '',
        description: fakeDescription(target, tableName),
      }))
      return JSON.stringify({ suggestions })
    },
  }
}

export function createModelProvider(env: Record<string, string | undefined> = process.env): ModelProvider | null {
  const config = resolveProviderConfig(env)
  if (!config) return null
  if (config.provider === 'fake') return createFakeProvider()
  return new OpenAICompatibleProvider(config)
}
