import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const guardedDirectories = ['apps/api/src/routes', 'apps/api/src/services']
const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

function isForbidden(specifier: string): boolean {
  if (specifier === 'drizzle-orm' || specifier.startsWith('drizzle-orm/')) return true
  return /(^|\/)db\/schema$/.test(specifier)
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await listTypeScriptFiles(path)))
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(path)
      }
    }

    return files
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function main(): Promise<void> {
  const violations: string[] = []

  for (const directory of guardedDirectories) {
    const files = await listTypeScriptFiles(join(projectRoot, directory))

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      const lines = content.split('\n')

      lines.forEach((line, index) => {
        importPattern.lastIndex = 0
        let match = importPattern.exec(line)
        while (match !== null) {
          if (isForbidden(match[1])) {
            violations.push(`${relative(projectRoot, file)}:${index + 1} imports ${match[1]}`)
          }
          match = importPattern.exec(line)
        }
      })
    }
  }

  if (violations.length > 0) {
    console.error('Persistence boundary violation: routes/services must not import drizzle-orm or db/schema.')
    for (const violation of violations) console.error(`  ${violation}`)
    process.exit(1)
  }

  console.log('Persistence boundaries ok: routes/services only depend on persistence ports.')
}

await main()
