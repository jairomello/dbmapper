import { toPng, toSvg } from 'html-to-image'

export type DiagramExportFormat = 'png' | 'svg'

const EXPORT_OPTIONS = {
  pixelRatio: 2,
  cacheBust: true,
} as const

export function diagramFileName(zone: string, format: DiagramExportFormat): string {
  const slug = zone
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `diagrama-${slug || 'zona'}.${format}`
}

export async function renderDiagram(
  element: HTMLElement,
  format: DiagramExportFormat,
  backgroundColor?: string,
): Promise<string> {
  const options = backgroundColor ? { ...EXPORT_OPTIONS, backgroundColor } : EXPORT_OPTIONS
  return format === 'png' ? toPng(element, options) : toSvg(element, options)
}

export function downloadDiagram(dataUrl: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
