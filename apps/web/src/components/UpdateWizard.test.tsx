import type { DatabaseModel } from '@dbmapper/domain'
import { afterEach, describe, expect, test } from 'bun:test'
import { useState } from 'react'
import type { ImportPlan, ProjectView, RenameMapping } from '../api/types'
import { cleanup, fireEvent, screen, waitFor } from '../test/setup'
import { errorResponse, installFetch, jsonResponse, readJsonBody } from '../test/fetch'
import { sampleDatabase, sampleProject } from '../test/fixtures'
import { renderWithClient } from '../test/render'
import { SemanticTree } from './SemanticTree'
import { UpdateWizard } from './UpdateWizard'

const restoreCallbacks: Array<() => void> = []

afterEach(() => {
  while (restoreCallbacks.length > 0) restoreCallbacks.pop()?.()
  cleanup()
})

function makePlan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  return {
    planHash: 'plan-1',
    baseModelHash: 'base-1',
    sqlHash: 'sql-1',
    tables: {
      kept: ['cliente', 'pedido'],
      added: ['cidade', 'produto'],
      removed: ['cidades'],
      renamed: [],
    },
    columns: {
      kept: [],
      added: [
        { table: 'cidade', name: 'estado_id', type: 'int' },
        { table: 'pedido', name: 'criado_em', type: 'timestamp' },
      ],
      removed: [{ table: 'pedido', name: 'legacy' }],
      renamed: [],
      changed: [{ table: 'cliente', name: 'nome', from: 'text', to: 'varchar' }],
    },
    relationships: {
      kept: [],
      added: [
        {
          table: 'pedido',
          target: 'cliente',
          local_columns: ['cliente_id'],
          referenced_columns: ['id'],
          constraint_name: '',
        },
      ],
      removed: [],
    },
    ...overrides,
  }
}

function planFor(renames: RenameMapping): ImportPlan {
  const tableRenamed = renames.tables.some((rename) => rename.from === 'cidades' && rename.to === 'cidade')
  const columnRenamed = renames.columns.some(
    (rename) => rename.table === 'pedido' && rename.from === 'legacy' && rename.to === 'criado_em',
  )

  const plan = makePlan()

  if (tableRenamed) {
    plan.tables = { kept: ['cliente', 'pedido'], added: ['produto'], removed: [], renamed: [{ from: 'cidades', to: 'cidade' }] }
    plan.columns.added = plan.columns.added.filter((column) => column.table !== 'cidade')
  }

  if (columnRenamed) {
    plan.columns.removed = []
    plan.columns.added = plan.columns.added.filter(
      (column) => !(column.table === 'pedido' && column.name === 'criado_em'),
    )
    plan.columns.renamed = [{ table: 'pedido', from: 'legacy', to: 'criado_em' }]
  }

  return plan
}

function installedWizardHandlers(options: {
  onApply: (body: { sql: string; renames: RenameMapping; plan: ImportPlan }) => Response | Promise<Response>
}): { previewBodies: Array<{ sql: string; renames: RenameMapping }>; applyBodies: Array<{ sql: string; renames: RenameMapping; plan: ImportPlan }> } {
  const previewBodies: Array<{ sql: string; renames: RenameMapping }> = []
  const applyBodies: Array<{ sql: string; renames: RenameMapping; plan: ImportPlan }> = []

  restoreCallbacks.push(
    installFetch(async (url, init) => {
      if (url === '/api/projects/projeto-1/imports/preview') {
        const body = await readJsonBody<{ sql: string; renames: RenameMapping }>(init)
        previewBodies.push(body)
        return jsonResponse({ plan: planFor(body.renames) })
      }
      if (url === '/api/projects/projeto-1/imports/apply') {
        const body = await readJsonBody<{ sql: string; renames: RenameMapping; plan: ImportPlan }>(init)
        applyBodies.push(body)
        return options.onApply(body)
      }
      return errorResponse('NOT_FOUND', 'Recurso não encontrado.', 404)
    }),
  )

  return { previewBodies, applyBodies }
}

async function openPreview() {
  fireEvent.change(screen.getByLabelText('SQL de atualização'), {
    target: { value: 'CREATE TABLE cliente (id int, nome varchar);' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Gerar prévia' }))
  await screen.findByTestId('table-removed-cidades')
}

async function reachSummary() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByTestId('column-changed-cliente-nome')
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByTestId('relationship-added-pedido-cliente')
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByTestId('summary-tables')
}

function WizardHarness({ initial }: { initial: ProjectView }) {
  const [project, setProject] = useState<ProjectView>(initial)

  return (
    <>
      <UpdateWizard projectId="projeto-1" onClose={() => {}} onApplied={setProject} />
      <SemanticTree database={project.database} selection={{ type: 'database' }} onSelect={() => {}} />
    </>
  )
}

describe('UpdateWizard', () => {
  test('renderiza a classificação do plano, permite rename explícito e não aplica antes da confirmação', async () => {
    const applied = sampleProject()
    const { previewBodies, applyBodies } = installedWizardHandlers({
      onApply: () => jsonResponse({ project: applied, plan: makePlan(), run: {} }),
    })

    renderWithClient(<UpdateWizard projectId="projeto-1" onClose={() => {}} onApplied={() => {}} />)

    await openPreview()
    expect(screen.getByTestId('table-kept-cliente')).toBeTruthy()
    expect(screen.getByTestId('table-added-produto')).toBeTruthy()
    expect(screen.getByTestId('table-removed-cidades')).toBeTruthy()
    expect(screen.getByTestId('table-added-cidade')).toBeTruthy()
    expect(previewBodies).toHaveLength(1)
    expect(previewBodies[0].renames).toEqual({ tables: [], columns: [] })
    expect(applyBodies).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Renomear tabela cidades para'), { target: { value: 'cidade' } })

    await screen.findByTestId('table-renamed-cidades-cidade')
    await waitFor(() => expect(previewBodies).toHaveLength(2))
    expect(previewBodies[1].renames.tables).toEqual([{ from: 'cidades', to: 'cidade' }])
    expect(applyBodies).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByTestId('column-removed-pedido-legacy')
    expect(screen.getByTestId('column-changed-cliente-nome').textContent).toContain('text → varchar')

    fireEvent.change(screen.getByLabelText('Renomear coluna pedido.legacy para'), { target: { value: 'criado_em' } })
    await screen.findByTestId('column-renamed-pedido-legacy-criado_em')
    await waitFor(() => expect(previewBodies).toHaveLength(3))
    expect(previewBodies[2].renames.columns).toEqual([{ table: 'pedido', from: 'legacy', to: 'criado_em' }])
    expect(applyBodies).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByTestId('relationship-added-pedido-cliente')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByTestId('summary-tables')).toBeTruthy()
    expect(screen.getByTestId('summary-columns').textContent).toContain('1 com tipo alterado')
    expect(screen.getByTestId('summary-renames').textContent).toContain('1 tabela(s)')
    expect(applyBodies).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }))

    await screen.findByText('Importação aplicada')
    expect(applyBodies).toHaveLength(1)
    expect(applyBodies[0].renames).toEqual({
      tables: [{ from: 'cidades', to: 'cidade' }],
      columns: [{ table: 'pedido', from: 'legacy', to: 'criado_em' }],
    })
    expect(applyBodies[0].plan.planHash).toBe('plan-1')
    expect(applyBodies[0].sql).toContain('CREATE TABLE cliente')
  })

  test('após aplicar, a árvore mostra metadados preservados e novos itens sem descrição', async () => {
    const database: DatabaseModel = sampleDatabase()
    database.tables.push({
      name: 'produto',
      description: '',
      business_terms: [],
      reviewed: false,
      status: 'NEW',
      relationships: { parents: [], children: [] },
      columns: [
        {
          name: 'id',
          type: 'int',
          primary_key: true,
          foreign_key: false,
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'NEW',
        },
      ],
    })
    const applied = sampleProject({ database })

    installedWizardHandlers({ onApply: () => jsonResponse({ project: applied, plan: makePlan(), run: {} }) })

    renderWithClient(<WizardHarness initial={sampleProject()} />)

    await openPreview()
    await reachSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }))

    await screen.findByText('Importação aplicada')
    expect(screen.getByTestId('column-row-cliente-id').textContent).toContain('aprovado')
    expect(screen.getByTestId('table-row-produto').textContent).toContain('sem desc')
  })

  test('mostra o envelope de erro quando o plano está desatualizado e não aplica', async () => {
    let applied = false
    installedWizardHandlers({
      onApply: () =>
        errorResponse(
          'STALE_PLAN',
          'O plano de importação está desatualizado. Gere um novo preview antes de aplicar.',
          409,
          { retryable: true },
        ),
    })

    renderWithClient(
      <UpdateWizard
        projectId="projeto-1"
        onClose={() => {}}
        onApplied={() => {
          applied = true
        }}
      />,
    )

    await openPreview()
    await reachSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('O plano de importação está desatualizado.')
    expect(applied).toBe(false)
  })
})
