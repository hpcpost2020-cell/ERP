import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { purchasing } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { ArrowLeft, Send, Package, XCircle } from 'lucide-react'

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const poId = Number(id)
  const [showReceive, setShowReceive] = useState(false)
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0])

  const { data: po, isLoading } = useQuery({
    queryKey: ['po', poId],
    queryFn: () => purchasing.get(poId).then(r => r.data),
  })

  const [receiveQtys, setReceiveQtys] = useState<Record<number, number>>({})

  const sendMut = useMutation({ mutationFn: () => purchasing.send(poId), onSuccess: () => qc.invalidateQueries({ queryKey: ['po', poId] }) })
  const cancelMut = useMutation({ mutationFn: () => purchasing.cancel(poId), onSuccess: () => qc.invalidateQueries({ queryKey: ['po', poId] }) })
  const receiveMut = useMutation({
    mutationFn: () => {
      const items = po?.items?.map((item: { id: number }) => ({
        po_item: item.id,
        qty_received: receiveQtys[item.id] ?? 0,
        qty_damaged: 0,
      })).filter((i: { qty_received: number }) => i.qty_received > 0) || []
      return purchasing.receive(poId, { received_date: receiveDate, items })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['po', poId] }); setShowReceive(false) }
  })

  if (isLoading) return <Loading />
  if (!po) return <div>PO not found</div>

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/purchasing')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">{po.po_number}</h1>
            <div className="flex items-center gap-2 mt-1"><StatusBadge status={po.status} /><span className="text-sm text-gray-500">{po.supplier_name}</span></div>
          </div>
        </div>
        <div className="flex gap-2">
          {po.status === 'draft' && <button className="btn-primary" onClick={() => sendMut.mutate()}><Send className="w-4 h-4" /> Send to Supplier</button>}
          {['sent','acknowledged','part_received'].includes(po.status) && <button className="btn-success" onClick={() => setShowReceive(true)}><Package className="w-4 h-4" /> Receive Goods</button>}
          {!['received','closed','cancelled'].includes(po.status) && <button className="btn-danger" onClick={() => { if(confirm('Cancel PO?')) cancelMut.mutate() }}><XCircle className="w-4 h-4" /> Cancel</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="card-header"><span className="font-semibold">Order Lines</span><span className="font-semibold text-brand-700">{fmt.currency(po.total_value)}</span></div>
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th>Ordered</th><th>Received</th><th>Outstanding</th><th>Unit Cost</th><th>Line Total</th></tr></thead>
              <tbody>
                {po.items?.map((item: { id: number; product_sku: string; product_title: string; qty_ordered: number; qty_received: number; qty_outstanding: number; unit_cost: number; line_total: number }) => (
                  <tr key={item.id}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{item.product_sku}</span></td>
                    <td className="font-medium">{item.product_title}</td>
                    <td>{item.qty_ordered}</td>
                    <td className="text-green-600">{item.qty_received}</td>
                    <td className={item.qty_outstanding > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>{item.qty_outstanding}</td>
                    <td>{fmt.currency(item.unit_cost)}</td>
                    <td className="font-medium">{fmt.currency(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {po.goods_receipts?.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="font-semibold">Goods Receipts</span></div>
              {po.goods_receipts?.map((gr: { id: number; receipt_number: string; received_date: string; received_by_name: string; notes: string }) => (
                <div key={gr.id} className="p-4 border-b border-gray-100 last:border-0">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{gr.receipt_number}</span>
                    <span className="text-gray-500">{fmt.shortDate(gr.received_date)} · {gr.received_by_name}</span>
                  </div>
                  {gr.notes && <div className="text-xs text-gray-500 mt-1">{gr.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="card card-body">
            <h3 className="font-semibold mb-3">Order Details</h3>
            <div className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Supplier</span><span className="font-medium">{po.supplier_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Order Date</span><span>{fmt.shortDate(po.order_date)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className={po.is_overdue ? 'text-red-600 font-semibold' : ''}>{fmt.shortDate(po.expected_delivery_date) || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Payment Terms</span><span>{po.payment_terms || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Supplier Ref</span><span>{po.supplier_reference || '—'}</span></div>
              {po.notes && <div className="pt-2 border-t text-gray-500">{po.notes}</div>}
            </div>
          </div>
        </div>
      </div>

      {showReceive && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReceive(false)}>
          <div className="modal max-w-lg">
            <div className="modal-header"><h2>Receive Goods</h2><button onClick={() => setShowReceive(false)}>✕</button></div>
            <div className="modal-body space-y-4">
              <div><label className="label">Receipt Date</label><input className="input" type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} /></div>
              <div className="space-y-2">
                {po.items?.map((item: { id: number; product_sku: string; product_title: string; qty_outstanding: number }) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.product_title}</div>
                      <div className="text-xs text-gray-400">{item.product_sku} · Outstanding: {item.qty_outstanding}</div>
                    </div>
                    <input type="number" min="0" max={item.qty_outstanding}
                      value={receiveQtys[item.id] ?? 0}
                      onChange={e => setReceiveQtys(p => ({ ...p, [item.id]: Number(e.target.value) }))}
                      className="input w-24 text-center" />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowReceive(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => receiveMut.mutate()} className="btn-success" disabled={receiveMut.isPending}><Package className="w-4 h-4" /> Confirm Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
