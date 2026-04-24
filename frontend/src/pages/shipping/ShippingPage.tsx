import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shipping } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'

export default function ShippingPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<'shipments' | 'issues'>('shipments')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', page, search],
    queryFn: () => shipping.list({ page, search }).then(r => r.data),
  })
  const { data: issues } = useQuery({
    queryKey: ['courier-issues'],
    queryFn: () => shipping.issues({ status: 'open' }).then(r => r.data),
    enabled: tab === 'issues',
  })

  const deliver = useMutation({ mutationFn: (id: number) => shipping.markDelivered(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['shipments'] }) })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Shipping</h1><p className="page-subtitle">Dispatch tracking and courier management</p></div>
      </div>
      <div className="flex gap-2 border-b border-gray-200">
        {(['shipments','issues'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'shipments' ? 'All Shipments' : 'Courier Issues'}
          </button>
        ))}
      </div>

      {tab === 'shipments' && (
        <div className="card">
          <div className="card-header"><SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Tracking number, order..." /></div>
          <div className="table-container">
            <table>
              <thead><tr><th>Order</th><th>Courier</th><th>Tracking</th><th>Status</th><th>Cost</th><th>Dispatched</th><th>Actions</th></tr></thead>
              <tbody>
                {data?.results?.map((s: { id: number; order_number: string; courier: string; tracking_number: string; tracking_link: string; status: string; cost: number; dispatched_at: string }) => (
                  <tr key={s.id}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{s.order_number}</span></td>
                    <td className="capitalize text-sm">{s.courier?.replace('_',' ')}</td>
                    <td>
                      {s.tracking_link ? (
                        <a href={s.tracking_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-600 hover:underline font-mono text-xs">
                          {s.tracking_number} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span className="font-mono text-xs text-gray-500">{s.tracking_number || '—'}</span>}
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{fmt.currency(s.cost)}</td>
                    <td className="text-xs text-gray-500">{fmt.datetime(s.dispatched_at)}</td>
                    <td>
                      {!['delivered','returned','lost','cancelled'].includes(s.status) && (
                        <button onClick={() => deliver.mutate(s.id)} className="btn btn-success btn-sm"><CheckCircle className="w-3 h-3" /> Delivered</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={50} total={data?.count || 0} onPage={setPage} />
        </div>
      )}

      {tab === 'issues' && (
        <div className="card">
          <div className="card-header"><span className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" /> Open Courier Issues</span></div>
          <div className="table-container">
            <table>
              <thead><tr><th>Shipment</th><th>Type</th><th>Status</th><th>Description</th><th>Reported</th></tr></thead>
              <tbody>
                {issues?.results?.map((i: { id: number; shipment: number; issue_type: string; status: string; description: string; created_at: string }) => (
                  <tr key={i.id}>
                    <td>{i.shipment}</td>
                    <td><span className="badge badge-red">{i.issue_type?.replace(/_/g,' ')}</span></td>
                    <td><StatusBadge status={i.status} /></td>
                    <td className="text-sm max-w-xs truncate">{i.description}</td>
                    <td className="text-xs text-gray-500">{fmt.shortDate(i.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
