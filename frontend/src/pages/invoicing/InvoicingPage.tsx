import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { invoicing, customers as customersApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { Eye, Download, Plus, X, Trash2 } from 'lucide-react'

interface LineItem {
  description: string
  sku: string
  quantity: string
  unit_price: string
  vat_rate: string
}

function CreateInvoiceModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const [customerId, setCustomerId] = useState('')
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate, setDueDate] = useState(in30)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([
    { description: '', sku: '', quantity: '1', unit_price: '', vat_rate: '20.00' },
  ])
  const [err, setErr] = useState('')

  const { data: custData } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customersApi.list({ page_size: 200 }).then(r => r.data),
  })
  const custList: { id: number; display_name: string; customer_number: string }[] =
    Array.isArray(custData) ? custData : custData?.results || []

  const save = useMutation({
    mutationFn: (payload: unknown) => invoicing.create(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      nav(`/invoicing/${res.data.id}`)
    },
    onError: (e: unknown) => {
      setErr(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          'Failed to create invoice',
      )
    },
  })

  const setItem = (i: number, field: keyof LineItem, value: string) =>
    setItems(prev => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))

  const addItem = () =>
    setItems(prev => [...prev, { description: '', sku: '', quantity: '1', unit_price: '', vat_rate: '20.00' }])

  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!issueDate || !dueDate) { setErr('Issue date and due date are required'); return }
    const validItems = items.filter(it => it.description.trim() && it.unit_price)
    if (validItems.length === 0) {
      setErr('At least one line item with a description and price is required')
      return
    }
    save.mutate({
      customer: customerId ? Number(customerId) : null,
      issue_date: issueDate,
      due_date: dueDate,
      status: 'draft',
      notes,
      items: validItems.map(it => ({
        description: it.description.trim(),
        sku: it.sku.trim(),
        quantity: Number(it.quantity) || 1,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate || '0.00',
      })),
    })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-3xl">
        <div className="modal-header">
          <h2>Create Invoice</h2>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-4 max-h-[70vh] overflow-y-auto">
            {err && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</div>}

            <div>
              <label className="label">Customer</label>
              <select className="select w-full" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">— No customer (manual / one-off) —</option>
                {custList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} ({c.customer_number})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div>
                <label className="label">Issue Date *</label>
                <input type="date" className="input" value={issueDate} onChange={e => setIssueDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Due Date *</label>
                <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Line Items *</label>
                <button type="button" onClick={addItem}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Line
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Description *</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">SKU</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-16">Qty</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-28">Unit Price *</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-20">VAT %</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input className="input text-sm py-1" value={item.description}
                            onChange={e => setItem(i, 'description', e.target.value)}
                            placeholder="Product or service description" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className="input text-sm py-1 font-mono" value={item.sku}
                            onChange={e => setItem(i, 'sku', e.target.value)} placeholder="SKU" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0.001" step="0.001" className="input text-sm py-1 text-right"
                            value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="0.01" className="input text-sm py-1 text-right"
                            value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)}
                            placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1.5">
                          <select className="select text-sm py-1" value={item.vat_rate}
                            onChange={e => setItem(i, 'vat_rate', e.target.value)}>
                            <option value="0.00">0%</option>
                            <option value="5.00">5%</option>
                            <option value="20.00">20%</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItem(i)}
                              className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Payment terms, bank details, reference, etc." />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function InvoicingPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
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
    },
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{data?.count || 0} invoices</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Create Invoice
        </button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Invoice number, customer..." />
            <select className="select w-40" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['draft', 'issued', 'sent', 'part_paid', 'paid', 'overdue', 'void', 'credit'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th><th>Customer</th><th>Issue Date</th><th>Due Date</th>
                <th>Total</th><th>Balance Due</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.results?.map((inv: {
                id: number; invoice_number: string; customer_name: string;
                issue_date: string; due_date: string; total_amount: number;
                balance_due: number; status: string
              }) => (
                <tr key={inv.id}>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{inv.invoice_number}</span></td>
                  <td className="font-medium">{inv.customer_name || '—'}</td>
                  <td className="text-xs text-gray-500">{fmt.shortDate(inv.issue_date)}</td>
                  <td className={`text-xs ${inv.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {fmt.shortDate(inv.due_date)}
                  </td>
                  <td>{fmt.currency(inv.total_amount)}</td>
                  <td className={Number(inv.balance_due) > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                    {fmt.currency(inv.balance_due)}
                  </td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => nav(`/invoicing/${inv.id}`)} className="btn btn-secondary btn-sm">
                        <Eye className="w-3 h-3" />
                      </button>
                      <button onClick={() => downloadPdf.mutate(inv.id)} className="btn btn-secondary btn-sm">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={50} total={data?.count || 0} onPage={setPage} />
      </div>

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
