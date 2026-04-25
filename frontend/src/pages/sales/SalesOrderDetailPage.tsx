import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sales, invoicing } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/Toast'
import { ArrowLeft, Truck, XCircle, FileText, MessageSquare } from 'lucide-react'

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const orderId = Number(id)
  const [note, setNote] = useState('')
  const [showDispatch, setShowDispatch] = useState(false)
  const [dispatchForm, setDispatchForm] = useState({ tracking_number: '', courier: 'evri', cost: '' })

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => sales.get(orderId).then(r => r.data),
  })

  const dispatchMut = useMutation({
    mutationFn: (d: unknown) => sales.dispatch(orderId, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', orderId] }); setShowDispatch(false); toast('Order dispatched', 'success') },
    onError: () => toast('Failed to dispatch order', 'error'),
  })
  const cancelMut = useMutation({
    mutationFn: () => sales.cancel(orderId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', orderId] }); toast('Order cancelled', 'info') },
    onError: () => toast('Failed to cancel order', 'error'),
  })
  const addNoteMut = useMutation({
    mutationFn: (content: string) => sales.addNote(orderId, { content, note_type: 'internal' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', orderId] }); setNote(''); toast('Note added', 'success') },
    onError: () => toast('Failed to add note', 'error'),
  })
  const createInvoiceMut = useMutation({
    mutationFn: () => invoicing.createFromOrder(orderId),
    onSuccess: (res) => { toast('Invoice created', 'success'); nav(`/invoicing/${res.data.id}`) },
    onError: () => toast('Failed to create invoice', 'error'),
  })

  if (isLoading) return <Loading />
  if (!order) return <div className="text-red-500">Order not found</div>

  const canDispatch = ['pending','confirmed','processing','awaiting_dispatch'].includes(order.status)
  const canCancel = !['dispatched','delivered','completed'].includes(order.status)

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/sales')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">{order.order_number}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={order.status} />
              <StatusBadge status={order.payment_status} />
              <span className="badge badge-gray">{order.channel}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canDispatch && <button className="btn-primary" onClick={() => setShowDispatch(true)}><Truck className="w-4 h-4" /> Dispatch</button>}
          {!order.invoices?.length && <button className="btn-secondary" onClick={() => createInvoiceMut.mutate()}><FileText className="w-4 h-4" /> Create Invoice</button>}
          {canCancel && <button className="btn-danger" onClick={() => { if(confirm('Cancel this order?')) cancelMut.mutate() }}><XCircle className="w-4 h-4" /> Cancel</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div className="card">
            <div className="card-header"><span className="font-semibold">Order Items</span></div>
            <table>
              <thead>
                <tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
              </thead>
              <tbody>
                {order.items?.map((item: { id: number; sku: string; title: string; quantity: number; unit_price: number; line_total: number }) => (
                  <tr key={item.id}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{item.sku}</span></td>
                    <td className="font-medium">{item.title}</td>
                    <td>{item.quantity}</td>
                    <td>{fmt.currency(item.unit_price)}</td>
                    <td className="font-semibold">{fmt.currency(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-1">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{fmt.currency(order.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span>{fmt.currency(order.vat_amount)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Shipping</span><span>{fmt.currency(order.shipping_cost)}</span></div>
              {order.discount_amount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount</span><span>-{fmt.currency(order.discount_amount)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>{fmt.currency(order.total_value)}</span></div>
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <div className="card-header"><span className="font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Notes</span></div>
            <div className="p-4 space-y-3">
              {order.order_notes?.map((n: { id: number; note_type: string; content: string; created_by_name: string; created_at: string }) => (
                <div key={n.id} className={`p-3 rounded-lg text-sm ${n.note_type === 'system' ? 'bg-gray-50 text-gray-500' : 'bg-blue-50 text-blue-800'}`}>
                  <div className="font-medium text-xs mb-1">{n.note_type} · {n.created_by_name} · {fmt.datetime(n.created_at)}</div>
                  {n.content}
                </div>
              ))}
              <div className="flex gap-2">
                <textarea className="input flex-1 text-sm" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add internal note..." />
                <button className="btn-primary self-end" onClick={() => note && addNoteMut.mutate(note)}>Add</button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="card card-body">
            <h3 className="font-semibold mb-3">Customer</h3>
            <div className="text-sm space-y-1">
              <div className="font-medium">{order.ship_to_name}</div>
              {order.ship_to_company && <div className="text-gray-500">{order.ship_to_company}</div>}
              <div className="text-gray-500">{order.ship_to_email}</div>
              <div className="text-gray-500">{order.ship_to_phone}</div>
            </div>
          </div>
          <div className="card card-body">
            <h3 className="font-semibold mb-3">Delivery Address</h3>
            <div className="text-sm text-gray-600 space-y-0.5">
              <div>{order.ship_to_address1}</div>
              {order.ship_to_address2 && <div>{order.ship_to_address2}</div>}
              <div>{order.ship_to_city}</div>
              <div>{order.ship_to_postcode}</div>
              <div>{order.ship_to_country}</div>
            </div>
          </div>
          <div className="card card-body">
            <h3 className="font-semibold mb-3">Order Details</h3>
            <div className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{fmt.shortDate(order.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Channel</span><span className="capitalize">{order.channel}</span></div>
              {order.dispatched_date && <div className="flex justify-between"><span className="text-gray-500">Dispatched</span><span>{fmt.shortDate(order.dispatched_date)}</span></div>}
              {order.marketplace_order_id && <div className="flex justify-between"><span className="text-gray-500">Marketplace ID</span><span className="text-xs">{order.marketplace_order_id}</span></div>}
            </div>
          </div>
          {order.shipments?.length > 0 && (
            <div className="card card-body">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Truck className="w-4 h-4" /> Shipment</h3>
              {order.shipments?.map((s: { id: number; courier: string; tracking_number: string; status: string; cost: number; tracking_link: string }) => (
                <div key={s.id} className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Courier</span><span className="capitalize">{s.courier.replace('_',' ')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tracking</span>
                    {s.tracking_link ? <a href={s.tracking_link} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-mono text-xs">{s.tracking_number}</a>
                      : <span className="font-mono text-xs">{s.tracking_number || '—'}</span>}
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Status</span><StatusBadge status={s.status} /></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cost</span><span>{fmt.currency(s.cost)}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatch && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDispatch(false)}>
          <div className="modal max-w-md">
            <div className="modal-header"><h2>Dispatch Order</h2><button onClick={() => setShowDispatch(false)}>✕</button></div>
            <form onSubmit={e => { e.preventDefault(); dispatchMut.mutate(dispatchForm) }}>
              <div className="modal-body space-y-4">
                <div><label className="label">Courier</label>
                  <select className="select" value={dispatchForm.courier} onChange={e => setDispatchForm(p => ({ ...p, courier: e.target.value }))}>
                    {['evri','royal_mail','dpd','dhl','ups','yodel','parcelforce','other'].map(c => <option key={c} value={c}>{c.replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase())}</option>)}
                  </select>
                </div>
                <div><label className="label">Tracking Number</label><input className="input" value={dispatchForm.tracking_number} onChange={e => setDispatchForm(p => ({ ...p, tracking_number: e.target.value }))} /></div>
                <div><label className="label">Shipping Cost (£)</label><input className="input" type="number" step="0.01" value={dispatchForm.cost} onChange={e => setDispatchForm(p => ({ ...p, cost: e.target.value }))} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowDispatch(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={dispatchMut.isPending}><Truck className="w-4 h-4" /> Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
