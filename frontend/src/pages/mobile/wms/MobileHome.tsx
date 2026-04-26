import { useNavigate } from 'react-router-dom'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { Wifi, WifiOff, Clock, Package, Warehouse, ClipboardList, ArrowLeftRight, BarChart2, CheckCircle2, RefreshCw } from 'lucide-react'

const workflows = [
  { label: 'Put-Away', icon: Warehouse, to: '/mobile/wms/putaway', color: 'bg-blue-600', desc: 'Receive → Bin' },
  { label: 'Pick List', icon: ClipboardList, to: '/mobile/wms/picking', color: 'bg-green-600', desc: 'Pick orders' },
  { label: 'Stock Transfer', icon: ArrowLeftRight, to: '/mobile/wms/transfer', color: 'bg-purple-600', desc: 'Move between bins' },
  { label: 'Stock Count', icon: BarChart2, to: '/mobile/wms/count', color: 'bg-orange-500', desc: 'Count & adjust' },
  { label: 'QC / Damaged', icon: CheckCircle2, to: '/mobile/wms/qc', color: 'bg-red-600', desc: 'Pass / fail items' },
  { label: 'Scan Product', icon: Package, to: '/mobile/wms/scan', color: 'bg-gray-700', desc: 'Lookup & info' },
]

export default function MobileHome() {
  const nav = useNavigate()
  const { isOnline, pendingCount, syncNow, syncing } = useOfflineQueue()

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-safe shrink-0" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between py-3">
          <div>
            <h1 className="text-white text-2xl font-bold">Warehouse</h1>
            <p className="text-gray-400 text-sm">Scanner Mode</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && !syncing && (
              <button
                className="flex items-center gap-1.5 bg-amber-500 text-white text-sm font-bold px-3 py-2 rounded-xl active:bg-amber-600"
                onClick={() => syncNow()}
              >
                <RefreshCw className="w-4 h-4" />
                Sync {pendingCount}
              </button>
            )}
            {syncing && (
              <div className="flex items-center gap-1.5 bg-amber-500 text-white text-sm font-bold px-3 py-2 rounded-xl">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Syncing…
              </div>
            )}
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ${isOnline ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      </div>

      {/* Queue banner */}
      {!isOnline && pendingCount > 0 && (
        <div className="mx-4 mb-2 bg-amber-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          {pendingCount} scan{pendingCount !== 1 ? 's' : ''} queued — will sync when online
        </div>
      )}

      {/* Workflow grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-3 pt-2">
          {workflows.map(w => {
            const Icon = w.icon
            return (
              <button
                key={w.to}
                className={`${w.color} rounded-2xl p-5 flex flex-col items-start gap-3 active:opacity-80 transition-opacity text-left`}
                onClick={() => nav(w.to)}
              >
                <Icon className="w-9 h-9 text-white opacity-90" />
                <div>
                  <div className="text-white font-bold text-base leading-tight">{w.label}</div>
                  <div className="text-white/60 text-xs mt-0.5">{w.desc}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Desktop link */}
        <button
          className="mt-4 w-full py-3 bg-gray-800 text-gray-400 rounded-xl text-sm active:bg-gray-700"
          onClick={() => nav('/')}
        >
          ← Back to desktop view
        </button>
      </div>
    </div>
  )
}
