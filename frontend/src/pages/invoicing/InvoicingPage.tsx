import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { invoicing } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { Eye, Download } from 'lucide-react'

export default function InvoicingPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const nav = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, status],
    queryFn: () => invoicing.list({ page, search, status: status || undefined }).then(r => r.data),
  })

  const downloadPdf = useMutation({
    mutationFn: (id: number) => invoicing.downloadPdf(id),
    onSuccess: (res, id) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = `Invoice_${id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    }
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Invoices</h1><p className="page-subtitle">{data?.count || 0} invoices</p></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Invoice number, customer..." />
            <select className="select w-40" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['draft','issued','sent','part_paid','paid','overdue','void','credit'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>Invoice #</th><th>Customer</th><th>Issue Date</th><th>Due Date</th><th>Total</th><th>Balance Due</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {data?.results?.map((inv: { id: number; invoice_number: string; customer_name: string; issue_date: string; due_date: string; total_amount: number; balance_due: number; status: string }) => (
                <tr key={inv.id}>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{inv.invoice_number}</span></td>
                  <td className="font-medium">{inv.customer_name || '—'}</td>
                  <td className="text-xs text-gray-500">{fmt.shortDate(inv.issue_date)}</td>
                  <td className={`text-xs ${inv.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{fmt.shortDate(inv.due_date)}</td>
                  <td>{fmt.currency(inv.total_amount)}</td>
                  <td className={Number(inv.balance_due) > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{fmt.currency(inv.balance_due)}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => nav(`/invoicing/${inv.id}`)} className="btn btn-secondary btn-sm"><Eye className="w-3 h-3" /></button>
                      <button onClick={() => downloadPdf.mutate(inv.id)} className="btn btn-secondary btn-sm"><Download className="w-3 h-3" /></button>
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
