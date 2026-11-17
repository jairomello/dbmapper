import type { CreateAiSuggestionInput, Persistence } from '../persistence/ports'
import { buildAgentContext, type AgentTableContext, type AgentTargetItem } from './context'
import { parseSuggestions } from './parser'
import { buildTablePrompt, SYSTEM_PROMPT, type TablePromptPayload } from './prompt'
import type { ModelProvider } from './provider'

export const DEFAULT_WORKER_INTERVAL_MS = 1000
export const DEFAULT_LEASE_MS = 60_000

export interface AgentWorkerOptions {
  persistence: Persistence
  provider: ModelProvider
  intervalMs?: number
  leaseMs?: number
  now?: () => Date
  onError?: (error: unknown) => void
}

export interface AgentWorker {
  processNext(now?: Date): Promise<boolean>
  start(): void
  stop(): void
}

type WorkerStats = Record<string, number>

function toPromptPayload(group: AgentTableContext): TablePromptPayload {
  return {
    table: {
      id: group.table.id,
      name: group.table.name,
      description: group.table.description,
      businessTerms: [...group.table.businessTerms],
    },
    targets: group.targets.map((target) => {
      if (target.itemType === 'table') {
        return { type: 'table' as const, itemId: target.itemId, name: target.name }
      }
      return {
        type: 'column' as const,
        itemId: target.itemId,
        name: target.name,
        columnType: target.column?.type,
        primaryKey: target.column?.primaryKey,
        foreignKey: target.column?.foreignKey,
      }
    }),
    describedColumns: group.describedColumns.map((column) => ({ ...column })),
    foreignKeys: group.foreignKeys.map((foreignKey) => ({ ...foreignKey })),
  }
}

function targetByName(group: AgentTableContext): Map<string, AgentTargetItem> {
  const map = new Map<string, AgentTargetItem>()
  for (const target of group.targets) {
    if (!map.has(target.name)) map.set(target.name, target)
  }
  return map
}

export function createAgentWorker(options: AgentWorkerOptions): AgentWorker {
  const { persistence, provider } = options
  const intervalMs = options.intervalMs ?? DEFAULT_WORKER_INTERVAL_MS
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  const clock = options.now ?? (() => new Date())
  let timer: ReturnType<typeof setInterval> | null = null
  let busy = false

  const processJob = async (jobId: string): Promise<void> => {
    const job = persistence.agent.jobs.get(jobId)
    if (!job) return

    const stats: WorkerStats = {
      targets: 0,
      created: 0,
      skipped: 0,
      tables: 0,
      tablesProcessed: 0,
    }

    const agentContext = (() => {
      const aggregate = persistence.projects.get(job.projectId)
      if (!aggregate) return null
      return buildAgentContext(aggregate, job.scope, job.tableId)
    })()

    if (!agentContext) {
      const message =
        persistence.projects.get(job.projectId) === null
          ? 'Projeto não encontrado.'
          : 'Tabela não encontrada para a geração de sugestões.'
      persistence.agent.jobs.fail(jobId, message, stats, clock().toISOString())
      return
    }

    stats.targets = agentContext.targets.length
    stats.tables = agentContext.tables.length

    const heartbeat = setInterval(
      () => {
        const now = clock()
        persistence.agent.jobs.heartbeat(
          jobId,
          new Date(now.getTime() + leaseMs).toISOString(),
          now.toISOString(),
        )
      },
      Math.max(50, Math.floor(leaseMs / 2)),
    )
    heartbeat.unref?.()

    try {
      for (const group of agentContext.tables) {
        const payload = toPromptPayload(group)
        const raw = await provider.complete({ prompt: buildTablePrompt(payload), system: SYSTEM_PROMPT })
        const targets = targetByName(group)
        const parsed = parseSuggestions(raw, new Set(targets.keys()))
        const now = clock().toISOString()

        const inputs: CreateAiSuggestionInput[] = []
        for (const suggestion of parsed.suggestions) {
          const target = targets.get(suggestion.item)
          if (!target) continue
          inputs.push({
            projectId: job.projectId,
            jobId: job.id,
            itemType: target.itemType,
            itemId: target.itemId,
            tableId: target.tableId,
            suggestedDescription: suggestion.description,
            context: {
              ...payload,
              item: { type: target.itemType, id: target.itemId, name: target.name },
            },
            requestedBy: job.requestedBy,
          })
        }

        persistence.agent.suggestions.replacePending(inputs, now)
        stats.created += inputs.length
        stats.skipped += parsed.skipped
        stats.tablesProcessed += 1
      }

      persistence.agent.jobs.succeed(jobId, stats, clock().toISOString())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar sugestões.'
      persistence.agent.jobs.fail(jobId, message, stats, clock().toISOString())
      options.onError?.(error)
    } finally {
      clearInterval(heartbeat)
    }
  }

  const processNext = async (now: Date = clock()): Promise<boolean> => {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString()
    const job = persistence.agent.jobs.claimNext(now.toISOString(), leaseExpiresAt)
    if (!job) return false
    await processJob(job.id)
    return true
  }

  const start = (): void => {
    if (timer) return
    timer = setInterval(() => {
      if (busy) return
      busy = true
      processNext()
        .catch((error) => options.onError?.(error))
        .finally(() => {
          busy = false
        })
    }, intervalMs)
    timer.unref?.()
  }

  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { processNext, start, stop }
}
