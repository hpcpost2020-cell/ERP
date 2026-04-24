import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditLog } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
// import { BookOpen } from 'lucide-react'

const ACTION_COLORS: Record<string, string> = { create: 'badge-green', update: 'badge-blue', delete: 'badge-red', export: 'badge-purple', login: 'badge-gray', logout: 'badge-gray' }

export default function AuditPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, search, action],
    queryFn: () => auditLog.list({ page, search, action: action || undefined }).then(r => r.data),
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Audit Log</h1><p className="page-subtitle">Full system activity trail</p></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="User, model, record..." />
            <select className="select w-36" value={action} onChange={e => setAction(e.target.value)}>
              <option value="">All Actions</option>
              {['create','update','delete','view','login','logout','export'].map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Model</th><th>Record</th><th>IP</th></tr></thead>
            <tbody>
              {data?.results?.map((log: { id: number; timestamp: string; user_name: string; user_email: string; action: string; model_name: string; object_repr: string; ip_address: string }) => (
                <tr key={log.id}>
                  <td className="text-xs text-gray-500 whitespace-nowrap">{fmt.datetime(log.timestamp)}</td>
                  <td>
                    <div className="text-xs font-medium">{log.user_name || '—'}</div>
                    <div className="text-xs text-gray-400">{log.user_email}</div>
                  </td>
                  <td><span className={ACTION_COLORS[log.action] || 'badge-gray'}>{log.action}</span></td>
                  <td className="text-sm font-medium text-gray-600">{log.model_name}</td>
                  <td className="text-sm text-gray-500 max-w-xs truncate">{log.object_repr}</td>
                  <td className="text-xs font-mono text-gray-400">{log.ip_address || '—'}</td>
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
