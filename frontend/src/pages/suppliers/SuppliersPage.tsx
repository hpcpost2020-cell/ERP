import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { suppliers } from '../../api/endpoints'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { Plus, Eye } from 'lucide-react'

export default function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const nav = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => suppliers.list({ page, search }).then(r => r.data),
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Suppliers</h1><p className="page-subtitle">{data?.count || 0} supplier records</p></div>
        <button className="btn-primary"><Plus className="w-4 h-4" /> New Supplier</button>
      </div>
      <div className="card">
        <div className="card-header"><SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Supplier name, code..." /></div>
        <div className="table-container">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Payment Terms</th><th>Lead Time</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data?.results?.map((s: { id: number; code: string; name: string; contact_name: string; email: string; payment_terms: string; lead_time_days: number; status: string }) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => nav(`/suppliers/${s.id}`)}>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{s.code}</span></td>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-sm text-gray-500">{s.contact_name} · {s.email}</td>
                  <td><span className="badge badge-blue">{s.payment_terms?.replace(/_/g,' ')}</span></td>
                  <td>{s.lead_time_days}d</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td onClick={e => e.stopPropagation()}><button onClick={() => nav(`/suppliers/${s.id}`)} className="btn btn-secondary btn-sm"><Eye className="w-3 h-3" /></button></td>
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
