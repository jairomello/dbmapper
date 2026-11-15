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
  JWT_SECRET: 'dbmapper-e2e-secret',
  NODE_ENV: 'development',
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

  console.log('E2E smoke ok: login, projeto via SQL, descrição, aprovação e export JSON.')
} finally {
  await browser?.close()
  web.kill()
  api.kill()
  await Promise.allSettled([web.exited, api.exited])
  await rm(workDir, { recursive: true, force: true })
}
