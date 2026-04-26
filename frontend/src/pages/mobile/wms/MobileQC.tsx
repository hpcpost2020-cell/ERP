import { useState } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { purchasing } from '../../../api/endpoints'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Loading from '../../../components/ui/Loading'
import { CheckCircle2, XCircle, AlertTriangle, Package } from 'lucide-react'

interface QcItem {
  id: number
  product_id: number
  product_sku: string
  product_title: string
  product_barcode: string
  qty_received: number
  qc_status: string
  qc_fail_reason?: string
}

type QcAction = 'pass' | 'fail' | 'quarantine'

export default function MobileQC() {
  const { isOnline, pendingCount, executeOrQueue } = useOfflineQueue()
  const { success, error } = useScanFeedback()
  const qc = useQueryClient()

  const [selected, setSelected] = useState<QcItem | null>(null)
  const [action, setAction] = useState<QcAction | null>(null)
  const [failReason, setFailReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['mobile-qc-pending'],
    queryFn: () => purchasing.qcPending().then(r => r.data),
    refetchInterval: 30000,
  })
  const items: QcItem[] = Array.isArray(data) ? data : data?.results || []

  const showFlash = (type: 'success' | 'error') => {
    setFlash(type)
    setTimeout(() => setFlash(null), 600)
  }

  const handleAction = async () => {
    if (!selected || !action) return
    if (action === 'fail' && !failReason.trim()) { setSaveError('Fail reason is required'); error(); return }
    setSaving(true)
    setSaveError('')
    try {
      const opType = action === 'pass' ? 'qc_pass' : action === 'fail' ? 'qc_fail' : 'qc_quarantine'
      const payload: Record<string, unknown> = { id: selected.id, qc_notes: notes }
      if (action === 'fail') payload.qc_fail_reason = failReason
      await executeOrQueue(opType, payload)
      success()
      showFlash('success')
      qc.invalidateQueries({ queryKey: ['mobile-qc-pending'] })
      setSelected(null); setAction(null); setFailReason(''); setNotes('')
    } catch { setSaveError('Save failed — try again'); error(); showFlash('error') }
    finally { setSaving(false) }
  }

  const actionColors = {
    pass: 'bg-green-600',
    fail: 'bg-red-600',
    quarantine: 'bg-amber-500',
  }
  const actionLabels = { pass: '✓ Pass', fail: '✗ Fail', quarantine: '⚠ Quarantine' }

  return (
    <MobileLayout
      title="QC / Damaged"
      subtitle={selected ? selected.product_sku : `${items.length} items pending`}
      onBack={selected ? () => { setSelected(null); setAction(null); setFailReason(''); setNotes('') } : '/mobile/wms'}
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className={`transition-colors duration-200 min-h-full ${flash === 'success' ? 'bg-green-50' : flash === 'error' ? 'bg-red-50' : ''}`}>
        <div className="p-4 space-y-4">

          {/* Item list */}
          {!selected && (
            <>
              {isLoading && <div className="py-12"><Loading /></div>}
              {!isLoading && items.length === 0 && (
                <div className="text-center py-16">
                  <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-semibold text-lg">All clear!</p>
                  <p className="text-gray-400 text-sm mt-1">No items awaiting QC</p>
                </div>
              )}
              {!isLoading && items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wide px-1">Pending QC ({items.length})</p>
                  {items.map(item => (
                    <button
                      key={item.id}
                      className="w-full bg-white rounded-2xl p-4 text-left active:bg-gray-50 flex items-start gap-3"
                      onClick={() => setSelected(item)}
                    >
                      <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                        <Package className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono font-bold text-gray-800">{item.product_sku}</p>
                        <p className="text-sm text-gray-500 truncate">{item.product_title}</p>
                        {item.product_barcode && <p className="text-xs text-gray-400 font-mono">{item.product_barcode}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-800 text-lg">{item.qty_received}</p>
                        <p className="text-xs text-gray-400">rcvd</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* QC action screen */}
          {selected && (
            <div className="space-y-4">
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              )}

              {/* Product detail */}
              <div className="bg-white rounded-2xl p-4 space-y-2">
                <p className="font-mono font-bold text-blue-700 text-2xl">{selected.product_sku}</p>
                <p className="text-gray-700">{selected.product_title}</p>
                {selected.product_barcode && <p className="text-xs text-gray-400 font-mono">{selected.product_barcode}</p>}
                <div className="flex gap-4 pt-2 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400">Received</p>
                    <p className="font-bold text-gray-800 text-xl">{selected.qty_received}</p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                {(['pass', 'fail', 'quarantine'] as QcAction[]).map(a => (
                  <button
                    key={a}
                    className={`py-5 rounded-2xl font-bold text-white text-sm active:opacity-80 transition-opacity
                      ${action === a ? actionColors[a] + ' ring-4 ring-offset-2 ring-' + (a === 'pass' ? 'green' : a === 'fail' ? 'red' : 'amber') + '-400' : 'bg-gray-200 text-gray-600'}`}
                    onClick={() => setAction(a)}
                  >
                    {a === 'pass' && <CheckCircle2 className="w-6 h-6 mx-auto mb-1" />}
                    {a === 'fail' && <XCircle className="w-6 h-6 mx-auto mb-1" />}
                    {a === 'quarantine' && <AlertTriangle className="w-6 h-6 mx-auto mb-1" />}
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>

              {action === 'fail' && (
                <div className="bg-white rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fail Reason *</p>
                  <textarea
                    className="w-full border-2 border-gray-300 rounded-xl p-3 text-base focus:border-red-500 focus:outline-none resize-none"
                    rows={3}
                    placeholder="Describe the defect or reason for failure…"
                    value={failReason}
                    onChange={e => setFailReason(e.target.value)}
                    inputMode="text"
                    autoFocus
                  />
                </div>
              )}

              <div className="bg-white rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Notes (optional)</p>
                <input
                  className="w-full border-2 border-gray-200 rounded-xl p-3 text-base focus:border-blue-500 focus:outline-none"
                  placeholder="Additional notes…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  inputMode="text"
                />
              </div>

              <button
                className={`w-full py-6 rounded-2xl text-xl font-bold text-white active:opacity-80 disabled:opacity-40
                  ${action ? actionColors[action] : 'bg-gray-300 text-gray-500'}`}
                onClick={handleAction}
                disabled={!action || saving}
              >
                {saving ? 'Saving…' : action ? actionLabels[action] : 'Select an action above'}
              </button>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  )
}
