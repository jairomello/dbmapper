import type { DatabaseModel } from '@dbmapper/domain'
import type { DescriptionSource, ExportSources } from '../api/types'
import { resolveSelection, type Selection, selectionBreadcrumb } from '../lib/selection'
import { SemanticBadge } from './SemanticBadge'

const KIND_LABEL = { database: 'Banco', table: 'Tabela', column: 'Coluna' } as const

const SOURCE_LABEL: Record<DescriptionSource, string> = {
  human: 'Humano',
  agent: 'IA',
  mcp: 'MCP',
}

const SOURCE_CLASSES: Record<DescriptionSource, string> = {
  human: 'bg-slate-100 text-slate-700',
  agent: 'bg-purple-100 text-purple-800',
  mcp: 'bg-sky-100 text-sky-800',
}

interface ViewerDetailProps {
  database: DatabaseModel
  sources?: ExportSources
  selection: Selection
}

function sourceFor(sources: ExportSources | undefined, selection: Selection): DescriptionSource {
  if (!sources) return 'human'
  if (selection.type === 'database') return sources.project
  if (selection.type === 'table') return sources.tables[selection.table] ?? 'human'
  return sources.columns[selection.table]?.[selection.column] ?? 'human'
}

export function ViewerDetail({ database, sources, selection }: ViewerDetailProps) {
  const resolved = resolveSelection(database, selection)

  if (!resolved) {
    return (
      <section className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
        Selecione um item na árvore para inspecionar seus metadados.
      </section>
    )
  }

  const breadcrumb = selectionBreadcrumb(database, selection).reduce<Array<{ label: string; key: string }>>(
    (entries, part) => {
      const key = entries.length === 0 ? part : `${entries[entries.length - 1].key} / ${part}`
      entries.push({ label: part, key })
      return entries
    },
    [],
  )
  const description = resolved.item.description ?? ''
  const terms = resolved.item.business_terms ?? []
  const source = sourceFor(sources, selection)

  return (
    <section className="flex h-full flex-col overflow-auto" aria-label="Detalhe somente leitura">
      <header className="border-b border-slate-200 px-5 py-3">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
          {breadcrumb.map((entry, index) => (
            <span key={entry.key} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <span className={index === breadcrumb.length - 1 ? 'font-medium text-slate-700' : undefined}>
                {entry.label}
              </span>
            </span>
          ))}
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {KIND_LABEL[resolved.kind]}
          </span>
          <h2 className="truncate text-lg font-semibold text-ink">{resolved.item.name}</h2>
          <SemanticBadge item={resolved.item} />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_CLASSES[source]}`}
            data-testid="viewer-source-badge"
          >
            Fonte: {SOURCE_LABEL[source]}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-6 px-5 py-5">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Descrição</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700" data-testid="viewer-description">
            {description.trim() ? description : 'Sem descrição.'}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-700">Termos de negócio</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {terms.length === 0 ? <p className="text-xs text-slate-400">Nenhum termo registrado.</p> : null}
            {terms.map((term) => (
              <span key={term} className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
                {term}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-sm bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Revisão: {resolved.item.reviewed ? 'aprovada por revisão humana' : 'pendente de revisão humana'}
        </div>
      </div>
    </section>
  )
}
