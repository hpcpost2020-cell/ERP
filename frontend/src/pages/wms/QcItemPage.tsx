import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { purchasing } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { fmt } from '../../utils/format'
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react'

interface QcItem {
  id: number
  product_sku: string
  product_title: string
  product_barcode: string
  qty_received: number
  qty_damaged: number
  notes: string
  qc_status: string
  qc_checked_by_name: string
  qc_checked_at: string
  qc_notes: string
  qc_fail_reason: string
  is_available_for_stock: boolean
  po_item: number
}

export default function QcItemPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const itemId = Number(id)

  const [failReason, setFailReason] = useState('')
  const [passNotes, setPassNotes] = useState('')
  const [quarantineNotes, setQuarantineNotes] = useState('')
  const [showFailForm, setShowFailForm] = useState(false)
  const [showQuarantineForm, setShowQuarantineForm] = useState(false)
  const [showPassNotes, setShowPassNotes] = useState(false)

  const { data: theItem, isLoading } = useQuery({
    queryKey: ['qc-item', itemId],
    queryFn: () => purchasing.qcItem(itemId).then(r => r.data as QcItem),
  })

  const passQc = useMutation({
    mutationFn: () => purchasing.qcPass(itemId, { qc_notes: passNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qc-pending'] })
      qc.invalidateQueries({ queryKey: ['qc-item', itemId] })
      toast('QC Passed ✓ — item ready for stock', 'success')
      setShowPassNotes(false)
      setPassNotes('')
    },
    onError: () => toast('Failed to pass QC', 'error'),
  })

  const failQc = useMutation({
    mutationFn: () => purchasing.qcFail(itemId, { qc_fail_reason: failReason, qc_notes: '' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qc-pending'] })
      qc.invalidateQueries({ queryKey: ['qc-item', itemId] })
      toast('QC Failed — item flagged for investigation', 'error')
      setShowFailForm(false)
      setFailReason('')
    },
    onError: () => toast('Failed to fail QC', 'error'),
  })

  const quarantineQc = useMutation({
    mutationFn: () => purchasing.qcQuarantine(itemId, { qc_notes: quarantineNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qc-pending'] })
      qc.invalidateQueries({ queryKey: ['qc-item', itemId] })
      toast('Item quarantined — pending investigation', 'info')
      setShowQuarantineForm(false)
      setQuarantineNotes('')
    },
    onError: () => toast('Failed to quarantine', 'error'),
  })

  if (isLoading) return <Loading />
  if (!theItem) return (
    <div className="text-center p-12">
      <p className="text-red-500 mb-4">QC item #{itemId} not found</p>
      <button onClick={() => nav('/wms/goods-in')} className="btn-secondary">← Back to Goods In</button>
    </div>
  )

  const isPending = theItem.qc_status === 'pending'

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/wms/goods-in')} className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="page-title">QC Inspection</h1>
            <p className="page-subtitle">Item #{itemId}</p>
          </div>
        </div>
      </div>

      {/* Item details card */}
      <div className="card card-body space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono font-bold text-lg">{theItem.product_sku}</span>
              <StatusBadge status={theItem.qc_status} />
            </div>
            <p className="text-gray-700 font-medium">{theItem.product_title}</p>
            {theItem.product_barcode && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">{theItem.product_barcode}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-700">{theItem.qty_received}</div>
            <div className="text-xs text-gray-500">Qty Received</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${theItem.qty_damaged > 0 ? 'text-red-600' : 'text-gray-400'}`}>{theItem.qty_damaged}</div>
            <div className="text-xs text-gray-500">Damaged</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${theItem.is_available_for_stock ? 'text-green-600' : 'text-gray-400'}`}>
              {theItem.is_available_for_stock ? '✓' : '—'}
            </div>
            <div className="text-xs text-gray-500">In Stock</div>
          </div>
        </div>

        {theItem.notes && (
          <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
            <span className="font-medium">Receipt notes:</span> {theItem.notes}
          </div>
        )}
      </div>

      {/* QC result (already inspected) */}
      {!isPending && (
        <div className={`card card-body space-y-3 border-2 ${
          theItem.qc_status === 'passed' ? 'border-green-200 bg-green-50' :
          theItem.qc_status === 'failed' ? 'border-red-200 bg-red-50' :
          'border-amber-200 bg-amber-50'
        }`}>
          <div className="flex items-center gap-2">
            {theItem.qc_status === 'passed' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            {theItem.qc_status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
            {theItem.qc_status === 'quarantined' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
            <span className="font-semibold capitalize">QC {theItem.qc_status}</span>
          </div>
          <div className="text-sm space-y-1 text-gray-700">
            {theItem.qc_checked_by_name && (
              <div><span className="text-gray-500">Checked by:</span> {theItem.qc_checked_by_name}</div>
            )}
            {theItem.qc_checked_at && (
              <div><span className="text-gray-500">Checked at:</span> {fmt.datetime(theItem.qc_checked_at)}</div>
            )}
            {theItem.qc_fail_reason && (
              <div><span className="text-gray-500">Fail reason:</span> <span className="text-red-700 font-medium">{theItem.qc_fail_reason}</span></div>
            )}
            {theItem.qc_notes && (
              <div><span className="text-gray-500">Notes:</span> {theItem.qc_notes}</div>
            )}
          </div>
        </div>
      )}

      {/* QC action buttons */}
      {isPending && (
        <div className="card card-body space-y-4">
          <h3 className="font-semibold text-gray-800">QC Decision</h3>
          <p className="text-sm text-gray-500">Inspect the goods and record your QC decision below.</p>

          {/* Pass */}
          {!showFailForm && !showQuarantineForm && (
            <div className="space-y-2">
              {showPassNotes ? (
                <div className="space-y-2">
                  <label className="label">Pass notes (optional)</label>
                  <textarea
                    className="input w-full text-sm"
                    rows={2}
                    placeholder="e.g. All items match PO, packaging intact..."
                    value={passNotes}
                    onChange={e => setPassNotes(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
                      onClick={() => passQc.mutate()}
                      disabled={passQc.isPending}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      {passQc.isPending ? 'Saving...' : 'Confirm Pass'}
                    </button>
                    <button className="btn-secondary px-4" onClick={() => { setShowPassNotes(false); setPassNotes('') }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex items-center justify-center gap-3 py-4 bg-green-50 border-2 border-green-300 rounded-xl text-green-800 font-semibold text-lg hover:bg-green-100 transition-colors"
                  onClick={() => setShowPassNotes(true)}
                >
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  Pass QC
                </button>
              )}
            </div>
          )}

          {/* Fail */}
          {!showPassNotes && !showQuarantineForm && (
            <div>
              {showFailForm ? (
                <div className="space-y-2">
                  <label className="label">Fail reason * <span className="text-red-500">(required)</span></label>
                  <input
                    className="input"
                    placeholder="e.g. Damaged packaging, wrong product, qty mismatch..."
                    value={failReason}
                    onChange={e => setFailReason(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn flex-1 py-3 bg-red-600 text-white hover:bg-red-700 rounded-xl font-semibold flex items-center justify-center gap-2"
                      onClick={() => failQc.mutate()}
                      disabled={!failReason.trim() || failQc.isPending}
                    >
                      <XCircle className="w-5 h-5" />
                      {failQc.isPending ? 'Saving...' : 'Confirm Fail'}
                    </button>
                    <button className="btn-secondary px-4" onClick={() => { setShowFailForm(false); setFailReason('') }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex items-center justify-center gap-3 py-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 font-semibold text-lg hover:bg-red-100 transition-colors"
                  onClick={() => setShowFailForm(true)}
                >
                  <XCircle className="w-6 h-6 text-red-600" />
                  Fail QC
                </button>
              )}
            </div>
          )}

          {/* Quarantine */}
          {!showPassNotes && !showFailForm && (
            <div>
              {showQuarantineForm ? (
                <div className="space-y-2">
                  <label className="label">Quarantine notes</label>
                  <input
                    className="input"
                    placeholder="e.g. Awaiting supplier response, pending return..."
                    value={quarantineNotes}
                    onChange={e => setQuarantineNotes(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn flex-1 py-3 bg-amber-500 text-white hover:bg-amber-600 rounded-xl font-semibold flex items-center justify-center gap-2"
                      onClick={() => quarantineQc.mutate()}
                      disabled={quarantineQc.isPending}
                    >
                      <AlertTriangle className="w-5 h-5" />
                      {quarantineQc.isPending ? 'Saving...' : 'Confirm Quarantine'}
                    </button>
                    <button className="btn-secondary px-4" onClick={() => { setShowQuarantineForm(false); setQuarantineNotes('') }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex items-center justify-center gap-3 py-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-800 font-semibold hover:bg-amber-100 transition-colors"
                  onClick={() => setShowQuarantineForm(true)}
                >
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  Quarantine (Hold for Investigation)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button onClick={() => nav('/wms/goods-in')} className="btn-secondary flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to Goods In
      </button>
    </div>
  )
}
