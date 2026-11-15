import { getSemanticStatus, type DescribableItem } from '../lib/semantic-status'

const BADGE_CLASSES = {
  missing: 'bg-amber-100 text-amber-800',
  review: 'bg-sky-100 text-sky-800',
  approved: 'bg-emerald-100 text-emerald-800',
} as const

export function SemanticBadge({ item }: { item: DescribableItem }) {
  const status = getSemanticStatus(item)

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE_CLASSES[status.key]}`}
      title={status.title}
      data-status={status.key}
    >
      {status.label}
    </span>
  )
}
