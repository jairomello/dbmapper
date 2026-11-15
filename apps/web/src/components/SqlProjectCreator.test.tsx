import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ImportPlan, ProjectView } from '../api/types'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/setup'
import { errorResponse, installFetch, jsonResponse, readJsonBody } from '../test/fetch'
import { sampleProject } from '../test/fixtures'
import { SqlProjectCreator } from './SqlProjectCreator'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

const plan: ImportPlan = {
  planHash: 'plan-1',
  baseModelHash: 'base-1',
  sqlHash: 'sql-1',
  tables: { kept: [], added: ['cliente'], removed: [], renamed: [] },
  columns: {
    kept: [],
    added: [{ table: 'cliente', name: 'id', type: 'int' }],
    removed: [],
    renamed: [],
    changed: [],
  },
  relationships: { kept: [], added: [], removed: [] },
}

describe('SqlProjectCreator', () => {
  test('cria o projeto vazio, passa pelo preview/apply e entrega a árvore populada', async () => {
    const created = sampleProject({ id: 'projeto-sql', name: 'Loja SQL' })
    const populated = sampleProject({ id: 'projeto-sql', name: 'Loja SQL' })
    const onCreated = mock((_project: ProjectView) => {})
    const calls: string[] = []
    let applyBody: unknown

    restoreCallbacks.push(
      installFetch(async (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (url === '/api/projects' && init?.method === 'POST') {
          const body = await readJsonBody<{ name: string }>(init)
          expect(body).toEqual({ name: 'Loja SQL' })
          return jsonResponse(created, 201)
        }
        if (url === '/api/projects/projeto-sql/imports/preview') {
          return jsonResponse({ plan })
        }
        if (url === '/api/projects/projeto-sql/imports/apply') {
          applyBody = await readJsonBody<{ sql: string; renames: unknown; plan: ImportPlan }>(init)
          return jsonResponse({ project: populated, plan, run: {} })
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    render(<SqlProjectCreator onCreated={onCreated} onCancel={() => {}} />)

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Loja SQL' } })
    fireEvent.change(screen.getByLabelText('SQL'), {
      target: { value: 'CREATE TABLE cliente (id int);' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar a partir de SQL' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0][0]).toEqual(populated)
    expect(calls).toEqual([
      'POST /api/projects',
      'POST /api/projects/projeto-sql/imports/preview',
      'POST /api/projects/projeto-sql/imports/apply',
    ])
    expect(applyBody).toMatchObject({
      sql: 'CREATE TABLE cliente (id int);',
      renames: { tables: [], columns: [] },
      plan,
    })
  })

  test('não cria projeto quando o SQL não tem CREATE TABLE', async () => {
    const onCreated = mock((_project: ProjectView) => {})
    let projectCalls = 0

    restoreCallbacks.push(
      installFetch((url, init) => {
        if (url === '/api/projects' && init?.method === 'POST') {
          projectCalls += 1
          return jsonResponse(sampleProject(), 201)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    render(<SqlProjectCreator onCreated={onCreated} onCancel={() => {}} />)

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Sem tabelas' } })
    fireEvent.change(screen.getByLabelText('SQL'), { target: { value: 'SELECT 1;' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar a partir de SQL' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('CREATE TABLE')
    expect(projectCalls).toBe(0)
    expect(onCreated).not.toHaveBeenCalled()
  })

  test('mostra a mensagem do servidor quando o preview falha', async () => {
    const onCreated = mock((_project: ProjectView) => {})

    restoreCallbacks.push(
      installFetch((url) => {
        if (url === '/api/projects') return jsonResponse(sampleProject({ id: 'projeto-sql' }), 201)
        if (url === '/api/projects/projeto-sql/imports/preview') {
          return errorResponse('INVALID_SQL', 'Não foi possível interpretar o SQL informado.', 400)
        }
        return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
      }),
    )

    render(<SqlProjectCreator onCreated={onCreated} onCancel={() => {}} />)

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Inválido' } })
    fireEvent.change(screen.getByLabelText('SQL'), {
      target: { value: 'CREATE TABLE quebrada (id int' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar a partir de SQL' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Não foi possível interpretar o SQL informado.')
    expect(onCreated).not.toHaveBeenCalled()
  })
})
