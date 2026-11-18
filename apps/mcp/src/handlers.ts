import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { type ApiClient, ApiError } from './api'
import { findTool, validateToolArguments, type ToolDefinition } from './catalog'

export type ToolResult = CallToolResult

interface ColumnModel {
  name: string
  type: string
  primary_key: boolean
  foreign_key: boolean
  description: string
  business_terms: string[]
  reviewed: boolean
  status: string
}

interface RelationshipModel {
  table: string
  local_columns: string[]
  referenced_columns: string[]
  constraint_name: string
  description: string
  reviewed: boolean
}

interface TableModel {
  name: string
  description: string
  business_terms: string[]
  reviewed: boolean
  status: string
  columns: ColumnModel[]
  relationships: { parents: RelationshipModel[]; children: RelationshipModel[] }
}

interface ProjectViewResponse {
  id: string
  name: string
  description: string
  reviewed: boolean
  table_ids: Record<string, string>
  column_ids: Record<string, Record<string, string>>
  relationship_ids: Record<string, string[]>
  database: {
    name: string
    description: string
    tables: TableModel[]
  }
}

interface SetDescriptionResponse {
  item: {
    itemType: string
    itemId: string
    description: string
    descriptionSource: string
    reviewed: boolean
    changed: boolean
  }
}

interface SuggestionsResponse {
  suggestions: Array<Record<string, unknown>>
}

export interface ToolExecutorOptions {
  client: ApiClient | null
  configError?: string
}

export type ToolExecutor = (name: string, args: unknown) => Promise<ToolResult>

const NOT_REVIEWED_WARNING =
  'Descrição gravada; o item ficou como não revisado. A aprovação é exclusivamente humana.'

export function textResult(value: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

export function errorResult(code: string, message: string, status?: number): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: { code, message, ...(status ? { status } : {}) } }, null, 2),
      },
    ],
  }
}

function fillPath(path: string, values: Record<string, string>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) =>
    encodeURIComponent(values[key] ?? ''),
  )
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

async function fetchProject(client: ApiClient, projectId: string): Promise<ProjectViewResponse> {
  return client.request<ProjectViewResponse>('GET', `/api/projects/${encodeURIComponent(projectId)}`)
}

function relationshipItems(
  project: ProjectViewResponse,
  table: TableModel,
  tableFilter: string | undefined,
): Array<Record<string, unknown>> {
  if (tableFilter && table.name !== tableFilter) return []
  const ids = project.relationship_ids[table.name] ?? []
  return table.relationships.parents.map((relationship, index) => ({
    itemType: 'relationship',
    itemId: ids[index] ?? '',
    table: table.name,
    name: relationship.constraint_name || `${table.name}.${relationship.table}`,
    targetTable: relationship.table,
    description: relationship.description,
    reviewed: relationship.reviewed,
  }))
}

function missingDescriptionItems(
  project: ProjectViewResponse,
  filters: { table?: string; itemType?: string },
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = []

  for (const table of project.database.tables) {
    if (filters.table && table.name !== filters.table) continue
    const columnIds = project.column_ids[table.name] ?? {}

    if (!filters.itemType || filters.itemType === 'table') {
      if (table.description.trim().length === 0) {
        items.push({
          itemType: 'table',
          itemId: project.table_ids[table.name] ?? '',
          table: table.name,
          name: table.name,
          description: '',
          reviewed: table.reviewed,
        })
      }
    }

    if (!filters.itemType || filters.itemType === 'column') {
      for (const column of table.columns) {
        if (column.description.trim().length > 0) continue
        items.push({
          itemType: 'column',
          itemId: columnIds[column.name] ?? '',
          table: table.name,
          name: column.name,
          type: column.type,
          description: '',
          reviewed: column.reviewed,
        })
      }
    }

    if (!filters.itemType || filters.itemType === 'relationship') {
      for (const item of relationshipItems(project, table, undefined)) {
        if ((item.description as string).trim().length === 0) items.push(item)
      }
    }
  }

  return items
}

function coverage(project: ProjectViewResponse): Record<string, unknown> {
  let total = 0
  let described = 0
  let approved = 0

  const account = (description: string, reviewed: boolean) => {
    total += 1
    if (description.trim().length > 0) described += 1
    if (reviewed) approved += 1
  }

  for (const table of project.database.tables) {
    account(table.description, table.reviewed)
    for (const column of table.columns) account(column.description, column.reviewed)
    for (const relationship of table.relationships.parents) {
      account(relationship.description, relationship.reviewed)
    }
  }

  const percent = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100))

  return {
    totalItems: total,
    describedItems: described,
    approvedItems: approved,
    describedPercent: percent(described),
    approvedPercent: percent(approved),
  }
}

async function handleGetProjectOverview(
  client: ApiClient,
  projectId: string,
): Promise<ToolResult> {
  const [project, suggestions] = await Promise.all([
    fetchProject(client, projectId),
    client.request<SuggestionsResponse>(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/agent/suggestions?status=pending`,
    ),
  ])

  return textResult({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      reviewed: project.reviewed,
      databaseName: project.database.name,
    },
    coverage: coverage(project),
    pendingSuggestions: suggestions.suggestions.length,
    missingDescriptions: missingDescriptionItems(project, {}).length,
  })
}

async function handleListMissing(client: ApiClient, projectId: string, args: Record<string, unknown>) {
  const project = await fetchProject(client, projectId)
  const filters = {
    table: asString(args.table),
    itemType: asString(args.itemType),
  }
  const items = missingDescriptionItems(project, filters)
  return textResult({
    projectId,
    project: project.name,
    filters,
    count: items.length,
    items,
  })
}

function findTable(project: ProjectViewResponse, name: string): TableModel | undefined {
  return project.database.tables.find((table) => table.name === name)
}

async function handleGetTable(client: ApiClient, projectId: string, args: Record<string, unknown>) {
  const tableName = asString(args.table) ?? ''
  const project = await fetchProject(client, projectId)
  const table = findTable(project, tableName)
  if (!table) {
    return errorResult('NOT_FOUND', `Tabela "${tableName}" não encontrada no projeto.`, 404)
  }

  const columnIds = project.column_ids[table.name] ?? {}
  const relationshipIds = project.relationship_ids[table.name] ?? []

  return textResult({
    projectId,
    table: {
      itemId: project.table_ids[table.name] ?? '',
      name: table.name,
      description: table.description,
      reviewed: table.reviewed,
      status: table.status,
      businessTerms: table.business_terms,
      columns: table.columns.map((column) => ({
        itemId: columnIds[column.name] ?? '',
        name: column.name,
        type: column.type,
        primaryKey: column.primary_key,
        foreignKey: column.foreign_key,
        description: column.description,
        reviewed: column.reviewed,
      })),
      relationships: table.relationships.parents.map((relationship, index) => ({
        itemId: relationshipIds[index] ?? '',
        targetTable: relationship.table,
        localColumns: relationship.local_columns,
        referencedColumns: relationship.referenced_columns,
        constraintName: relationship.constraint_name,
        description: relationship.description,
        reviewed: relationship.reviewed,
      })),
    },
  })
}

async function handleGetColumn(client: ApiClient, projectId: string, args: Record<string, unknown>) {
  const columnName = asString(args.column) ?? ''
  const tableName = asString(args.table)
  const project = await fetchProject(client, projectId)

  const candidates = project.database.tables.filter((table) =>
    table.columns.some((column) => column.name === columnName),
  )
  const table = tableName ? candidates.find((candidate) => candidate.name === tableName) : candidates[0]

  if (!table?.columns.some((column) => column.name === columnName)) {
    return errorResult(
      'NOT_FOUND',
      `Coluna "${columnName}" não encontrada${tableName ? ` na tabela "${tableName}"` : ''}.`,
      404,
    )
  }

  if (!tableName && candidates.length > 1) {
    return errorResult(
      'VALIDATION_ERROR',
      `A coluna "${columnName}" existe em mais de uma tabela. Informe o argumento "table".`,
    )
  }

  const column = table.columns.find((candidate) => candidate.name === columnName)!
  const columnIds = project.column_ids[table.name] ?? {}

  return textResult({
    projectId,
    table: { name: table.name, description: table.description, reviewed: table.reviewed },
    column: {
      itemId: columnIds[column.name] ?? '',
      name: column.name,
      type: column.type,
      primaryKey: column.primary_key,
      foreignKey: column.foreign_key,
      description: column.description,
      reviewed: column.reviewed,
      businessTerms: column.business_terms,
    },
    neighbors: table.columns
      .filter((candidate) => candidate.name !== column.name)
      .map((candidate) => ({
        name: candidate.name,
        type: candidate.type,
        description: candidate.description,
        reviewed: candidate.reviewed,
      })),
  })
}

async function handleSetDescription(
  client: ApiClient,
  projectId: string,
  args: Record<string, unknown>,
  tool: ToolDefinition,
) {
  const itemType = asString(args.itemType) ?? ''
  const itemId = asString(args.itemId) ?? ''
  const description = typeof args.description === 'string' ? args.description : ''

  const path = fillPath(tool.dispatch.path, { projectId, itemType, itemId })
  const response = await client.request<SetDescriptionResponse>(tool.dispatch.method, path, {
    description,
  })

  return textResult({
    item: response.item,
    warning: NOT_REVIEWED_WARNING,
  })
}

async function handleListSuggestions(client: ApiClient, projectId: string, args: Record<string, unknown>) {
  const status = asString(args.status) ?? 'pending'
  const response = await client.request<SuggestionsResponse>(
    'GET',
    `/api/projects/${encodeURIComponent(projectId)}/agent/suggestions?status=${encodeURIComponent(status)}`,
  )
  return textResult({ projectId, status, count: response.suggestions.length, suggestions: response.suggestions })
}

async function handleSuggestionDecision(
  client: ApiClient,
  projectId: string,
  args: Record<string, unknown>,
  tool: ToolDefinition,
) {
  const suggestionId = asString(args.suggestionId) ?? ''
  const path = fillPath(tool.dispatch.path, { projectId, suggestionId })
  const response = await client.request<Record<string, unknown>>(tool.dispatch.method, path)
  return textResult({ projectId, ...response })
}

async function handleGetExport(client: ApiClient, projectId: string) {
  const response = await client.request<Record<string, unknown>>(
    'GET',
    `/api/projects/${encodeURIComponent(projectId)}/export`,
  )
  return textResult(response)
}

function resolveProjectId(
  args: Record<string, unknown>,
  client: ApiClient,
): string | undefined {
  return asString(args.projectId) ?? client.defaultProjectId
}

export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor {
  return async (name: string, rawArgs: unknown): Promise<ToolResult> => {
    const tool = findTool(name)
    if (!tool) {
      return errorResult('UNKNOWN_TOOL', `Tool "${name}" não existe no catálogo do DBMapper MCP.`)
    }

    if (!options.client) {
      return errorResult(
        'MCP_CONFIG_ERROR',
        options.configError ?? 'Configuração ausente para conectar o DBMapper MCP.',
      )
    }

    const validation = validateToolArguments(tool.inputSchema, rawArgs)
    if (!validation.ok) {
      return errorResult('VALIDATION_ERROR', validation.message)
    }

    const args = validation.args
    const projectId = resolveProjectId(args, options.client)
    if (!projectId) {
      return errorResult(
        'VALIDATION_ERROR',
        'Informe o argumento "projectId" ou configure DBMAPPER_PROJECT_ID.',
      )
    }

    try {
      switch (tool.name) {
        case 'get_project_overview':
          return await handleGetProjectOverview(options.client, projectId)
        case 'list_missing_descriptions':
          return await handleListMissing(options.client, projectId, args)
        case 'get_table':
          return await handleGetTable(options.client, projectId, args)
        case 'get_column':
          return await handleGetColumn(options.client, projectId, args)
        case 'set_description':
          return await handleSetDescription(options.client, projectId, args, tool)
        case 'list_suggestions':
          return await handleListSuggestions(options.client, projectId, args)
        case 'apply_suggestion':
        case 'reject_suggestion':
          return await handleSuggestionDecision(options.client, projectId, args, tool)
        case 'get_export':
          return await handleGetExport(options.client, projectId)
        default:
          return errorResult('UNKNOWN_TOOL', `Tool "${name}" não existe no catálogo do DBMapper MCP.`)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResult(error.code, error.message, error.status)
      }
      return errorResult('INTERNAL_ERROR', 'Falha inesperada ao executar a tool do DBMapper.')
    }
  }
}

