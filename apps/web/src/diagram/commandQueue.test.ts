import { describe, expect, test } from 'bun:test'
import type { DatabaseModel } from '@dbmapper/domain'
import { sampleDatabase } from '../test/fixtures'
import { CommandQueue } from './commandQueue'
import { createColumnCommand, createTableCommand } from './commands'

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CommandQueue', () => {
  test('serializa os saves, mantendo um PUT em voo por vez', async () => {
    const database = sampleDatabase()
    const calls: DatabaseModel[] = []
    const resolvers: Array<(value: DatabaseModel) => void> = []
    const queue = new CommandQueue<DatabaseModel>({
      database,
      save: (snapshot) => {
        calls.push(snapshot)
        return new Promise((resolve) => resolvers.push(resolve))
      },
    })

    queue.execute(createTableCommand(queue.model, { name: 'produto' }))
    queue.execute(createColumnCommand(queue.model, 'produto', { name: 'nome', type: 'text' }))

    expect(calls).toHaveLength(1)
    expect(queue.isBusy).toBe(true)

    resolvers[0](calls[0])
    await tick()
    expect(calls).toHaveLength(2)

    resolvers[1](calls[1])
    await tick()
    expect(queue.isBusy).toBe(false)
  })

  test('undo aplica o inverso e persiste pelo mesmo caminho', async () => {
    const database = sampleDatabase()
    const calls: DatabaseModel[] = []
    const queue = new CommandQueue<DatabaseModel>({
      database,
      save: async (snapshot) => {
        calls.push(snapshot)
        return snapshot
      },
    })

    queue.execute(createTableCommand(queue.model, { name: 'produto' }))
    expect(queue.canUndo).toBe(true)
    queue.undo()
    await tick()

    expect(calls).toHaveLength(2)
    expect(calls[1].tables.map((table) => table.name)).toEqual(['cliente', 'pedido'])
    expect(queue.canUndo).toBe(false)
    expect(queue.canRedo).toBe(true)
  })

  test('redo reaplica o comando e uma mutação nova limpa o redo', async () => {
    const database = sampleDatabase()
    const queue = new CommandQueue<DatabaseModel>({
      database,
      save: async (snapshot) => snapshot,
    })

    queue.execute(createTableCommand(queue.model, { name: 'produto' }))
    queue.undo()
    expect(queue.canRedo).toBe(true)

    queue.redo()
    expect(queue.canRedo).toBe(false)
    expect(queue.model.tables.map((table) => table.name)).toContain('produto')

    queue.undo()
    expect(queue.canRedo).toBe(true)
    queue.execute(createTableCommand(queue.model, { name: 'categoria' }))
    expect(queue.canRedo).toBe(false)
    await tick()
  })

  test('erro limpa a fila e notifica sem enviar mutações pendentes', async () => {
    const database = sampleDatabase()
    const calls: DatabaseModel[] = []
    const errors: unknown[] = []
    const queue = new CommandQueue<DatabaseModel>({
      database,
      save: async (snapshot) => {
        calls.push(snapshot)
        throw new Error('falhou')
      },
      onError: (error) => errors.push(error),
    })

    queue.execute(createTableCommand(queue.model, { name: 'produto' }))
    queue.execute(createTableCommand(queue.model, { name: 'categoria' }))
    await tick()

    expect(calls).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(queue.isBusy).toBe(false)
    expect(queue.canUndo).toBe(false)
  })
})
