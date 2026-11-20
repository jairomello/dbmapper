export interface CanvasMenuItem {
  label: string
  testId?: string
  danger?: boolean
  onSelect: () => void
}

export interface CanvasContextMenuProps {
  x: number
  y: number
  items: CanvasMenuItem[]
  onClose: () => void
}

export function CanvasContextMenu({ x, y, items, onClose }: CanvasContextMenuProps) {
  if (items.length === 0) return null

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Fechar menu de contexto"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div
        role="menu"
        className="absolute z-10 min-w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            data-testid={item.testId}
            className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100 ${
              item.danger ? 'text-red-700' : 'text-slate-700'
            }`}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
