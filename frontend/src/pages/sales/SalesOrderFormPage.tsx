import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { sales, customers as customersApi, products as productApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

interface LineItem { product: string; sku: string; title: string; quantity: string; unit_price: string; vat_rate: string }

const emptyLine = (): LineItem => ({ product: '', sku: '', title: '', quantity: '1', unit_price: '', vat_rate: '20' })

export default function SalesOrderFormPage() {
  const nav = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    customer: '', channel: 'direct', payment_status: 'unpaid',
    ship_to_name: '', ship_to_company: '', ship_to_email: '', ship_to_phone: '',
    ship_to_address1: '', ship_to_address2: '', ship_to_city: '', ship_to_postcode: '', ship_to_country: 'GB',
    shipping_cost: '0', discount_amount: '0', notes: '', currency: 'GBP',
  })
  const [items, setItems] = useState<LineItem[]>([emptyLine()])
  const [error, setError] = useState('')

  const { data: customerList } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customersApi.list({ page_size: 200 }).then(r => r.data.results || []),
  })

  const { data: productList } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productApi.list({ page_size: 500, status: 'active' }).then(r => r.data.results || []),
  })

  const create = useMutation({
    mutationFn: (data: unknown) => sales.create(data),
    onSuccess: (res) => {
      toast('Sales order created', 'success')
      nav(`/sales/${res.data.id}`)
    },
    onError: () => setError('Failed to create order. Check all required fields.'),
  })

  const setField = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  // Auto-fill ship-to when customer is selected
  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value
    setForm(p => ({ ...p, customer: custId }))
    if (custId) {
      const cust = customerList?.find((c: { id: number }) => String(c.id) === custId)
      if (cust) {
        setForm(p => ({
          ...p, customer: custId,
          ship_to_name: `${cust.first_name || ''} ${cust.last_name || ''}`.trim() || cust.company_name || '',
          ship_to_company: cust.company_name || '',
          ship_to_email: cust.email || '',
          ship_to_phone: cust.phone || '',
        }))
      }
    }
  }

  const setItem = (i: number, field: keyof LineItem, val: string) => {
    const updated = [...items]
    updated[i] = { ...updated[i], [field]: val }
    if (field === 'product' && val) {
      const prod = productList?.find((p: { id: number }) => String(p.id) === val)
      if (prod) {
        updated[i].sku = prod.sku
        updated[i].title = prod.title
        updated[i].unit_price = String(prod.sell_price || '')
        updated[i].vat_rate = String(prod.vat_rate || '20')
      }
    }
    setItems(updated)
  }

  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const validItems = items.filter(it => Number(it.quantity) > 0 && it.unit_price !== '')
    if (!form.ship_to_name) { setError('Ship to name is required.'); return }
    if (!validItems.length) { setError('Add at least one item.'); return }
    create.mutate({
      ...form,
      customer: form.customer ? Number(form.customer) : null,
      shipping_cost: form.shipping_cost || '0',
      discount_amount: form.discount_amount || '0',
      items: validItems.map(it => ({
        product: it.product ? Number(it.product) : null,
        sku: it.sku,
        title: it.title,
        quantity: Number(it.quantity),
        unit_price: it.unit_price,
        vat_rate: it.vat_rate || '20',
      })),
    })
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.unit_price || 0)), 0)
  const vat = items.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.unit_price || 0) * Number(it.vat_rate || 0) / 100), 0)
  const total = subtotal + vat + Number(form.shipping_cost || 0) - Number(form.discount_amount || 0)

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/sales')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">New Sales Order</h1>
            <p className="page-subtitle">Create a new order manually</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {error && <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order header */}
          <div className="card card-body space-y-4">
            <h3 className="font-semibold">Order Details</h3>
            <div><label className="label">Customer</label>
              <select name="customer" value={form.customer} onChange={handleCustomerChange} className="select">
                <option value="">Guest / No customer</option>
                {customerList?.map((c: { id: number; display_name: string; customer_number: string }) => (
                  <option key={c.id} value={c.id}>{c.display_name} ({c.customer_number})</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div><label className="label">Channel</label>
                <select name="channel" value={form.channel} onChange={setField} className="select">
                  {['direct','wholesale','phone','ebay','amazon','woocommerce'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div><label className="label">Payment Status</label>
                <select name="payment_status" value={form.payment_status} onChange={setField} className="select">
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Part Paid</option>
                </select>
              </div>
            </div>
            <div><label className="label">Notes</label><textarea name="notes" value={form.notes} onChange={setField} className="input" rows={2} /></div>
          </div>

          {/* Ship-to */}
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Ship To</h3>
            <div><label className="label">Name *</label><input name="ship_to_name" value={form.ship_to_name} onChange={setField} className="input" required /></div>
            <div><label className="label">Company</label><input name="ship_to_company" value={form.ship_to_company} onChange={setField} className="input" /></div>
            <div className="form-row">
              <div><label className="label">Email</label><input name="ship_to_email" value={form.ship_to_email} onChange={setField} className="input" type="email" /></div>
              <div><label className="label">Phone</label><input name="ship_to_phone" value={form.ship_to_phone} onChange={setField} className="input" /></div>
            </div>
            <div><label className="label">Address Line 1</label><input name="ship_to_address1" value={form.ship_to_address1} onChange={setField} className="input" /></div>
            <div className="form-row">
              <div><label className="label">City</label><input name="ship_to_city" value={form.ship_to_city} onChange={setField} className="input" /></div>
              <div><label className="label">Postcode</label><input name="ship_to_postcode" value={form.ship_to_postcode} onChange={setField} className="input" /></div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="card">
          <div className="card-header">
            <span className="font-semibold">Order Items</span>
            <button type="button" className="btn-secondary text-sm" onClick={() => setItems(p => [...p, emptyLine()])}>
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>
          <div className="p-4 space-y-3">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-lg">
                <div className="col-span-4">
                  {i === 0 && <label className="label">Product</label>}
                  <select value={item.product} onChange={e => setItem(i, 'product', e.target.value)} className="select">
                    <option value="">Select or enter manually...</option>
                    {productList?.map((p: { id: number; sku: string; title: string }) => (
                      <option key={p.id} value={p.id}>[{p.sku}] {p.title}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="label">SKU</label>}
                  <input value={item.sku} onChange={e => setItem(i, 'sku', e.target.value)} className="input" placeholder="SKU" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="label">Qty</label>}
                  <input type="number" min="1" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} className="input" />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="label">Unit Price (£)</label>}
                  <input type="number" step="0.01" min="0" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} className="input" placeholder="0.00" />
                </div>
                <div className="col-span-1 text-right">
                  {i === 0 && <label className="label">Total</label>}
                  <div className="text-sm font-semibold py-2">£{(Number(item.quantity) * Number(item.unit_price || 0)).toFixed(2)}</div>
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
          <div className="px-4 py-3 border-t bg-gray-50">
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>£{vat.toFixed(2)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Shipping</span>
                  <input type="number" step="0.01" min="0" name="shipping_cost" value={form.shipping_cost} onChange={setField} className="input w-24 text-right text-sm" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Discount</span>
                  <input type="number" step="0.01" min="0" name="discount_amount" value={form.discount_amount} onChange={setField} className="input w-24 text-right text-sm" />
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>£{total.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => nav('/sales')} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating...' : 'Create Order'}</button>
        </div>
      </form>
    </div>
  )
}
