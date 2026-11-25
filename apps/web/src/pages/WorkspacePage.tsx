import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePendingSuggestions } from '../agent/queries'
import { authApi } from '../api/auth'
import { projectsApi } from '../api/projects'
import type { ProjectView } from '../api/types'
import type { DatabaseModel } from '@dbmapper/domain'
import { SESSION_QUERY_KEY, useSession } from '../auth/session'
import { DdlDialog } from '../components/DdlDialog'
import { DiagramCanvas } from '../components/DiagramCanvas'
import { JsonTransfer } from '../components/JsonTransfer'
import { MetadataEditor } from '../components/MetadataEditor'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { RenameProjectDialog } from '../components/RenameProjectDialog'
import { SemanticTree } from '../components/SemanticTree'
import { StatusBar } from '../components/StatusBar'
import { SuggestionPanel } from '../components/SuggestionPanel'
import { UpdateWizard } from '../components/UpdateWizard'
import { INITIAL_SAVE_STATE, type DiagramSaveState } from '../diagram/useDiagramEditing'
import { useDiagramZones } from '../diagram/useDiagramZones'
import type { Selection } from '../lib/selection'
import { PROJECTS_QUERY_KEY, projectQueryKey, useProject } from '../projects/queries'
import { ThemeToggle } from '../theme/ThemeToggle'
import { useTheme } from '../theme/theme'

function formatSavedAt(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

const HEADER_BUTTON =
  'inline-flex items-center gap-2 rounded-md border border-white/25 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()
  const projectId = id ?? ''
  const project = useProject(projectId)
  const { theme, toggleTheme } = useTheme()

  const [selection, setSelection] = useState<Selection>({ type: 'database' })
  const [view, setView] = useState<'editor' | 'diagrama'>('editor')
  const [isEditorPanelOpen, setIsEditorPanelOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isDdlOpen, setIsDdlOpen] = useState(false)
  const [isAgentOpen, setIsAgentOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [diagramSaveState, setDiagramSaveState] = useState<DiagramSaveState>(INITIAL_SAVE_STATE)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const pendingSuggestions = usePendingSuggestions(projectId)
  const pendingCount = pendingSuggestions.data?.suggestions.length ?? 0
  const canEditDiagram = session.data?.role === 'MEMBER' || session.data?.role === 'ADMIN'
  const diagramTableCount = project.data
    ? project.data.database.tables.filter((table) => table.status !== 'REMOVED').length
    : 0
  const diagramZones = useDiagramZones({
    projectId,
    database: project.data?.database,
    canEdit: canEditDiagram,
    locked: isWizardOpen,
    enabled: view === 'diagrama',
  })

  useEffect(() => {
    if (view === 'diagrama' && selection.type !== 'database') setIsEditorPanelOpen(true)
  }, [view, selection])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsEditorPanelOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const menu = menuRef.current
      if (!menu?.open) return
      if (menu.contains(event.target as Node)) return
      menu.open = false
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && menuRef.current?.open) menuRef.current.open = false
    }
    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const saveProject = useMutation({
    mutationFn: (database: DatabaseModel) => {
      if (!projectId) throw new Error('Nenhum projeto selecionado.')
      return projectsApi.save(projectId, database)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(projectQueryKey(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    },
  })

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY })
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  function selectItem(next: Selection) {
    setSelection(next)
    if (next.type === 'database') setIsEditorPanelOpen(false)
  }

  function adoptProject(createdId: string) {
    queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
    setSelection({ type: 'database' })
    navigate(`/project/${encodeURIComponent(createdId)}`)
  }

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false
  }

  const saveStatus =
    diagramSaveState.status === 'saving'
      ? 'Salvando...'
      : diagramSaveState.status === 'saved' && diagramSaveState.savedAt
        ? `Salvo às: ${formatSavedAt(diagramSaveState.savedAt)}`
        : diagramSaveState.status === 'error'
          ? `Falha ao salvar: ${diagramSaveState.error}`
          : 'Pronto'

  return (
    <div className="flex h-screen flex-col bg-bg text-ink">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-header px-4 py-2.5 text-header-ink">
        <Link to="/" className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10">
          <img src="/icon.svg" alt="" width={24} height={24} className="h-6 w-6" />
          <span className="text-sm font-semibold tracking-wide">DBMapper</span>
        </Link>

        <nav aria-label="Trilha de navegação" className="flex min-w-0 items-center gap-1.5 text-xs text-white/60">
          <Link to="/" className="rounded px-1 hover:text-white">
            Projetos
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate font-medium text-white/90" data-testid="workspace-breadcrumb-project">
            {project.data?.name ?? 'Carregando…'}
          </span>
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={HEADER_BUTTON}
            onClick={() => setIsAgentOpen(true)}
            disabled={!projectId || !project.data}
            aria-label="Sugestões IA"
          >
            Sugestões IA
            {pendingCount > 0 ? (
              <span
                className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-ink"
                data-testid="agent-pending-badge"
              >
                {pendingCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            className={HEADER_BUTTON}
            onClick={() => setIsWizardOpen(true)}
            disabled={!project.data}
          >
            Atualizar modelo
          </button>

          <details className="relative" ref={menuRef}>
            <summary className={`${HEADER_BUTTON} list-none cursor-pointer`} data-testid="project-actions-menu">
              Ações do projeto
              <span aria-hidden="true" className="text-[10px]">
                ▾
              </span>
            </summary>
            <div
              role="menu"
              aria-label="Ações do projeto"
              className="absolute right-0 z-50 mt-2 w-64 space-y-1 rounded-lg border border-line bg-surface p-2 text-ink shadow-xl"
            >
              {canEditDiagram && project.data ? (
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-surface-2"
                  onClick={() => {
                    closeMenu()
                    setIsRenaming(true)
                  }}
                  data-testid="workspace-rename-button"
                >
                  Renomear projeto
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-surface-2"
                onClick={() => {
                  closeMenu()
                  setIsCreating(true)
                }}
              >
                Novo projeto
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                onClick={() => {
                  closeMenu()
                  setIsDdlOpen(true)
                }}
                disabled={!projectId || !project.data}
                data-testid="workspace-ddl-button"
              >
                Gerar SQL
              </button>
              <div className="border-t border-line pt-1">
                <JsonTransfer
                  projectId={projectId}
                  onImported={(imported) => {
                    closeMenu()
                    queryClient.setQueryData(projectQueryKey(imported.id), imported)
                    adoptProject(imported.id)
                  }}
                />
              </div>
              {projectId && project.data ? (
                <Link
                  to={`/viewer/${encodeURIComponent(projectId)}`}
                  role="menuitem"
                  className="block rounded-md px-3 py-2 text-xs font-medium hover:bg-surface-2"
                  onClick={closeMenu}
                  data-testid="workspace-viewer-link"
                >
                  Visualização
                </Link>
              ) : null}
            </div>
          </details>

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <span className="hidden text-xs text-white/60 sm:inline">{session.data?.email}</span>
          <button
            type="button"
            className={HEADER_BUTTON}
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sair
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-hidden border-r border-line bg-surface md:flex lg:w-72">
          {project.data ? (
            <SemanticTree
              database={project.data.database}
              selection={selection}
              onSelect={selectItem}
              zones={diagramZones.zones}
              canMoveTables={canEditDiagram && view === 'diagrama' && !isWizardOpen}
            />
          ) : (
            <div className="p-4 text-sm text-muted">Carregando projeto…</div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {project.data ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
                <fieldset
                  className="inline-flex rounded-md border border-line-strong bg-surface-2 p-0.5"
                  aria-label="Modo de visualização"
                >
                  <button
                    type="button"
                    className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                      view === 'editor' ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                    aria-pressed={view === 'editor'}
                    onClick={() => setView('editor')}
                    data-testid="view-editor"
                  >
                    Dicionário
                  </button>
                  <button
                    type="button"
                    className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                      view === 'diagrama' ? 'bg-accent text-accent-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                    aria-pressed={view === 'diagrama'}
                    onClick={() => setView('diagrama')}
                    data-testid="view-diagram"
                  >
                    Diagrama
                  </button>
                </fieldset>

                <div className="hidden min-w-0 flex-col md:flex">
                  <h1 className="truncate font-serif text-lg leading-tight text-ink">
                    {canEditDiagram ? (
                      <button
                        type="button"
                        className="max-w-full truncate rounded-sm text-left hover:text-accent"
                        onClick={() => setIsRenaming(true)}
                        title="Renomear projeto"
                        data-testid="workspace-project-name"
                      >
                        {project.data.name}
                      </button>
                    ) : (
                      project.data.name
                    )}
                  </h1>
                  <p className="truncate text-[11px] text-muted">
                    {view === 'diagrama' ? `Zona ${diagramZones.activeZone}` : 'Dicionário'} /{' '}
                    {selection.type === 'database'
                      ? project.data.database.name
                      : `${selection.table}${selection.type === 'column' ? ` / ${selection.column}` : ''}`}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-3 text-xs">
                  {view === 'diagrama' ? (
                    <>
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                          diagramSaveState.status === 'error' ? 'text-red-600' : 'text-muted'
                        }`}
                        data-testid="diagram-save-indicator"
                        role={diagramSaveState.status === 'error' ? 'alert' : 'status'}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            diagramSaveState.status === 'error'
                              ? 'bg-red-500'
                              : diagramSaveState.status === 'saving'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                        />
                        {saveStatus}
                      </span>
                      <span className="font-medium text-muted" data-testid="diagram-table-count">
                        {diagramTableCount} {diagramTableCount === 1 ? 'tabela' : 'tabelas'}
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-line-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
                        onClick={() => setIsEditorPanelOpen((current) => !current)}
                        aria-expanded={isEditorPanelOpen}
                        data-testid="diagram-editor-toggle"
                      >
                        {isEditorPanelOpen ? 'Ocultar ficha' : 'Abrir ficha'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                  {view === 'editor' ? (
                    <MetadataEditor
                      database={project.data.database}
                      selection={selection}
                      onSave={saveProject.mutateAsync}
                      isSaving={saveProject.isPending}
                    />
                  ) : (
                    <DiagramCanvas
                      projectId={projectId}
                      database={project.data.database}
                      selection={selection}
                      onSelect={selectItem}
                      canEdit={canEditDiagram}
                      locked={isWizardOpen}
                      onSaveStateChange={setDiagramSaveState}
                      zones={diagramZones}
                    />
                  )}
                </div>

                {view === 'diagrama' && isEditorPanelOpen ? (
                  <aside
                    className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-[min(92vw,380px)] max-xl:shadow-2xl"
                    data-testid="diagram-editor-panel"
                    aria-label="Ficha do item"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Ficha do item
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-line-strong px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
                        onClick={() => setIsEditorPanelOpen(false)}
                        aria-label="Fechar ficha"
                      >
                        Fechar
                      </button>
                    </div>
                    <div className="min-h-0 flex-1">
                      <MetadataEditor
                        database={project.data.database}
                        selection={selection}
                        onSave={saveProject.mutateAsync}
                        isSaving={saveProject.isPending}
                        zones={diagramZones.zones}
                        onToggleZone={
                          canEditDiagram
                            ? (table, zone, member) => {
                                if (member) diagramZones.addTableToZone(table, zone)
                                else diagramZones.removeTableFromZone(table, zone)
                              }
                            : undefined
                        }
                      />
                    </div>
                  </aside>
                ) : null}
              </div>

              <StatusBar database={project.data.database} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted">
              Carregando o projeto…
            </div>
          )}
        </main>
      </div>

      {isCreating ? (
        <NewProjectDialog
          onClose={() => setIsCreating(false)}
          onCreated={(created) => {
            setIsCreating(false)
            adoptProject(created.id)
          }}
        />
      ) : null}

      {isWizardOpen && project.data ? (
        <UpdateWizard
          projectId={project.data.id}
          onClose={() => setIsWizardOpen(false)}
          onApplied={(applied) => {
            queryClient.setQueryData(projectQueryKey(applied.id), applied)
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
          }}
        />
      ) : null}

      {isDdlOpen && projectId ? (
        <DdlDialog projectId={projectId} role={session.data?.role} onClose={() => setIsDdlOpen(false)} />
      ) : null}

      {isAgentOpen && projectId ? (
        <SuggestionPanel
          projectId={projectId}
          selection={selection}
          tableIds={project.data?.table_ids ?? {}}
          role={session.data?.role}
          activeJobId={activeJobId}
          onJobStarted={setActiveJobId}
          onClose={() => setIsAgentOpen(false)}
        />
      ) : null}

      {isRenaming && project.data ? (
        <RenameProjectDialog
          project={project.data}
          onClose={() => setIsRenaming(false)}
          onRenamed={(renamed) => {
            setIsRenaming(false)
            queryClient.setQueryData(projectQueryKey(renamed.id), (current: ProjectView | undefined) =>
              current ? { ...current, name: renamed.name, updatedAt: renamed.updatedAt } : current,
            )
            queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
          }}
        />
      ) : null}
    </div>
  )
}
