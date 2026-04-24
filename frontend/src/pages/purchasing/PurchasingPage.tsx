import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { purchasing } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { Plus, Eye, AlertTriangle } from 'lucide-react'

export default function PurchasingPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const nav = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', page, search, status],
    queryFn: () => purchasing.list({ page, search, status: status || undefined }).then(r => r.data),
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Purchase Orders</h1><p className="page-subtitle">{data?.count || 0} purchase orders</p></div>
        <button className="btn-primary" onClick={() => nav('/purchasing/new')}><Plus className="w-4 h-4" /> New PO</button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="PO number, supplier..." />
            <select className="select w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
              <option value="">All Statuses</option>
              {['draft','sent','acknowledged','part_received','received','closed','cancelled'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>PO Number</th><th>Supplier</th><th>Date</th><th>Expected</th><th>Value</th><th>Items</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data?.results?.map((po: { id: number; po_number: string; supplier_name: string; order_date: string; expected_delivery_date: string; total_value: number; items_count: number; status: string; is_overdue: boolean }) => (
                <tr key={po.id}>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{po.po_number}</span></td>
                  <td className="font-medium">{po.supplier_name}</td>
                  <td className="text-xs text-gray-500">{fmt.shortDate(po.order_date)}</td>
                  <td className={`text-xs ${po.is_overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {fmt.shortDate(po.expected_delivery_date)}
                    {po.is_overdue && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                  </td>
                  <td className="font-medium">{fmt.currency(po.total_value)}</td>
                  <td>{po.items_count}</td>
                  <td><StatusBadge status={po.status} /></td>
                  <td><button onClick={() => nav(`/purchasing/${po.id}`)} className="btn btn-secondary btn-sm"><Eye className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={50} total={data?.count || 0} onPage={setPage} />
      </div>
    </div>
  )
}
