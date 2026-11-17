import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  createFakeProvider,
  createModelProvider,
  resolveProviderConfig,
} from './provider'

describe('configuração do provider de LLM', () => {
  test('ambiente vazio não configura provider', () => {
    expect(resolveProviderConfig({})).toBeNull()
    expect(createModelProvider({})).toBeNull()
  })

  test('selector fake habilita o provider em memória', async () => {
    const provider = createModelProvider({ DBMAPPER_LLM_PROVIDER: 'fake' })
    expect(provider).not.toBeNull()
    expect(provider!.name).toBe('fake')

    const response = await provider!.complete({
      system: 'sistema',
      prompt: JSON.stringify({
        table: { name: 'pedido' },
        targets: [
          { type: 'table', name: 'pedido' },
          { type: 'column', name: 'total', columnType: 'numeric' },
        ],
      }),
    })

    expect(JSON.parse(response)).toEqual({
      suggestions: [
        { item: 'pedido', description: 'Tabela pedido do modelo de dados.' },
        { item: 'total', description: 'Campo total (numeric) da tabela pedido.' },
      ],
    })
  })

  test('OpenAI é inferido a partir da chave e usa modelo padrão', () => {
    const config = resolveProviderConfig({ OPENAI_API_KEY: 'sk-test' })
    expect(config).toEqual({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' })
  })

  test('modelo OpenAI pode ser configurado por env', () => {
    const config = resolveProviderConfig({ DBMAPPER_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-4o' })
    expect(config).toEqual({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' })
  })

  test('OpenRouter usa baseURL e modelo próprios', () => {
    const config = resolveProviderConfig({ DBMAPPER_LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'or-test' })
    expect(config).toEqual({
      provider: 'openrouter',
      apiKey: 'or-test',
      model: DEFAULT_OPENROUTER_MODEL,
      baseURL: OPENROUTER_BASE_URL,
    })
  })

  test('selector sem a chave correspondente não configura provider', () => {
    expect(resolveProviderConfig({ DBMAPPER_LLM_PROVIDER: 'openai' })).toBeNull()
    expect(resolveProviderConfig({ DBMAPPER_LLM_PROVIDER: 'openrouter', OPENAI_API_KEY: 'sk-test' })).toBeNull()
  })

  test('selector desconhecido não configura provider', () => {
    expect(resolveProviderConfig({ DBMAPPER_LLM_PROVIDER: 'desconhecido', OPENAI_API_KEY: 'sk-test' })).toBeNull()
  })

  test('fake responde apenas a partir do payload, sem rede', async () => {
    const provider = createFakeProvider()
    const response = await provider.complete({ system: 'x', prompt: 'não é json' })
    expect(JSON.parse(response)).toEqual({ suggestions: [] })
  })
})
