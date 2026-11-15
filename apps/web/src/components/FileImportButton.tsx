import { type ChangeEvent, type DragEvent, useState } from 'react'

interface FileImportButtonProps {
  label: string
  accept?: string
  description?: string
  disabled?: boolean
  onFile: (file: File, text: string) => void | Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Não foi possível ler o arquivo.'
}

export function FileImportButton({
  label,
  accept = '.sql,.json,text/plain',
  description,
  disabled = false,
  onFile,
}: FileImportButtonProps) {
  const [isReading, setIsReading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function readFile(file: File) {
    setError(null)
    setIsReading(true)
    try {
      const text = await file.text()
      await onFile(file, text)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setIsReading(false)
    }
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) await readFile(file)
    event.target.value = ''
  }

  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (disabled || isReading) return
    const file = event.dataTransfer.files?.[0]
    if (file) await readFile(file)
  }

  return (
    <div className="space-y-1">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed px-4 py-3 text-center text-sm transition ${
          isDragging ? 'border-accent bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-accent hover:bg-white'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <span className="font-semibold text-accent">{isReading ? 'Lendo arquivo…' : label}</span>
        {description ? <span className="text-xs text-slate-500">{description}</span> : null}
        <input
          className="hidden"
          type="file"
          accept={accept}
          aria-label={label}
          onChange={(event) => void handleChange(event)}
          disabled={disabled || isReading}
        />
      </label>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
