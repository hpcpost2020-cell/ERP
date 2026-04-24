import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { sales } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { ShoppingCart, Plus, Eye } from 'lucide-react'

const CHANNEL_BADGE: Record<string, string> = {
  ebay: 'badge-red', amazon: 'badge-orange', woocommerce: 'badge-green',
  direct: 'badge-blue', wholesale: 'badge-purple', phone: 'badge-gray'
}

export default function SalesOrdersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const nav = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['sales-orders', page, search, status, channel],
    queryFn: () => sales.list({ page, search, status: status || undefined, channel: channel || undefined }).then(r => r.data),
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Orders</h1>
          <p className="page-subtitle">{data?.count || 0} orders across all channels</p>
        </div>
        <button className="btn-primary" onClick={() => nav('/sales/new')}><Plus className="w-4 h-4" /> New Order</button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex flex-wrap gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Order #, customer, tracking..." />
            <select className="select w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
              <option value="">All Statuses</option>
              {['pending','confirmed','processing','awaiting_dispatch','dispatched','delivered','completed','cancelled','on_hold','refunded'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
            <select className="select w-36" value={channel} onChange={e => { setChannel(e.target.value); setPage(1) }}>
              <option value="">All Channels</option>
              {['ebay','amazon','woocommerce','direct','wholesale','phone'].map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        {data?.results?.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders found" /> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Order #</th><th>Customer</th><th>Channel</th><th>Date</th><th>Value</th><th>Payment</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {data?.results?.map((o: { id: number; order_number: string; customer_name: string; channel: string; created_at: string; total_value: number; payment_status: string; status: string }) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/sales/${o.id}`)}>
                      <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{o.order_number}</span></td>
                      <td className="font-medium max-w-[160px] truncate">{o.customer_name || '—'}</td>
                      <td><span className={CHANNEL_BADGE[o.channel] || 'badge-gray'}>{o.channel}</span></td>
                      <td className="text-gray-500 text-xs">{fmt.shortDate(o.created_at)}</td>
                      <td className="font-semibold">{fmt.currency(o.total_value)}</td>
                      <td><StatusBadge status={o.payment_status} /></td>
                      <td><StatusBadge status={o.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <button onClick={() => nav(`/sales/${o.id}`)} className="btn btn-secondary btn-sm"><Eye className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={50} total={data?.count || 0} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
