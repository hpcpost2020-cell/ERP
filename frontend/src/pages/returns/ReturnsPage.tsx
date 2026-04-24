import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { returns } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { CheckCircle, Package } from 'lucide-react'

export default function ReturnsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['returns', page, search, status],
    queryFn: () => returns.list({ page, search, status: status || undefined }).then(r => r.data),
  })

  const approveMut = useMutation({ mutationFn: (id: number) => returns.approve(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['returns'] }) })
  const receiveMut = useMutation({ mutationFn: (id: number) => returns.markReceived(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['returns'] }) })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Returns & Refunds</h1><p className="page-subtitle">{data?.count || 0} return requests</p></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="RMA number, order..." />
            <select className="select w-44" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['requested','approved','awaiting_return','received','inspected','refunded','replacement_sent','rejected','closed'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>RMA #</th><th>Order</th><th>Customer</th><th>Reason</th><th>Refund</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {data?.results?.map((r: { id: number; rma_number: string; order_number: string; customer_name: string; reason: string; refund_amount: number; status: string; created_at: string }) => (
                <tr key={r.id}>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.rma_number}</span></td>
                  <td><span className="font-mono text-xs">{r.order_number}</span></td>
                  <td className="font-medium">{r.customer_name || '—'}</td>
                  <td><span className="badge badge-yellow">{r.reason?.replace(/_/g,' ')}</span></td>
                  <td>{r.refund_amount > 0 ? fmt.currency(r.refund_amount) : '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-xs text-gray-500">{fmt.shortDate(r.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      {r.status === 'requested' && <button onClick={() => approveMut.mutate(r.id)} className="btn btn-success btn-sm"><CheckCircle className="w-3 h-3" /> Approve</button>}
                      {r.status === 'approved' && <button onClick={() => receiveMut.mutate(r.id)} className="btn btn-secondary btn-sm"><Package className="w-3 h-3" /> Received</button>}
                    </div>
                  </td>
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
