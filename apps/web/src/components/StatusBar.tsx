import type { DatabaseModel } from '@dbmapper/domain'
import { computeStats, percentage } from '../lib/coverage'

export function StatusBar({ database }: { database: DatabaseModel }) {
  const stats = computeStats(database)
  const descTablesPct = percentage(stats.descTables, stats.totalTables)
  const descColsPct = percentage(stats.descCols, stats.totalCols)
  const revTablesPct = percentage(stats.revTables, stats.totalTables)
  const revColsPct = percentage(stats.revCols, stats.totalCols)

  return (
    <footer
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-4 py-2 text-xs text-muted"
      aria-label="Barra de cobertura"
      role="status"
    >
      <span className="font-semibold text-ink" data-testid="coverage-db-name">
        {stats.dbName}
      </span>
      <span data-testid="coverage-tables">
        Tabelas: <strong className="text-ink">{stats.totalTables}</strong>
      </span>
      <span data-testid="coverage-columns">
        Campos: <strong className="text-ink">{stats.totalCols}</strong>
      </span>
      <span data-testid="coverage-fks">
        FKs: <strong className="text-ink">{stats.totalFks}</strong>
      </span>
      <span data-testid="coverage-described">
        Descritas:{' '}
        <strong className="text-ink">
          {stats.descTables}/{stats.totalTables}
        </strong>{' '}
        tab ({descTablesPct}%) ·{' '}
        <strong className="text-ink">
          {stats.descCols}/{stats.totalCols}
        </strong>{' '}
        campos ({descColsPct}%)
      </span>
      <span data-testid="coverage-reviewed">
        Revisados:{' '}
        <strong className="text-ink">
          {stats.revTables}/{stats.totalTables}
        </strong>{' '}
        tab ({revTablesPct}%) ·{' '}
        <strong className="text-ink">
          {stats.revCols}/{stats.totalCols}
        </strong>{' '}
        campos ({revColsPct}%)
      </span>
      <span data-testid="coverage-fk-described">
        FKs descritas:{' '}
        <strong className="text-ink">
          {stats.fksDesc}/{stats.totalFks}
        </strong>
      </span>
      <span data-testid="coverage-fk-reviewed">
        FKs revisadas:{' '}
        <strong className="text-ink">
          {stats.fksRev}/{stats.totalFks}
        </strong>
      </span>
      <span className="font-medium text-warning" data-testid="coverage-pending">
        Pendentes: <strong>{stats.pendingTotal}</strong>
      </span>
      <span className="ml-auto flex items-center gap-2" data-testid="coverage-progress">
        <span>Progresso</span>
        <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
          <span
            className={`block h-full ${
              stats.pct < 30 ? 'bg-amber-500' : stats.pct < 70 ? 'bg-indigo-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${stats.pct}%` }}
          />
        </span>
        <strong className="text-ink">{stats.pct}%</strong>
      </span>
    </footer>
  )
}
