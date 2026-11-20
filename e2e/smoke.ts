import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

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
      positions: Record<string, { x: number; y: number }>
      zoom: number
      viewport: { x: number; y: number }
    }
  }, projectId)

  const savedUsers = savedLayout.positions.users
  if (!savedUsers) throw new Error('O layout salvo não contém a posição do card users.')
  if (Math.abs(savedUsers.x - 80) < 40 && Math.abs(savedUsers.y - 80) < 40) {
    throw new Error('O arraste do card users não foi persistido no layout.')
  }
  if (Math.abs(savedLayout.zoom - 1) < 0.01) throw new Error('O zoom do diagrama não foi persistido no layout.')

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
  if (Math.abs(restored.zoom - savedLayout.zoom) > 0.02) {
    throw new Error(`O zoom do diagrama não foi preservado após recarregar (${savedLayout.zoom} -> ${restored.zoom}).`)
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

  console.log(
    'E2E smoke ok: login, projeto via SQL, descrição, aprovação, agente (fake, projeto e tabela), diagrama (arraste, zoom e layout persistidos), export JSON e viewer read-only (somente GET).',
  )
} finally {
  await browser?.close()
  web.kill()
  api.kill()
  await Promise.allSettled([web.exited, api.exited])
  await rm(workDir, { recursive: true, force: true })
}
