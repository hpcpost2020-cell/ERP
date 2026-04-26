import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoicing } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/Toast'
import { ArrowLeft, Download, CreditCard, X } from 'lucide-react'

const paymentMethods = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const invId = Number(id)
  const [showPayment, setShowPayment] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: '', method: 'bank_transfer', reference: '', payment_date: new Date().toISOString().split('T')[0], notes: '',
  })

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invId],
    queryFn: () => invoicing.get(invId).then(r => r.data),
  })

  const downloadPdf = useMutation({
    mutationFn: () => invoicing.downloadPdf(invId),
    onSuccess: (res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = `Invoice_${invoice?.invoice_number || invId}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast('PDF downloaded', 'success')
    },
    onError: () => toast('Failed to download PDF', 'error'),
  })

  const recordPayment = useMutation({
    mutationFn: () => invoicing.recordPayment(invId, {
      ...payForm,
      amount: parseFloat(payForm.amount),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invId] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast('Payment recorded', 'success')
      setShowPayment(false)
      setPayForm({ amount: '', method: 'bank_transfer', reference: '', payment_date: new Date().toISOString().split('T')[0], notes: '' })
    },
    onError: () => toast('Failed to record payment', 'error'),
  })

  if (isLoading) return <Loading />
  if (!invoice) return <div className="text-red-500 p-8">Invoice not found</div>

  const setP = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setPayForm(p => ({ ...p, [e.target.name]: e.target.value }))

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/invoicing')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">{invoice.invoice_number}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={invoice.status} />
              {invoice.is_overdue && <span className="badge badge-red">Overdue</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => downloadPdf.mutate()} disabled={downloadPdf.isPending}>
            <Download className="w-4 h-4" /> {downloadPdf.isPending ? 'Downloading...' : 'Download PDF'}
          </button>
          {Number(invoice.balance_due) > 0 && (
            <button className="btn-primary" onClick={() => setShowPayment(true)}>
              <CreditCard className="w-4 h-4" /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPayment(false)}>
          <div className="modal max-w-md">
            <div className="modal-header">
              <h2>Record Payment</h2>
              <button onClick={() => setShowPayment(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="label">Amount (£) *</label>
                <input name="amount" value={payForm.amount} onChange={setP} className="input" type="number" step="0.01"
                  placeholder={`Balance due: ${fmt.currency(invoice.balance_due)}`} required />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select name="method" value={payForm.method} onChange={setP} className="select">
                  {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Payment Date</label>
                <input name="payment_date" value={payForm.payment_date} onChange={setP} className="input" type="date" />
              </div>
              <div>
                <label className="label">Reference</label>
                <input name="reference" value={payForm.reference} onChange={setP} className="input" placeholder="Transaction ref, cheque number..." />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea name="notes" value={payForm.notes} onChange={setP} className="input" rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPayment(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => recordPayment.mutate()}
                disabled={!payForm.amount || recordPayment.isPending}>
                {recordPayment.isPending ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bill To / Invoice Info */}
          <div className="grid grid-cols-2 gap-6">
            <div className="card card-body space-y-2">
              <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Bill To</h3>
              <div className="text-sm space-y-1">
                <div className="font-medium">{invoice.customer_name || invoice.bill_to_name}</div>
                {invoice.bill_to_company && <div className="text-gray-600">{invoice.bill_to_company}</div>}
                {invoice.bill_to_address_line1 && <div className="text-gray-600">{invoice.bill_to_address_line1}</div>}
                {invoice.bill_to_address_line2 && <div className="text-gray-600">{invoice.bill_to_address_line2}</div>}
                {invoice.bill_to_city && <div className="text-gray-600">{invoice.bill_to_city}{invoice.bill_to_county ? `, ${invoice.bill_to_county}` : ''}</div>}
                {invoice.bill_to_postcode && <div className="text-gray-600">{invoice.bill_to_postcode}</div>}
                {invoice.bill_to_email && <div className="text-brand-600">{invoice.bill_to_email}</div>}
              </div>
            </div>
            <div className="card card-body space-y-2">
              <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Invoice Details</h3>
              <div className="text-sm space-y-2">
                <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Issue Date</span><span>{fmt.shortDate(invoice.issue_date)}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Due Date</span>
                  <span className={invoice.is_overdue ? 'text-red-600 font-semibold' : ''}>{fmt.shortDate(invoice.due_date)}</span>
                </div>
                {invoice.payment_terms && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Terms</span><span className="capitalize">{invoice.payment_terms}</span></div>}
                {invoice.order_number && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Order #</span><span className="font-mono text-xs">{invoice.order_number}</span></div>}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="card">
            <div className="card-header"><span className="font-semibold">Line Items</span></div>
            <div className="table-container">
              <table>
                <thead><tr><th>Description</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>VAT</th><th>Total</th></tr></thead>
                <tbody>
                  {(invoice.items || []).map((item: { id: number; description: string; sku: string; quantity: number; unit_price: number; vat_rate: number; line_total: number }) => (
                    <tr key={item.id}>
                      <td className="font-medium">{item.description}</td>
                      <td className="text-xs text-gray-500 font-mono">{item.sku || '—'}</td>
                      <td>{item.quantity}</td>
                      <td>{fmt.currency(item.unit_price)}</td>
                      <td className="text-gray-500">{item.vat_rate}%</td>
                      <td className="font-semibold">{fmt.currency(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment history */}
          {invoice.payments?.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="font-semibold">Payment History</span></div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
                  <tbody>
                    {invoice.payments.map((p: { id: number; payment_date: string; method: string; reference: string; amount: number }) => (
                      <tr key={p.id}>
                        <td className="text-xs text-gray-500">{fmt.shortDate(p.payment_date)}</td>
                        <td className="capitalize">{p.method?.replace(/_/g, ' ')}</td>
                        <td className="text-xs text-gray-500">{p.reference || '—'}</td>
                        <td className="font-semibold text-green-600">{fmt.currency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Totals sidebar */}
        <div className="space-y-4">
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Summary</h3>
            <div className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmt.currency(invoice.subtotal)}</span></div>
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Discount</span><span>-{fmt.currency(invoice.discount_amount)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>{fmt.currency(invoice.vat_amount)}</span></div>
              {Number(invoice.shipping_cost) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span>{fmt.currency(invoice.shipping_cost)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                <span>Total</span><span>{fmt.currency(invoice.total_amount)}</span>
              </div>
              {Number(invoice.amount_paid) > 0 && (
                <div className="flex justify-between text-green-600"><span>Amount Paid</span><span>{fmt.currency(invoice.amount_paid)}</span></div>
              )}
              <div className={`flex justify-between font-bold ${Number(invoice.balance_due) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Balance Due</span><span>{fmt.currency(invoice.balance_due)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="card card-body">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
