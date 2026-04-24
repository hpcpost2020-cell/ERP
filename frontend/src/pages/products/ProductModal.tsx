import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { products as productApi } from '../../api/endpoints'
import { X } from 'lucide-react'

interface Props { id: number | null; onClose: () => void }

export default function ProductModal({ id, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = id !== null

  const { data: existing } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.get(id!).then(r => r.data),
    enabled: isEdit,
  })

  const { data: cats } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productApi.categories().then(r => {
      const d = r.data
      return Array.isArray(d) ? d : (d?.results || [])
    })
  })

  const [form, setForm] = useState<Record<string, string>>({
    sku: '', title: '', barcode: '', brand: '', buy_price: '', sell_price: '',
    vat_rate: '20', status: 'active', low_stock_threshold: '5', reorder_quantity: '10',
    description: '', notes: '', category: '',
  })

  useEffect(() => {
    if (existing) setForm({
      sku: existing.sku || '', title: existing.title || '',
      barcode: existing.barcode || '', brand: existing.brand || '',
      buy_price: String(existing.buy_price || ''), sell_price: String(existing.sell_price || ''),
      vat_rate: String(existing.vat_rate || '20'), status: existing.status || 'active',
      low_stock_threshold: String(existing.low_stock_threshold || '5'),
      reorder_quantity: String(existing.reorder_quantity || '10'),
      description: existing.description || '', notes: existing.notes || '',
      category: existing.category ? String(existing.category) : '',
    })
  }, [existing])

  const save = useMutation({
    mutationFn: (data: Record<string, string>) =>
      isEdit ? productApi.update(id!, data) : productApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); onClose() },
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-2xl">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Product' : 'New Product'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); save.mutate(form) }}>
          <div className="modal-body space-y-4">
            <div className="form-row">
              <div><label className="label">SKU *</label><input name="sku" value={form.sku} onChange={handleChange} className="input" required /></div>
              <div><label className="label">Barcode</label><input name="barcode" value={form.barcode} onChange={handleChange} className="input" /></div>
            </div>
            <div><label className="label">Title *</label><input name="title" value={form.title} onChange={handleChange} className="input" required /></div>
            <div className="form-row">
              <div><label className="label">Brand</label><input name="brand" value={form.brand} onChange={handleChange} className="input" /></div>
              <div><label className="label">Category</label>
                <select name="category" value={form.category} onChange={handleChange} className="select">
                  <option value="">-- None --</option>
                  {cats?.map((c: { id: number; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div><label className="label">Buy Price (£) *</label><input name="buy_price" value={form.buy_price} onChange={handleChange} type="number" step="0.01" className="input" required /></div>
              <div><label className="label">Sell Price (£) *</label><input name="sell_price" value={form.sell_price} onChange={handleChange} type="number" step="0.01" className="input" required /></div>
            </div>
            <div className="form-row">
              <div><label className="label">VAT Rate (%)</label><input name="vat_rate" value={form.vat_rate} onChange={handleChange} type="number" step="0.01" className="input" /></div>
              <div><label className="label">Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="select">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="discontinued">Discontinued</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div><label className="label">Low Stock Threshold</label><input name="low_stock_threshold" value={form.low_stock_threshold} onChange={handleChange} type="number" className="input" /></div>
              <div><label className="label">Reorder Quantity</label><input name="reorder_quantity" value={form.reorder_quantity} onChange={handleChange} type="number" className="input" /></div>
            </div>
            <div><label className="label">Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} className="input" rows={3} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save Product'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
