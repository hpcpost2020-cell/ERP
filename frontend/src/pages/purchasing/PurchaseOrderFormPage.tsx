import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { purchasing, suppliers as suppliersApi, products as productApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

interface LineItem { product: string; qty_ordered: string; unit_cost: string; supplier_sku: string; description: string }

const emptyLine = (): LineItem => ({ product: '', qty_ordered: '1', unit_cost: '', supplier_sku: '', description: '' })

export default function PurchaseOrderFormPage() {
  const nav = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    supplier: '', order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '', payment_terms: 'net_30', currency: 'GBP',
    delivery_address: '', supplier_reference: '', notes: '',
  })
  const [items, setItems] = useState<LineItem[]>([emptyLine()])
  const [error, setError] = useState('')

  const { data: supplierList } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => suppliersApi.list({ page_size: 200 }).then(r => r.data.results || []),
  })

  const { data: productList } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productApi.list({ page_size: 500, status: 'active' }).then(r => r.data.results || []),
  })

  const create = useMutation({
    mutationFn: (data: unknown) => purchasing.create(data),
    onSuccess: (res) => {
      toast('Purchase order created', 'success')
      nav(`/purchasing/${res.data.id}`)
    },
    onError: () => { setError('Failed to create purchase order. Check all fields.') },
  })

  const setField = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  const setItem = (i: number, field: keyof LineItem, val: string) => {
    const updated = [...items]
    updated[i] = { ...updated[i], [field]: val }
    if (field === 'product' && val) {
      const prod = productList?.find((p: { id: number; buy_price: string | number }) => String(p.id) === val)
      if (prod) updated[i].unit_cost = String(prod.buy_price || '')
    }
    setItems(updated)
  }

  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const validItems = items.filter(it => it.product && Number(it.qty_ordered) > 0)
    if (!form.supplier) { setError('Please select a supplier.'); return }
    if (!validItems.length) { setError('Add at least one line item.'); return }
    create.mutate({
      ...form,
      supplier: Number(form.supplier),
      items: validItems.map(it => ({
        product: Number(it.product),
        qty_ordered: Number(it.qty_ordered),
        unit_cost: it.unit_cost || '0',
        supplier_sku: it.supplier_sku,
        description: it.description,
      })),
    })
  }

  const lineTotal = items.reduce((sum, it) => sum + (Number(it.qty_ordered) * Number(it.unit_cost || 0)), 0)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/purchasing')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">New Purchase Order</h1>
            <p className="page-subtitle">Create a purchase order to send to a supplier</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {error && <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">{error}</div>}

        {/* Header details */}
        <div className="card card-body space-y-4">
          <h3 className="font-semibold">Order Details</h3>
          <div className="form-row">
            <div>
              <label className="label">Supplier *</label>
              <select name="supplier" value={form.supplier} onChange={setField} className="select" required>
                <option value="">Select supplier...</option>
                {supplierList?.map((s: { id: number; name: string; code: string }) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select name="currency" value={form.currency} onChange={setField} className="select">
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div><label className="label">Order Date *</label><input name="order_date" type="date" value={form.order_date} onChange={setField} className="input" required /></div>
            <div><label className="label">Expected Delivery</label><input name="expected_delivery_date" type="date" value={form.expected_delivery_date} onChange={setField} className="input" /></div>
          </div>
          <div className="form-row">
            <div><label className="label">Payment Terms</label>
              <select name="payment_terms" value={form.payment_terms} onChange={setField} className="select">
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="net_7">Net 7</option>
                <option value="net_14">Net 14</option>
                <option value="net_30">Net 30</option>
                <option value="net_60">Net 60</option>
                <option value="net_90">Net 90</option>
              </select>
            </div>
            <div><label className="label">Supplier Reference</label><input name="supplier_reference" value={form.supplier_reference} onChange={setField} className="input" placeholder="Supplier's order/quote ref" /></div>
          </div>
          <div><label className="label">Notes</label><textarea name="notes" value={form.notes} onChange={setField} className="input" rows={2} /></div>
        </div>

        {/* Line items */}
        <div className="card">
          <div className="card-header">
            <span className="font-semibold">Order Lines</span>
            <button type="button" className="btn-secondary text-sm" onClick={() => setItems(p => [...p, emptyLine()])}>
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>
          <div className="p-4 space-y-3">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-lg">
                <div className="col-span-4">
                  {i === 0 && <label className="label">Product *</label>}
                  <select value={item.product} onChange={e => setItem(i, 'product', e.target.value)} className="select">
                    <option value="">Select product...</option>
                    {productList?.map((p: { id: number; sku: string; title: string }) => (
                      <option key={p.id} value={p.id}>[{p.sku}] {p.title}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="label">Qty *</label>}
                  <input type="number" min="1" value={item.qty_ordered} onChange={e => setItem(i, 'qty_ordered', e.target.value)} className="input" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="label">Unit Cost (£)</label>}
                  <input type="number" step="0.01" min="0" value={item.unit_cost} onChange={e => setItem(i, 'unit_cost', e.target.value)} className="input" placeholder="0.00" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="label">Supplier SKU</label>}
                  <input value={item.supplier_sku} onChange={e => setItem(i, 'supplier_sku', e.target.value)} className="input" placeholder="Optional" />
                </div>
                <div className="col-span-1 text-right">
                  {i === 0 && <label className="label">Total</label>}
                  <div className="text-sm font-semibold py-2">£{(Number(item.qty_ordered) * Number(item.unit_cost || 0)).toFixed(2)}</div>
                </div>
                <div className="col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="btn btn-secondary btn-sm text-red-500 mt-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t bg-gray-50 flex justify-end">
            <div className="text-sm"><span className="text-gray-500 mr-4">Total Value:</span><span className="text-lg font-bold text-brand-700">£{lineTotal.toFixed(2)}</span></div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => nav('/purchasing')} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating...' : 'Create Purchase Order'}</button>
        </div>
      </form>
    </div>
  )
}
