import type { DatabaseModel } from '@dbmapper/domain'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { projectsApi } from '../api/projects'
import type { ProjectView } from '../api/types'
import { PROJECTS_QUERY_KEY, projectQueryKey } from '../projects/queries'
import type { CanvasCommand } from './commands'
import { CommandQueue } from './commandQueue'

export type DiagramSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface DiagramSaveState {
  status: DiagramSaveStatus
  savedAt: Date | null
  error: string | null
}

export const INITIAL_SAVE_STATE: DiagramSaveState = {
  status: 'idle',
  savedAt: null,
  error: null,
}

export interface UseDiagramEditingOptions {
  projectId: string
  database: DatabaseModel
  canEdit: boolean
  locked?: boolean
  onSaveStateChange?: (state: DiagramSaveState) => void
}

export interface DiagramEditing {
  database: DatabaseModel
  canUndo: boolean
  canRedo: boolean
  saveState: DiagramSaveState
  execute: (command: CanvasCommand) => boolean
  undo: () => boolean
  redo: () => boolean
}

function fingerprint(database: DatabaseModel): string {
  return JSON.stringify(database)
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Não foi possível salvar as alterações.'
}

export function useDiagramEditing({
  projectId,
  database,
  canEdit,
  locked = false,
  onSaveStateChange,
}: UseDiagramEditingOptions): DiagramEditing {
  const queryClient = useQueryClient()
  const [working, setWorking] = useState<DatabaseModel>(database)
  const workingRef = useRef<DatabaseModel>(database)
  const externalRef = useRef<DatabaseModel>(database)
  externalRef.current = database
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [saveState, setSaveState] = useState<DiagramSaveState>(INITIAL_SAVE_STATE)

  useEffect(() => {
    workingRef.current = working
  }, [working])

  const queueRef = useRef<CommandQueue<ProjectView> | null>(null)

  const queue = useMemo(() => {
    const save = async (snapshot: DatabaseModel): Promise<ProjectView> => {
      const saved = await projectsApi.save(projectId, snapshot)
      queryClient.setQueryData(projectQueryKey(saved.id), saved)
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      return saved
    }

    return new CommandQueue<ProjectView>({
      database: workingRef.current,
      save,
      onDatabaseChange: (next) => {
        workingRef.current = next
        setWorking(next)
        setCanUndo(Boolean(queueRef.current?.canUndo))
        setCanRedo(Boolean(queueRef.current?.canRedo))
      },
      onSaved: () => {
        setSaveState({ status: 'saved', savedAt: new Date(), error: null })
      },
      onError: (error) => {
        const external = externalRef.current
        queueRef.current?.reset(external)
        workingRef.current = external
        setWorking(external)
        setSaveState({ status: 'error', savedAt: null, error: messageOf(error) })
        setCanUndo(false)
        setCanRedo(false)
        queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
      },
      onStatusChange: (status) => {
        if (status === 'saving') {
          setSaveState({ status: 'saving', savedAt: null, error: null })
        }
      },
    })
  }, [projectId, queryClient])

  queueRef.current = queue

  useEffect(() => {
    if (fingerprint(database) === fingerprint(workingRef.current)) return
    if (queue.isBusy) return
    queue.reset(database)
    workingRef.current = database
    setWorking(database)
    setCanUndo(false)
    setCanRedo(false)
  }, [database, queue])

  useEffect(() => {
    onSaveStateChange?.(saveState)
  }, [saveState, onSaveStateChange])

  const execute = useCallback(
    (command: CanvasCommand) => {
      if (!canEdit || locked) return false
      queue.execute(command)
      return true
    },
    [canEdit, locked, queue],
  )

  const undo = useCallback(() => {
    if (!canEdit || locked) return false
    queue.undo()
    return true
  }, [canEdit, locked, queue])

  const redo = useCallback(() => {
    if (!canEdit || locked) return false
    queue.redo()
    return true
  }, [canEdit, locked, queue])

  return { database: working, canUndo, canRedo, saveState, execute, undo, redo }
}
