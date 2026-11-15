export const TRANSPORT = 'stdio' as const

export interface StdioAdapterInfo {
  readonly name: string
  readonly transport: typeof TRANSPORT
  readonly version: string
}

export const adapterInfo: StdioAdapterInfo = {
  name: 'dbmapper-mcp',
  transport: TRANSPORT,
  version: '0.0.0',
}

export function startStdioAdapter(): StdioAdapterInfo {
  process.stderr.write('DBMapper MCP stdio adapter placeholder (phase 0): aguardando implementação da Fase 5.\n')
  return adapterInfo
}

if (import.meta.main) {
  startStdioAdapter()
}
