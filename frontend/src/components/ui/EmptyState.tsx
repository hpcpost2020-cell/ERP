import type { LucideIcon } from 'lucide-react'
export default function EmptyState({ icon: Icon, title, subtitle, action }: {
  icon?: LucideIcon; title: string; subtitle?: string; action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      {Icon && <Icon className="w-12 h-12 text-gray-300 mb-3" />}
      <h3 className="text-base font-semibold text-gray-700">{title}</h3>
      {subtitle && <p className="text-sm text-gray-400 mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
