import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url))
const apiPort = Number(process.env.E2E_API_PORT ?? 3310)
const webPort = Number(process.env.E2E_WEB_PORT ?? 5373)
const adminEmail = 'admin@e2e.local'
const adminPassword = 'e2e-admin-password'
const exampleSqlPath = join(root, 'legacy', 'example.sql')

const workDir = await mkdtemp(join(tmpdir(), 'dbmapper-e2e-'))
const databasePath = join(workDir, 'smoke.db')

const env = {
  ...process.env,
  PORT: String(apiPort),
  DATABASE_URL: databasePath,
  DBMAPPER_ADMIN_EMAIL: adminEmail,
  DBMAPPER_ADMIN_PASSWORD: adminPassword,
  DBMAPPER_LLM_PROVIDER: 'fake',
  JWT_SECRET: 'dbmapper-e2e-secret',
  NODE_ENV: 'development',
}

function reviewedColumnCount(label: string): number {
  const match = label.match(/·\s*(\d+)\/(\d+)\s*campos/)
  if (!match) throw new Error(`Não foi possível ler a cobertura revisada: ${label}`)
  return Number(match[1])
}

function runOnce(cmd: string[]): void {
  const result = Bun.spawnSync({ cmd, cwd: root, env, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) {
    throw new Error(`Comando falhou (${result.exitCode}): ${cmd.join(' ')}`)
  }
}

async function waitForOk(url: string, label: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${url} respondeu ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await Bun.sleep(250)
  }

  throw new Error(`Tempo esgotado esperando ${label} em ${url}: ${String(lastError)}`)
}

async function waitUntil(predicate: () => boolean, label: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(50)
  }

  throw new Error(`Tempo esgotado esperando ${label}.`)
}

async function waitForDdlScript(page: Page, predicate: (script: string) => boolean, label: string): Promise<string> {
  const deadline = Date.now() + 15000
  let script = ''

  while (Date.now() < deadline) {
    script = await page
      .getByTestId('ddl-script-preview')
      .inputValue()
      .catch(() => '')
    if (predicate(script)) return script
    await Bun.sleep(100)
  }

  throw new Error(`Tempo esgotado esperando ${label}. Script atual: ${JSON.stringify(script)}`)
}

interface PersistedColumn {
  name: string
  foreign_key: boolean
}

interface PersistedRelationship {
  table: string
  local_columns: string[]
}

interface PersistedTable {
  name: string
  columns: PersistedColumn[]
  relationships: { parents: PersistedRelationship[] }
}

interface PersistedProject {
  database: { tables: PersistedTable[] }
}

async function waitForModelSave(page: Page): Promise<void> {
  const response = await page.waitForResponse(
    (candidate) => {
      if (candidate.request().method() !== 'PUT') return false
      return /^\/api\/projects\/[^/]+$/.test(new URL(candidate.url()).pathname)
    },
    { timeout: 15000 },
  )
  if (!response.ok()) throw new Error(`PUT do modelo falhou (${response.status()}).`)
}

async function waitForDiagramSave(page: Page): Promise<void> {
  const response = await page.waitForResponse(
    (candidate) => {
      if (candidate.request().method() !== 'PUT') return false
      return /^\/api\/projects\/[^/]+\/diagram$/.test(new URL(candidate.url()).pathname)
    },
    { timeout: 15000 },
  )
  if (!response.ok()) throw new Error(`PUT do diagrama falhou (${response.status()}).`)
}

async function readPersistedProject(page: Page, projectId: string): Promise<PersistedProject> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}`)
    if (!response.ok) throw new Error(`GET /api/projects/${id} falhou (${response.status}).`)
    return (await response.json()) as PersistedProject
  }, projectId)
}

function persistedTable(project: PersistedProject, name: string): PersistedTable {
  const table = project.database.tables.find((candidate) => candidate.name === name)
  if (!table) throw new Error(`A tabela ${name} não está no modelo persistido.`)
  return table
}

runOnce(['bun', 'run', '--cwd', 'apps/api', 'db:seed'])

const api = Bun.spawn(['bun', 'run', '--cwd', 'apps/api', 'start'], {
  cwd: root,
  env,
  stdout: 'inherit',
  stderr: 'inherit',
})
const web = Bun.spawn(['bun', 'run', '--cwd', 'apps/web', 'dev', '--', '--port', String(webPort), '--strictPort'], {
  cwd: root,
  env,
  stdout: 'inherit',
  stderr: 'inherit',
})

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

try {
  await waitForOk(`http://localhost:${apiPort}/health`, 'a API')
  await waitForOk(`http://localhost:${webPort}/`, 'o servidor web')

  browser = await chromium.launch()
  const page = await browser.newPage({ acceptDownloads: true })
  page.setDefaultTimeout(20000)

  const generateRequests: Array<{ scope?: string; tableId?: string }> = []
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/agent/suggestions')) return
    try {
      generateRequests.push(JSON.parse(request.postData() ?? '{}') as { scope?: string; tableId?: string })
    } catch {
      generateRequests.push({})
    }
  })

  await page.goto(`http://localhost:${webPort}/login`)
  await page.getByLabel('E-mail').fill(adminEmail)
  await page.getByLabel('Senha').fill(adminPassword)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('heading', { name: 'Seus projetos' }).waitFor()

  await page.getByRole('button', { name: 'Novo projeto' }).first().click()
  await page.getByLabel('Importar arquivo .sql').setInputFiles(exampleSqlPath)
  await page.getByRole('textbox', { name: 'Nome do projeto' }).fill('Smoke E2E')
  await page.getByRole('button', { name: 'Criar projeto' }).click()

  await page.getByTestId('table-row-users').waitFor()
  await page.waitForURL(/\/project\/[^/]+$/)
  await page.getByTestId('column-row-users-username').click()
  await page.getByRole('textbox', { name: 'Descrição' }).fill('Nome de exibição do usuário')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByText('Alterações salvas.').waitFor()
  await page.getByRole('button', { name: 'Aprovar Descrição' }).click()
  await page.getByRole('button', { name: 'Reabrir Revisão' }).waitFor()

  const reviewedBefore = reviewedColumnCount((await page.getByTestId('coverage-reviewed').textContent()) ?? '')

  await page.getByRole('button', { name: 'Sugestões IA' }).click()
  const agentPanel = page.getByRole('dialog', { name: 'Sugestões IA' })
  await agentPanel.getByRole('button', { name: 'Sugerir descrições' }).first().click()
  const scopeDialog = page.getByRole('dialog', { name: 'Sugerir descrições' })
  await scopeDialog.getByLabel('Projeto inteiro').check()
  await scopeDialog.getByRole('button', { name: 'Gerar sugestões' }).click()
  await waitUntil(() => generateRequests.length >= 1, 'a geração do projeto inteiro')
  if (generateRequests[0]?.scope !== 'project') {
    throw new Error(`Escopo inesperado na primeira geração: ${String(generateRequests[0]?.scope)}`)
  }

  const emailSuggestion = page.getByTestId('suggestion-row-users-email')
  await emailSuggestion.waitFor({ timeout: 30000 })
  await emailSuggestion.getByRole('button', { name: 'Aplicar' }).click()
  await emailSuggestion.waitFor({ state: 'detached', timeout: 20000 })
  await agentPanel.getByRole('button', { name: 'Fechar' }).click()

  await page.getByTestId('column-row-users-email').click()
  await page.waitForFunction(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea')
    return Boolean(textarea && textarea.value.trim().length > 0)
  })
  await page.getByRole('button', { name: 'Aprovar Descrição' }).click()
  await page.getByRole('button', { name: 'Reabrir Revisão' }).waitFor()

  const reviewedAfter = reviewedColumnCount((await page.getByTestId('coverage-reviewed').textContent()) ?? '')
  if (reviewedAfter <= reviewedBefore) {
    throw new Error(`A cobertura revisada não refletiu a sugestão aplicada (${reviewedBefore} -> ${reviewedAfter}).`)
  }

  await page.getByRole('button', { name: 'Sugestões IA' }).click()
  const tableScopePanel = page.getByRole('dialog', { name: 'Sugestões IA' })
  await tableScopePanel.getByRole('button', { name: 'Sugerir descrições' }).first().click()
  const tableScopeDialog = page.getByRole('dialog', { name: 'Sugerir descrições' })
  await tableScopeDialog.getByLabel(/Esta tabela/).check()
  await tableScopeDialog.getByRole('button', { name: 'Gerar sugestões' }).click()
  await tableScopeDialog.waitFor({ state: 'detached', timeout: 20000 })
  await waitUntil(() => generateRequests.length >= 2, 'a geração do escopo de tabela')

  const tableRequest = generateRequests[1]
  if (tableRequest?.scope !== 'table' || !tableRequest.tableId) {
    throw new Error(`A geração por tabela não enviou scope=table com tableId (${JSON.stringify(tableRequest)}).`)
  }
  await tableScopePanel.getByRole('button', { name: 'Fechar' }).click()

  await page.getByTestId('database-row').click()
  await page.getByTestId('view-diagram').click()
  const usersCard = page.getByTestId('diagram-node-users')
  await usersCard.waitFor()
  await page.waitForTimeout(800)

  const dragHandle = usersCard.locator('.diagram-drag-handle')
  const handleBox = await dragHandle.boundingBox()
  if (!handleBox) throw new Error('A alça de arraste do diagrama não está visível.')

  const layoutSaved = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().includes('/diagram'),
    { timeout: 15000 },
  )
  const startX = handleBox.x + handleBox.width / 2
  const startY = handleBox.y + handleBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 160, startY + 100, { steps: 12 })
  await page.mouse.up()
  await layoutSaved

  await page.getByRole('button', { name: 'Zoom In' }).click()
  await page.waitForTimeout(1200)

  const projectId = new URL(page.url()).pathname.split('/').pop()
  if (!projectId) throw new Error('Não foi possível identificar o projeto no diagrama.')

  const savedLayout = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/diagram`)
    return (await response.json()) as {
      zones: Array<{ name: string; tabOrder: number; members: string[] }>
      layouts: Array<{
        zoneName: string
        positions: Record<string, { x: number; y: number }>
        zoom: number
        viewport: { x: number; y: number }
      }>
    }
  }, projectId)

  const savedZone = savedLayout.layouts.find((layout) => layout.zoneName === 'Principal') ?? savedLayout.layouts[0]
  if (!savedZone) throw new Error('O layout salvo não contém nenhuma zona.')
  const savedUsers = savedZone.positions.users
  if (!savedUsers) throw new Error('O layout salvo não contém a posição do card users.')
  if (Math.abs(savedUsers.x - 80) < 40 && Math.abs(savedUsers.y - 80) < 40) {
    throw new Error('O arraste do card users não foi persistido no layout.')
  }
  if (Math.abs(savedZone.zoom - 1) < 0.01) throw new Error('O zoom do diagrama não foi persistido no layout.')

  await page.reload()
  await page.getByTestId('table-row-users').waitFor()
  await page.getByTestId('view-diagram').click()
  await page.getByTestId('diagram-node-users').waitFor()
  await page.waitForTimeout(1000)

  const restored = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="rf__node-users"]')
    const viewport = document.querySelector('.react-flow__viewport')
    const translate = node instanceof HTMLElement ? node.style.transform.match(/-?[\d.]+/g) : null
    const scale = viewport instanceof HTMLElement ? viewport.style.transform.match(/scale\(([\d.]+)\)/) : null
    return {
      x: translate ? Number(translate[0]) : Number.NaN,
      y: translate ? Number(translate[1]) : Number.NaN,
      zoom: scale ? Number(scale[1]) : Number.NaN,
    }
  })

  if (Math.abs(restored.x - savedUsers.x) > 3 || Math.abs(restored.y - savedUsers.y) > 3) {
    throw new Error(
      `A posição do card users não foi preservada após recarregar (${savedUsers.x},${savedUsers.y} -> ${restored.x},${restored.y}).`,
    )
  }
  if (Math.abs(restored.zoom - savedZone.zoom) > 0.02) {
    throw new Error(`O zoom do diagrama não foi preservado após recarregar (${savedZone.zoom} -> ${restored.zoom}).`)
  }

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar JSON' }).click()
  const download = await downloadPromise
  const exportedPath = await download.path()
  if (!exportedPath) throw new Error('O download do JSON exportado não gerou arquivo.')

  const exported = JSON.parse(await readFile(exportedPath, 'utf8')) as {
    database: {
      name: string
      tables: Array<{
        name: string
        columns: Array<{ name: string; description: string; reviewed: boolean }>
      }>
    }
  }

  const users = exported.database.tables.find((table) => table.name === 'users')
  const username = users?.columns.find((column) => column.name === 'username')
  if (!username) throw new Error('A coluna users.username não está no JSON exportado.')
  if (username.description !== 'Nome de exibição do usuário') {
    throw new Error(`Descrição não persistida no export: ${username.description}`)
  }
  if (username.reviewed !== true) throw new Error('A revisão aprovada não foi preservada no export.')

  const viewerMethods: string[] = []
  const trackViewerRequest = (request: import('playwright').Request) => {
    viewerMethods.push(request.method())
  }

  page.on('request', trackViewerRequest)
  await page.getByTestId('workspace-viewer-link').click()
  await page.waitForURL(/\/viewer\/[^/]+$/)
  await page.getByTestId('table-row-users').waitFor()
  await page.locator('[aria-label="Detalhe somente leitura"]').waitFor()
  page.off('request', trackViewerRequest)

  const viewerBody = (await page.locator('body').textContent()) ?? ''
  if (!viewerBody.includes('users')) throw new Error('O viewer read-only não renderizou a tabela users.')

  const mutationControls = await page
    .getByRole('button', { name: /Salvar|Aprovar|Reabrir|Importar|Atualizar modelo|Sugestões IA/i })
    .count()
  if (mutationControls > 0) {
    throw new Error(`O viewer read-only expôs ${mutationControls} controle(s) de mutação.`)
  }

  const nonGet = viewerMethods.filter((method) => method.toUpperCase() !== 'GET')
  if (nonGet.length > 0) {
    throw new Error(`O viewer emitiu método(s) não-GET: ${nonGet.join(', ')}.`)
  }

  await page.goto(`http://localhost:${webPort}/project/${projectId}`)
  await page.getByTestId('table-row-users').waitFor()
  await page.getByTestId('view-diagram').click()
  await page.getByTestId('diagram-node-users').waitFor()

  const createTable = waitForModelSave(page)
  const createTableLayout = waitForDiagramSave(page)
  await page.getByTestId('diagram-add-table').click()
  await createTable
  await createTableLayout
  await page.getByTestId('diagram-node-nova_tabela').waitFor()
  await page.getByTestId('diagram-column-nova_tabela-id').waitFor()

  await page.getByTestId('diagram-relationship-mode').click()
  await page.getByLabel('Escolher tabela nova_tabela para relacionamento').click()
  await page.getByLabel('Escolher tabela users para relacionamento').click()

  const relationshipDialog = page.getByRole('dialog', { name: 'Novo relacionamento' })
  await relationshipDialog.waitFor()
  const fkInput = relationshipDialog.getByLabel('Nome da coluna estrangeira')
  const suggestedFk = await fkInput.inputValue()
  if (suggestedFk !== 'users_id') {
    throw new Error(`Nome padrão da coluna FK inesperado: ${suggestedFk}.`)
  }
  if (!(await relationshipDialog.getByLabel('Criar coluna estrangeira').isChecked())) {
    throw new Error('A criação da coluna estrangeira não veio pré-marcada.')
  }

  const createRelationship = waitForModelSave(page)
  await relationshipDialog.getByRole('button', { name: 'Criar relacionamento' }).click()
  await createRelationship
  await page.getByTestId('diagram-column-nova_tabela-users_id').waitFor()

  const afterRelationship = persistedTable(await readPersistedProject(page, projectId), 'nova_tabela')
  const autoColumn = afterRelationship.columns.find((column) => column.name === 'users_id')
  if (!autoColumn?.foreign_key) {
    throw new Error('A coluna FK users_id não foi persistida como chave estrangeira.')
  }
  if (
    !afterRelationship.relationships.parents.some(
      (relationship) => relationship.table === 'users' && relationship.local_columns.includes('users_id'),
    )
  ) {
    throw new Error('O relacionamento nova_tabela → users não foi persistido.')
  }

  const undoRelationship = waitForModelSave(page)
  await page.getByTestId('diagram-undo').click()
  await undoRelationship
  await page.getByTestId('diagram-column-nova_tabela-users_id').waitFor({ state: 'detached' })

  const afterUndo = persistedTable(await readPersistedProject(page, projectId), 'nova_tabela')
  if (afterUndo.columns.some((column) => column.name === 'users_id')) {
    throw new Error('O undo não removeu a coluna FK criada pelo relacionamento.')
  }
  if (afterUndo.relationships.parents.length > 0) {
    throw new Error('O undo não removeu o relacionamento criado no canvas.')
  }

  await page.reload()
  await page.getByTestId('table-row-nova_tabela').waitFor()
  await page.getByTestId('view-diagram').click()
  await page.getByTestId('diagram-node-nova_tabela').waitFor()

  const persisted = persistedTable(await readPersistedProject(page, projectId), 'nova_tabela')
  if (!persisted.columns.some((column) => column.name === 'id')) {
    throw new Error('A tabela criada no canvas perdeu a coluna id após recarregar.')
  }
  if (persisted.columns.some((column) => column.name === 'users_id')) {
    throw new Error('A coluna FK removida pelo undo reapareceu após recarregar.')
  }
  if (persisted.relationships.parents.length > 0) {
    throw new Error('O relacionamento removido pelo undo reapareceu após recarregar.')
  }

  const zoneSave = waitForDiagramSave(page)
  await page.getByTestId('diagram-zone-add').click()
  await page.getByLabel('Nome da zona').fill('Geografia')
  await page.getByTestId('diagram-zone-create').click()
  await page.getByTestId('diagram-zone-tab-Geografia').waitFor()
  await zoneSave

  const dragIntoSave = waitForDiagramSave(page)
  await page
    .getByTestId('table-row-products')
    .dragTo(page.getByTestId('diagram-canvas'), { targetPosition: { x: 520, y: 360 } })
  await dragIntoSave
  await page.getByTestId('diagram-node-products').waitFor()

  const afterDragLayout = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/diagram`)
    return (await response.json()) as {
      zones: Array<{ name: string; tabOrder: number; members: string[] }>
      layouts: Array<{ zoneName: string; positions: Record<string, { x: number; y: number }> }>
    }
  }, projectId)
  const geografia = afterDragLayout.zones.find((zone) => zone.name === 'Geografia')
  if (!geografia?.members.includes('products')) {
    throw new Error('A tabela products não foi arrastada para a zona Geografia.')
  }
  if (!afterDragLayout.layouts.find((layout) => layout.zoneName === 'Geografia')?.positions.products) {
    throw new Error('A posição da tabela products não foi persistida na zona Geografia.')
  }

  const removeSave = waitForDiagramSave(page)
  await page.getByTestId('diagram-node-products').click({ button: 'right' })
  await page.getByTestId('canvas-menu-remove-from-diagram').click()
  const removeDialog = page.getByRole('dialog', { name: 'Remover do diagrama' })
  await removeDialog.waitFor()
  await removeDialog.getByRole('button', { name: 'Remover' }).click()
  await removeSave
  await page.getByTestId('diagram-node-products').waitFor({ state: 'detached' })
  await page.getByTestId('table-row-products').waitFor()
  await page.getByTestId('table-outside-products').waitFor()

  const afterRemoveLayout = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/diagram`)
    return (await response.json()) as { zones: Array<{ name: string; members: string[] }> }
  }, projectId)
  if (afterRemoveLayout.zones.some((zone) => zone.members.includes('products'))) {
    throw new Error('A tabela products continuou em alguma zona após ser removida do diagrama.')
  }
  persistedTable(await readPersistedProject(page, projectId), 'products')

  await page.getByTestId('table-row-users').click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="diagram-zone-tab-Principal"]')?.getAttribute('aria-selected') === 'true',
  )
  await page.getByTestId('diagram-node-users').waitFor()

  let exportWrites = 0
  const trackExportWrites = (request: import('playwright').Request) => {
    if (request.method() === 'PUT' && request.url().includes('/diagram')) exportWrites += 1
  }
  page.on('request', trackExportWrites)

  const pngDownload = page.waitForEvent('download', { timeout: 60000 })
  await page.getByTestId('diagram-export-png').click()
  const png = await pngDownload
  if (!png.suggestedFilename().endsWith('.png')) {
    throw new Error(`O export PNG gerou um arquivo inesperado: ${png.suggestedFilename()}.`)
  }
  if (!(await png.path())) throw new Error('O export PNG não gerou arquivo.')

  const svgDownload = page.waitForEvent('download', { timeout: 60000 })
  await page.getByTestId('diagram-export-svg').click()
  const svg = await svgDownload
  if (!svg.suggestedFilename().endsWith('.svg')) {
    throw new Error(`O export SVG gerou um arquivo inesperado: ${svg.suggestedFilename()}.`)
  }
  if (!(await svg.path())) throw new Error('O export SVG não gerou arquivo.')
  page.off('request', trackExportWrites)
  if (exportWrites > 0) {
    throw new Error('O export do diagrama emitiu requisição de save.')
  }

  await page.getByTestId('workspace-ddl-button').click()
  const ddlDialog = page.getByRole('dialog', { name: 'Gerar SQL' })
  await ddlDialog.waitFor()

  const createDdlResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' &&
      /^\/api\/projects\/[^/]+\/ddl$/.test(new URL(candidate.url()).pathname) &&
      new URL(candidate.url()).searchParams.get('mode') === 'create',
  )
  await ddlDialog.getByRole('button', { name: 'Gerar script' }).click()
  const createDdl = await createDdlResponse
  if (!createDdl.ok()) throw new Error(`Geração do script completo falhou (${createDdl.status()}).`)

  const createScript = await waitForDdlScript(
    page,
    (script) => script.includes('CREATE TABLE "users"') && script.includes('CREATE TABLE "products"'),
    'o script completo (Postgres)',
  )
  if (!createScript.includes('"username" VARCHAR(50)')) {
    throw new Error(`O script completo não trouxe users.username com o tipo do SQL importado: ${createScript}`)
  }

  await ddlDialog.getByRole('button', { name: 'Fechar' }).click()
  await ddlDialog.waitFor({ state: 'detached' })

  const updateColumn = waitForModelSave(page)
  await page.getByRole('button', { name: 'Editar coluna users.username' }).click()
  const columnDialog = page.getByRole('dialog', { name: 'Editar coluna' })
  await columnDialog.waitFor()
  await columnDialog.getByLabel('Tipo / tamanho').fill('varchar(120)')
  await columnDialog.getByRole('button', { name: 'Salvar coluna' }).click()
  await updateColumn
  await columnDialog.waitFor({ state: 'detached' })

  await page.getByTestId('workspace-ddl-button').click()
  const migrationDialog = page.getByRole('dialog', { name: 'Gerar SQL' })
  await migrationDialog.waitFor()
  await migrationDialog.getByLabel('Modo').selectOption('migration')

  const migrationResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' &&
      /^\/api\/projects\/[^/]+\/ddl$/.test(new URL(candidate.url()).pathname) &&
      new URL(candidate.url()).searchParams.get('mode') === 'migration',
  )
  await migrationDialog.getByRole('button', { name: 'Gerar script' }).click()
  const migration = await migrationResponse
  if (!migration.ok()) throw new Error(`Geração da migração falhou (${migration.status()}).`)

  const migrationScript = await waitForDdlScript(
    page,
    (script) => script.includes('ALTER TABLE "users" ALTER COLUMN "username" TYPE VARCHAR(120)'),
    'o ALTER da edição de users.username no modo migração',
  )
  await migrationDialog.getByTestId('ddl-baseline-warning').waitFor()

  const sqlDownload = page.waitForEvent('download')
  await migrationDialog.getByRole('button', { name: 'Baixar .sql' }).click()
  const downloadedSql = await sqlDownload
  if (downloadedSql.suggestedFilename() !== 'ddl-postgres-migration.sql') {
    throw new Error(`O download do DDL gerou um arquivo inesperado: ${downloadedSql.suggestedFilename()}.`)
  }
  const sqlPath = await downloadedSql.path()
  if (!sqlPath) throw new Error('O download do DDL não gerou arquivo.')
  const downloadedScript = await readFile(sqlPath, 'utf8')
  if (!downloadedScript.includes('ALTER TABLE "users" ALTER COLUMN "username" TYPE VARCHAR(120)')) {
    throw new Error(`O arquivo .sql baixado não contém o ALTER da edição: ${downloadedScript}`)
  }
  if (downloadedScript !== migrationScript) {
    throw new Error('O conteúdo do .sql baixado difere do preview exibido.')
  }

  const baselinePut = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'PUT' &&
      /^\/api\/projects\/[^/]+\/ddl\/baseline$/.test(new URL(candidate.url()).pathname),
  )
  const regenAfterCapture = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' &&
      /^\/api\/projects\/[^/]+\/ddl$/.test(new URL(candidate.url()).pathname) &&
      new URL(candidate.url()).searchParams.get('mode') === 'migration',
  )
  await migrationDialog.getByTestId('ddl-baseline-action').click()
  const baselineSaved = await baselinePut
  if (!baselineSaved.ok()) throw new Error(`PUT do baseline falhou (${baselineSaved.status()}).`)
  const regenerated = await regenAfterCapture
  if (!regenerated.ok()) throw new Error(`Regeração após sincronizar falhou (${regenerated.status()}).`)
  await migrationDialog.getByTestId('ddl-notice').waitFor()
  await waitForDdlScript(page, (script) => script.trim() === '', 'o script vazio após marcar como sincronizado')

  const afterSyncResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' &&
      /^\/api\/projects\/[^/]+\/ddl$/.test(new URL(candidate.url()).pathname) &&
      new URL(candidate.url()).searchParams.get('mode') === 'migration',
  )
  await migrationDialog.getByRole('button', { name: 'Gerar script' }).click()
  const afterSync = await afterSyncResponse
  if (afterSync.status() === 409) throw new Error('Nova geração em modo migração retornou DDL_BASELINE_MISSING.')
  if (!afterSync.ok()) throw new Error(`Nova geração em modo migração falhou (${afterSync.status()}).`)
  const afterSyncScript = await waitForDdlScript(
    page,
    (script) => script.trim() === '',
    'a nova geração sem alterações',
  )
  if (afterSyncScript.trim().length !== 0) {
    throw new Error(`A migração após sincronizar deveria estar vazia: ${afterSyncScript}`)
  }
  if ((await migrationDialog.getByTestId('ddl-error').count()) > 0) {
    throw new Error('A nova geração em modo migração exibiu erro após marcar o banco como sincronizado.')
  }

  await migrationDialog.getByRole('button', { name: 'Fechar' }).click()

  console.log(
    'E2E smoke ok: login, projeto via SQL, descrição, aprovação, agente (fake, projeto e tabela), diagrama (arraste, zoom e layout persistidos), export JSON, viewer read-only (somente GET), edição no canvas (tabela, relacionamento com FK automática, undo e modelo persistido), zonas da Fase 9 (criar aba, arrastar da árvore, remover sem excluir, localizar por outra zona e export PNG/SVG) e DDL da Fase 10 (script completo Postgres, migração após editar tipo de coluna, download .sql e marcar banco como sincronizado).',
  )
} finally {
  await browser?.close()
  web.kill()
  api.kill()
  await Promise.allSettled([web.exited, api.exited])
  await rm(workDir, { recursive: true, force: true })
}
