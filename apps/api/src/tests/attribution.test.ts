import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiRequest, createTestContext, createUser, sampleDatabase, type TestContext } from './helpers'

describe('auth: atribuição de reviewed_by/reviewed_at', () => {
  let context: TestContext

  beforeEach(async () => {
    context = await createTestContext()
  })

  afterEach(async () => {
    await context.cleanup()
  })

  test('ao revisar pela API grava o usuário da sessão e preserva o revisor em saves sem mudança', async () => {
    const created = await apiRequest<{ id: string }>(context, '/api/projects', 'POST', { name: 'Revisão' })
    const projectId = created.body.id

    const database = sampleDatabase()
    database.reviewed = true
    database.tables[0].reviewed = true
    database.tables[0].columns[0].reviewed = true
    database.tables[1].relationships.parents[0].reviewed = true

    const saved = await apiRequest(context, `/api/projects/${projectId}`, 'PUT', { database })
    expect(saved.response.status).toBe(200)

    const aggregate = context.persistence.projects.get(projectId)!
    expect(aggregate.project.reviewed).toBe(true)
    expect(aggregate.project.reviewedBy).toBe(context.defaultUser.id)
    expect(aggregate.project.reviewedAt).toBeTruthy()

    const cliente = aggregate.tables.find((table) => table.name === 'cliente')!
    expect(cliente.reviewedBy).toBe(context.defaultUser.id)
    expect(cliente.reviewedAt).toBeTruthy()

    const clienteColumn = aggregate.columns.find((column) => column.tableId === cliente.id)!
    expect(clienteColumn.reviewedBy).toBe(context.defaultUser.id)

    const pedido = aggregate.tables.find((table) => table.name === 'pedido')!
    const relationship = aggregate.relationships.find((item) => item.tableId === pedido.id)!
    expect(relationship.reviewedBy).toBe(context.defaultUser.id)

    const secondMember = await createUser(context, {
      email: 'segundo@example.com',
      password: 'segundo-password',
      role: 'MEMBER',
    })

    const resaved = await apiRequest(
      context,
      `/api/projects/${projectId}`,
      'PUT',
      { database },
      { cookie: secondMember.cookie },
    )
    expect(resaved.response.status).toBe(200)

    const preserved = context.persistence.projects.get(projectId)!
    expect(preserved.project.reviewedBy).toBe(context.defaultUser.id)
    expect(preserved.tables.find((table) => table.name === 'cliente')!.reviewedBy).toBe(context.defaultUser.id)

    const reopened = sampleDatabase()
    reopened.reviewed = false
    reopened.tables[0].reviewed = false
    reopened.tables[0].columns[0].reviewed = false
    reopened.tables[1].relationships.parents[0].reviewed = false

    const reopenedSave = await apiRequest(
      context,
      `/api/projects/${projectId}`,
      'PUT',
      { database: reopened },
      { cookie: secondMember.cookie },
    )
    expect(reopenedSave.response.status).toBe(200)

    const afterReopen = context.persistence.projects.get(projectId)!
    expect(afterReopen.project.reviewedBy).toBeNull()
    expect(afterReopen.project.reviewedAt).toBeNull()
    expect(afterReopen.tables.find((table) => table.name === 'cliente')!.reviewedBy).toBeNull()
  })
})
