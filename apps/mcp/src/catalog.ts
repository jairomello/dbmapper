export const TOOL_NAMES = [
  'get_project_overview',
  'list_missing_descriptions',
  'get_table',
  'get_column',
  'set_description',
  'list_suggestions',
  'apply_suggestion',
  'reject_suggestion',
  'get_export',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export type ToolHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface JsonSchemaProperty {
  type: 'string' | 'integer' | 'boolean'
  description?: string
  enum?: readonly string[]
  minLength?: number
  maxLength?: number
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: readonly string[]
  additionalProperties: boolean
}

export interface ToolDispatch {
  method: ToolHttpMethod
  path: string
}

export interface ToolDefinition {
  name: ToolName
  description: string
  inputSchema: ToolInputSchema
  docSection: string
  dispatch: ToolDispatch
}

export const FORBIDDEN_INPUT_KEYS = [
  'actorUserId',
  'userId',
  'apiKeyId',
  'apiKey',
  'ownerId',
  'keyHash',
] as const

const projectId: JsonSchemaProperty = {
  type: 'string',
  minLength: 1,
  description: 'ID do projeto. Opcional quando DBMAPPER_PROJECT_ID está configurado.',
}

const itemType: JsonSchemaProperty = {
  type: 'string',
  enum: ['table', 'column', 'relationship'],
  description: 'Tipo do item do dicionário.',
}

function tool(
  name: ToolName,
  description: string,
  properties: Record<string, JsonSchemaProperty>,
  required: readonly string[],
  method: ToolHttpMethod,
  path: string,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: { projectId, ...properties },
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    },
    docSection: name,
    dispatch: { method, path },
  }
}

export const TOOL_CATALOG: readonly ToolDefinition[] = [
  tool(
    'get_project_overview',
    'Resumo do projeto: nome, cobertura de descrições (itens descritos e aprovados) e sugestões pendentes.',
    {},
    [],
    'GET',
    '/api/projects/:projectId',
  ),
  tool(
    'list_missing_descriptions',
    'Lista os itens sem descrição, com filtro opcional por tabela e tipo de item.',
    {
      table: { type: 'string', minLength: 1, description: 'Nome da tabela para filtrar.' },
      itemType,
    },
    [],
    'GET',
    '/api/projects/:projectId',
  ),
  tool(
    'get_table',
    'Detalha uma tabela: descrição, revisão, colunas e relacionamentos com os IDs dos itens.',
    { table: { type: 'string', minLength: 1, description: 'Nome da tabela.' } },
    ['table'],
    'GET',
    '/api/projects/:projectId',
  ),
  tool(
    'get_column',
    'Detalha uma coluna (tipo, PK/FK, descrição) e as descrições das colunas vizinhas.',
    {
      column: { type: 'string', minLength: 1, description: 'Nome da coluna.' },
      table: { type: 'string', minLength: 1, description: 'Nome da tabela quando houver nomes repetidos.' },
    },
    ['column'],
    'GET',
    '/api/projects/:projectId',
  ),
  tool(
    'set_description',
    'Grava a descrição de uma tabela, coluna ou relacionamento. A descrição fica como não revisada.',
    {
      itemType,
      itemId: { type: 'string', minLength: 1, description: 'ID do item retornado pelas tools de leitura.' },
      description: { type: 'string', maxLength: 20000, description: 'Nova descrição.' },
    },
    ['itemType', 'itemId', 'description'],
    'PATCH',
    '/api/projects/:projectId/items/:itemType/:itemId/description',
  ),
  tool(
    'list_suggestions',
    'Lista sugestões do agente com o contexto armazenado, filtráveis por status.',
    {
      status: {
        type: 'string',
        enum: ['pending', 'applied', 'rejected'],
        description: 'Status das sugestões (padrão: pending).',
      },
    },
    [],
    'GET',
    '/api/projects/:projectId/agent/suggestions',
  ),
  tool(
    'apply_suggestion',
    'Aplica uma sugestão pendente do agente (CAS: sugestão fora de pending vira erro 409).',
    {
      suggestionId: { type: 'string', minLength: 1, description: 'ID da sugestão.' },
    },
    ['suggestionId'],
    'POST',
    '/api/projects/:projectId/agent/suggestions/:suggestionId/apply',
  ),
  tool(
    'reject_suggestion',
    'Rejeita uma sugestão pendente do agente (CAS: sugestão fora de pending vira erro 409).',
    {
      suggestionId: { type: 'string', minLength: 1, description: 'ID da sugestão.' },
    },
    ['suggestionId'],
    'POST',
    '/api/projects/:projectId/agent/suggestions/:suggestionId/reject',
  ),
  tool(
    'get_export',
    'Exporta o projeto no contrato JSON v1 consumido pelo DBViewer.',
    {},
    [],
    'GET',
    '/api/projects/:projectId/export',
  ),
]

export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_CATALOG.find((candidate) => candidate.name === name)
}

export type ArgumentValidation =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; message: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateToolArguments(schema: ToolInputSchema, input: unknown): ArgumentValidation {
  const args = input === undefined || input === null ? {} : input
  if (!isPlainObject(args)) {
    return { ok: false, message: 'Os argumentos da tool devem ser um objeto JSON.' }
  }

  for (const key of Object.keys(args)) {
    if ((FORBIDDEN_INPUT_KEYS as readonly string[]).includes(key)) {
      return { ok: false, message: `O argumento "${key}" não é permitido: a identidade vem da credencial.` }
    }
    if (!(key in schema.properties)) {
      return { ok: false, message: `O argumento "${key}" não é aceito por esta tool.` }
    }
  }

  for (const required of schema.required ?? []) {
    if (!(required in args) || args[required] === undefined) {
      return { ok: false, message: `O argumento "${required}" é obrigatório.` }
    }
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, property] of Object.entries(schema.properties)) {
    const value = args[key]
    if (value === undefined) continue

    if (property.type === 'string') {
      if (typeof value !== 'string') {
        return { ok: false, message: `O argumento "${key}" deve ser uma string.` }
      }
      if (property.minLength !== undefined && value.length < property.minLength) {
        return { ok: false, message: `O argumento "${key}" é curto demais.` }
      }
      if (property.maxLength !== undefined && value.length > property.maxLength) {
        return { ok: false, message: `O argumento "${key}" é longo demais.` }
      }
      if (property.enum && !property.enum.includes(value)) {
        return { ok: false, message: `O argumento "${key}" deve ser um de: ${property.enum.join(', ')}.` }
      }
    } else if (property.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { ok: false, message: `O argumento "${key}" deve ser um inteiro.` }
      }
    } else if (typeof value !== 'boolean') {
      return { ok: false, message: `O argumento "${key}" deve ser booleano.` }
    }

    normalized[key] = value
  }

  return { ok: true, args: normalized }
}
