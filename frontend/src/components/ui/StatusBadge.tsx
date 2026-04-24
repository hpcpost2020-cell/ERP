import { statusColors, statusLabel } from '../../utils/format'

export default function StatusBadge({ status }: { status: string }) {
  const cls = statusColors[status] || 'badge-gray'
  const label = statusLabel[status] || status.replace(/_/g, ' ')
  return <span className={cls}>{label}</span>
}
