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
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600"
      aria-label="Barra de cobertura"
      role="status"
    >
      <span className="font-semibold text-slate-800" data-testid="coverage-db-name">
        {stats.dbName}
      </span>
      <span data-testid="coverage-tables">
        Tabelas: <strong>{stats.totalTables}</strong>
      </span>
      <span data-testid="coverage-columns">
        Campos: <strong>{stats.totalCols}</strong>
      </span>
      <span data-testid="coverage-fks">
        FKs: <strong>{stats.totalFks}</strong>
      </span>
      <span data-testid="coverage-described">
        Descritas: <strong>{stats.descTables}/{stats.totalTables}</strong> tab ({descTablesPct}%) ·{' '}
        <strong>{stats.descCols}/{stats.totalCols}</strong> campos ({descColsPct}%)
      </span>
      <span data-testid="coverage-reviewed">
        Revisados: <strong>{stats.revTables}/{stats.totalTables}</strong> tab ({revTablesPct}%) ·{' '}
        <strong>{stats.revCols}/{stats.totalCols}</strong> campos ({revColsPct}%)
      </span>
      <span data-testid="coverage-fk-described">
        FKs descritas: <strong>{stats.fksDesc}/{stats.totalFks}</strong>
      </span>
      <span data-testid="coverage-fk-reviewed">
        FKs revisadas: <strong>{stats.fksRev}/{stats.totalFks}</strong>
      </span>
      <span className="font-medium text-amber-700" data-testid="coverage-pending">
        Pendentes: <strong>{stats.pendingTotal}</strong>
      </span>
      <span className="ml-auto flex items-center gap-2" data-testid="coverage-progress">
        <span>Progresso</span>
        <span className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
          <span
            className={`block h-full ${
              stats.pct < 30 ? 'bg-amber-500' : stats.pct < 70 ? 'bg-indigo-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${stats.pct}%` }}
          />
        </span>
        <strong>{stats.pct}%</strong>
      </span>
    </footer>
  )
}
