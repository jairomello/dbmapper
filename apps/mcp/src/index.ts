import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ApiClient, resolveConfig } from './api'
import { TOOL_CATALOG } from './catalog'
import { createToolExecutor, type ToolExecutor } from './handlers'

export const TRANSPORT = 'stdio' as const
export const SERVER_NAME = 'dbmapper-mcp'
export const SERVER_VERSION = '0.1.0'

export interface StdioAdapterInfo {
  readonly name: string
  readonly transport: typeof TRANSPORT
  readonly version: string
}

export const adapterInfo: StdioAdapterInfo = {
  name: SERVER_NAME,
  transport: TRANSPORT,
  version: SERVER_VERSION,
}

export function createExecutorFromEnv(env: Record<string, string | undefined> = process.env): ToolExecutor {
  const resolved = resolveConfig(env)
  if (!resolved.ok) {
    return createToolExecutor({ client: null, configError: resolved.message })
  }
  return createToolExecutor({ client: new ApiClient(resolved.config) })
}

export function createMcpServer(executor: ToolExecutor): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_CATALOG.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    executor(request.params.name, request.params.arguments),
  )

  return server
}

export async function startStdioServer(
  env: Record<string, string | undefined> = process.env,
): Promise<Server> {
  const server = createMcpServer(createExecutorFromEnv(env))
  await server.connect(new StdioServerTransport())
  return server
}

if (import.meta.main) {
  startStdioServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'erro desconhecido'
    process.stderr.write(`Falha ao iniciar o DBMapper MCP: ${message}\n`)
    process.exitCode = 1
  })
}
