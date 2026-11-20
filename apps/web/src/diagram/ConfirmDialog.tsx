import type { ReactNode } from 'react'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-slate-950/40" onClick={onCancel} />
      <section
        className="relative w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </header>
        <div className="space-y-2 px-4 py-4 text-sm text-slate-600">
          <p>{message}</p>
          {children}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
