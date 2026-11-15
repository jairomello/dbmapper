export type SemanticStatusKey = 'missing' | 'review' | 'approved'

export interface SemanticStatus {
  key: SemanticStatusKey
  label: 'sem desc' | 'revisar' | 'aprovado'
  title: string
}

export interface DescribableItem {
  description?: string
  reviewed?: boolean
}

export function hasDescription(item: DescribableItem): boolean {
  return Boolean(item.description && item.description.trim() !== '')
}

export function getSemanticStatus(item: DescribableItem): SemanticStatus {
  if (!hasDescription(item)) {
    return { key: 'missing', label: 'sem desc', title: 'Sem descrição' }
  }

  if (item.reviewed) {
    return { key: 'approved', label: 'aprovado', title: 'Descrição revisada e aprovada' }
  }

  return { key: 'review', label: 'revisar', title: 'Descrição preenchida, aguardando revisão' }
}
