import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { customers } from '../../api/endpoints'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { Plus, Eye } from 'lucide-react'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const nav = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search, type],
    queryFn: () => customers.list({ page, search, customer_type: type || undefined }).then(r => r.data),
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Customers</h1><p className="page-subtitle">{data?.count || 0} customer records</p></div>
        <button className="btn-primary" onClick={() => nav('/customers/new')}><Plus className="w-4 h-4" /> New Customer</button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Name, email, phone..." />
            <select className="select w-36" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All Types</option>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="marketplace">Marketplace</option>
            </select>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Type</th><th>Orders</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data?.results?.map((c: { id: number; customer_number: string; display_name: string; email: string; phone: string; customer_type: string; total_orders: number; status: string }) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/customers/${c.id}`)}>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.customer_number}</span></td>
                  <td className="font-medium">{c.display_name}</td>
                  <td className="text-gray-500 text-sm">{c.email}</td>
                  <td className="text-gray-500 text-sm">{c.phone || '—'}</td>
                  <td><span className="badge badge-blue capitalize">{c.customer_type}</span></td>
                  <td>{c.total_orders}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td onClick={e => e.stopPropagation()}><button onClick={() => nav(`/customers/${c.id}`)} className="btn btn-secondary btn-sm"><Eye className="w-3 h-3" /></button></td>
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
