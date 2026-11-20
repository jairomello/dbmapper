import type { DatabaseModel } from '@dbmapper/domain'
import { applyCommand, applyReverseCommand, type CanvasCommand } from './commands'

export type CommandQueueStatus = 'saving' | 'saved'

export interface CommandQueueOptions<TResult = unknown> {
  database: DatabaseModel
  save: (database: DatabaseModel) => Promise<TResult>
  onDatabaseChange?: (database: DatabaseModel) => void
  onSaved?: (result: TResult, database: DatabaseModel) => void
  onError?: (error: unknown) => void
  onStatusChange?: (status: CommandQueueStatus) => void
}

/**
 * Serializes model saves: exactly one PUT is in flight at a time. Every canvas
 * mutation carries its inverse so undo/redo only feeds the same save path.
 */
export class CommandQueue<TResult = unknown> {
  private database: DatabaseModel
  private executed: CanvasCommand[] = []
  private redoStack: CanvasCommand[] = []
  private pending: DatabaseModel[] = []
  private sending = false
  private generation = 0

  constructor(private readonly options: CommandQueueOptions<TResult>) {
    this.database = options.database
  }

  get model(): DatabaseModel {
    return this.database
  }

  get canUndo(): boolean {
    return this.executed.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get isBusy(): boolean {
    return this.sending || this.pending.length > 0
  }

  execute(command: CanvasCommand): DatabaseModel {
    const next = applyCommand(this.database, command)
    this.database = next
    this.executed.push(command)
    this.redoStack = []
    this.options.onDatabaseChange?.(next)
    this.enqueue(next)
    return next
  }

  undo(): DatabaseModel | null {
    const command = this.executed.pop()
    if (!command) return null
    const next = applyReverseCommand(this.database, command)
    this.database = next
    this.redoStack.push(command)
    this.options.onDatabaseChange?.(next)
    this.enqueue(next)
    return next
  }

  redo(): DatabaseModel | null {
    const command = this.redoStack.pop()
    if (!command) return null
    const next = applyCommand(this.database, command)
    this.database = next
    this.executed.push(command)
    this.options.onDatabaseChange?.(next)
    this.enqueue(next)
    return next
  }

  reset(database: DatabaseModel): void {
    this.generation += 1
    this.database = database
    this.executed = []
    this.redoStack = []
    this.pending = []
    this.sending = false
  }

  private enqueue(database: DatabaseModel): void {
    this.pending.push(database)
    this.options.onStatusChange?.('saving')
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.sending) return
    const snapshot = this.pending.shift()
    if (!snapshot) return

    this.sending = true
    const generation = this.generation

    try {
      const result = await this.options.save(snapshot)
      if (generation === this.generation) this.options.onSaved?.(result, snapshot)
    } catch (error) {
      if (generation === this.generation) {
        this.pending = []
        this.executed = []
        this.redoStack = []
        this.options.onError?.(error)
      }
    } finally {
      this.sending = false
      if (generation === this.generation) {
        if (this.pending.length > 0) {
          void this.pump()
        } else {
          this.options.onStatusChange?.('saved')
        }
      }
    }
  }
}
