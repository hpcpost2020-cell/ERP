import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Wifi, WifiOff, Clock } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  onBack?: string | (() => void)
  children: ReactNode
  footer?: ReactNode
  isOnline?: boolean
  pendingCount?: number
}

export default function MobileLayout({ title, subtitle, onBack, children, footer, isOnline = true, pendingCount = 0 }: Props) {
  const nav = useNavigate()
  const handleBack = typeof onBack === 'string' ? () => nav(onBack) : onBack

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 text-white flex items-center gap-1 shrink-0"
        style={{ padding: 'max(12px, env(safe-area-inset-top)) 8px 12px' }}>
        {handleBack && (
          <button className="p-2 rounded-xl active:bg-gray-700 shrink-0" onClick={handleBack}>
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
        <div className="flex-1 min-w-0 px-1">
          <h1 className="text-lg font-bold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400 truncate leading-tight">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 pr-1">
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              <Clock className="w-3 h-3" />
              {pendingCount}
            </div>
          )}
          {isOnline
            ? <Wifi className="w-5 h-5 text-green-400" />
            : <WifiOff className="w-5 h-5 text-red-400" />}
        </div>
      </div>

      {!isOnline && (
        <div className="bg-amber-500 text-white text-xs font-semibold px-4 py-2 text-center shrink-0">
          OFFLINE — {pendingCount > 0 ? `${pendingCount} scan${pendingCount !== 1 ? 's' : ''} queued` : 'scans will queue until reconnected'}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {footer && (
        <div className="shrink-0 bg-white border-t-2 border-gray-200 px-4 py-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  )
}
