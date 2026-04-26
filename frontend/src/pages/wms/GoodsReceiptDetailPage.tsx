import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { purchasing } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { useState } from 'react'

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
}

interface Receipt {
  id: number
  purchase_order: number
  receipt_number: string
  received_date: string
  delivery_note_ref: string
  notes: string
  received_by_name: string
  created_at: string
  items: QcItem[]
}

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const receiptId = Number(id)
  const [failId, setFailId] = useState<number | null>(null)
  const [failReason, setFailReason] = useState('')
  const [quarantineId, setQuarantineId] = useState<number | null>(null)
  const [quarantineNotes, setQuarantineNotes] = useState('')

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => purchasing.receipt(receiptId).then(r => r.data as Receipt),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['receipt', receiptId] })
    qc.invalidateQueries({ queryKey: ['qc-pending'] })
  }

  const passQc = useMutation({
    mutationFn: (itemId: number) => purchasing.qcPass(itemId, {}),
    onSuccess: () => { invalidate(); toast('QC Passed ✓', 'success') },
    onError: () => toast('Failed to record', 'error'),
  })

  const failQc = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: number; reason: string }) =>
      purchasing.qcFail(itemId, { qc_fail_reason: reason }),
    onSuccess: () => { invalidate(); toast('QC Failed — item flagged', 'error'); setFailId(null); setFailReason('') },
    onError: () => toast('Failed to record', 'error'),
  })

  const quarantineQc = useMutation({
    mutationFn: ({ itemId, notes }: { itemId: number; notes: string }) =>
      purchasing.qcQuarantine(itemId, { qc_notes: notes }),
    onSuccess: () => { invalidate(); toast('Item quarantined', 'info'); setQuarantineId(null); setQuarantineNotes('') },
    onError: () => toast('Failed to record', 'error'),
  })

  if (isLoading) return <Loading />
  if (!receipt) return <div className="text-red-500 p-8">Receipt not found</div>

  const items = receipt.items || []
  const pendingCount = items.filter(i => i.qc_status === 'pending').length
  const passedCount = items.filter(i => i.qc_status === 'passed').length
  const failedCount = items.filter(i => i.qc_status === 'failed').length
  const quarantinedCount = items.filter(i => i.qc_status === 'quarantined').length

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/wms/goods-in')} className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="page-title">{receipt.receipt_number}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">PO: <span className="font-mono">#{receipt.purchase_order}</span></span>
            </div>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => nav(`/purchasing/${receipt.purchase_order}`)}>
          View Purchase Order →
        </button>
      </div>

      {/* QC summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card card-body text-center">
          <div className={`text-xl font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{pendingCount}</div>
          <div className="text-xs text-gray-500">Pending QC</div>
        </div>
        <div className="card card-body text-center">
          <div className="text-xl font-bold text-green-600">{passedCount}</div>
          <div className="text-xs text-gray-500">Passed</div>
        </div>
        <div className="card card-body text-center">
          <div className={`text-xl font-bold ${failedCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{failedCount}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
        <div className="card card-body text-center">
          <div className={`text-xl font-bold ${quarantinedCount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{quarantinedCount}</div>
          <div className="text-xs text-gray-500">Quarantined</div>
        </div>
      </div>

      {/* Receipt info */}
      <div className="card card-body grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block text-xs">Received Date</span><div className="font-medium">{fmt.shortDate(receipt.received_date)}</div></div>
        <div><span className="text-gray-500 block text-xs">Delivery Note</span><div className="font-mono text-sm">{receipt.delivery_note_ref || '—'}</div></div>
        <div><span className="text-gray-500 block text-xs">Received By</span><div className="font-medium">{receipt.received_by_name || '—'}</div></div>
        {receipt.notes && <div><span className="text-gray-500 block text-xs">Notes</span><div>{receipt.notes}</div></div>}
      </div>

      {/* Items QC table */}
      <div className="card">
        <div className="card-header">
          <span className="font-semibold">Items — QC Inspection</span>
          {pendingCount > 0 && <span className="badge badge-yellow">{pendingCount} pending</span>}
          {pendingCount === 0 && items.length > 0 && <span className="badge badge-green">All inspected</span>}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>SKU / Product</th>
                <th className="text-right">Received</th>
                <th className="text-right">Damaged</th>
                <th>QC Status</th>
                <th>Inspector</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8">No items in this receipt</td></tr>
              )}
              {items.map(item => (
                <>
                  <tr key={item.id} className={item.qc_status === 'pending' ? 'bg-amber-50/40' : ''}>
                    <td>
                      <div className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded inline-block mb-0.5">{item.product_sku}</div>
                      <div className="font-medium text-sm">{item.product_title}</div>
                      {item.product_barcode && <div className="text-xs text-gray-400 font-mono">{item.product_barcode}</div>}
                      {item.qc_fail_reason && <div className="text-xs text-red-600 font-medium mt-0.5">✗ {item.qc_fail_reason}</div>}
                      {item.qc_notes && <div className="text-xs text-gray-500 mt-0.5 italic">{item.qc_notes}</div>}
                    </td>
                    <td className="text-right font-semibold">{item.qty_received}</td>
                    <td className={`text-right ${item.qty_damaged > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{item.qty_damaged || 0}</td>
                    <td><StatusBadge status={item.qc_status} /></td>
                    <td className="text-xs text-gray-500">
                      {item.qc_checked_by_name ? (
                        <div>
                          <div>{item.qc_checked_by_name}</div>
                          <div className="text-gray-400">{fmt.datetime(item.qc_checked_at)}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      {item.qc_status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            title="Pass QC"
                            className="btn btn-sm bg-green-50 border border-green-300 text-green-700 hover:bg-green-100 px-2"
                            onClick={() => { setFailId(null); setQuarantineId(null); passQc.mutate(item.id) }}
                            disabled={passQc.isPending}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            title="Fail QC"
                            className="btn btn-sm bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 px-2"
                            onClick={() => { setFailId(item.id); setQuarantineId(null); setFailReason('') }}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button
                            title="Quarantine"
                            className="btn btn-sm bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 px-2"
                            onClick={() => { setQuarantineId(item.id); setFailId(null); setQuarantineNotes('') }}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline fail reason input */}
                  {failId === item.id && (
                    <tr key={`fail-${item.id}`} className="bg-red-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                          <span className="text-sm font-medium text-red-700 whitespace-nowrap">Fail reason *</span>
                          <input
                            className="input flex-1 text-sm h-8 border-red-300"
                            autoFocus
                            placeholder="Describe the issue (required)..."
                            value={failReason}
                            onChange={e => setFailReason(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && failReason.trim()) failQc.mutate({ itemId: item.id, reason: failReason })
                              if (e.key === 'Escape') { setFailId(null); setFailReason('') }
                            }}
                          />
                          <button
                            className="btn btn-sm bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                            onClick={() => failReason.trim() && failQc.mutate({ itemId: item.id, reason: failReason })}
                            disabled={!failReason.trim() || failQc.isPending}
                          >Confirm Fail</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setFailId(null); setFailReason('') }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline quarantine notes */}
                  {quarantineId === item.id && (
                    <tr key={`quar-${item.id}`} className="bg-amber-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-sm font-medium text-amber-700 whitespace-nowrap">Quarantine notes</span>
                          <input
                            className="input flex-1 text-sm h-8 border-amber-300"
                            autoFocus
                            placeholder="Reason for quarantine (optional)..."
                            value={quarantineNotes}
                            onChange={e => setQuarantineNotes(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') quarantineQc.mutate({ itemId: item.id, notes: quarantineNotes })
                              if (e.key === 'Escape') { setQuarantineId(null); setQuarantineNotes('') }
                            }}
                          />
                          <button
                            className="btn btn-sm bg-amber-500 text-white hover:bg-amber-600"
                            onClick={() => quarantineQc.mutate({ itemId: item.id, notes: quarantineNotes })}
                            disabled={quarantineQc.isPending}
                          >Quarantine</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setQuarantineId(null); setQuarantineNotes('') }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
