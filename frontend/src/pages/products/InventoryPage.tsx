import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { products as productApi } from '../../api/endpoints'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import { AlertTriangle, ArrowUpDown, Plus } from 'lucide-react'
import { fmt } from '../../utils/format'

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjForm, setAdjForm] = useState({ product: '', location: '', quantity: '', notes: '' })
  const qc = useQueryClient()

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ['stock-levels', search],
    queryFn: () => productApi.list({ search, page_size: 200 }).then(r => r.data),
  })
  const { data: locs } = useQuery({ queryKey: ['locations'], queryFn: () => productApi.locations().then(r => r.data?.results || r.data) })
  const { data: movements } = useQuery({ queryKey: ['movements'], queryFn: () => productApi.stockMovements({ page_size: 50 }).then(r => r.data) })

  const adjust = useMutation({
    mutationFn: (d: unknown) => productApi.adjust(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-levels'] }); qc.invalidateQueries({ queryKey: ['movements'] }); setShowAdjust(false) }
  })

  if (levelsLoading) return <Loading />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div><h1 className="page-title">Inventory</h1><p className="page-subtitle">Stock levels, movements and adjustments</p></div>
        <button className="btn-primary" onClick={() => setShowAdjust(true)}><Plus className="w-4 h-4" /> Stock Adjustment</button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-gray-800">Stock Levels</span>
          <SearchBar value={search} onChange={setSearch} placeholder="Search SKU, product..." />
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>SKU</th><th>Product</th><th>On Hand</th><th>Reserved</th><th>Available</th><th>Damaged</th><th>Status</th></tr>
            </thead>
            <tbody>
              {levels?.results?.map((p: { id: number; sku: string; title: string; stock_levels: { qty_on_hand: number; qty_reserved: number; qty_available: number; qty_damaged: number; is_low_stock: boolean; location_code: string }[] }) =>
                p.stock_levels?.map((s, i: number) => (
                  <tr key={`${p.id}-${i}`}>
                    {i === 0 && <>
                      <td rowSpan={p.stock_levels.length}><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.sku}</span></td>
                      <td rowSpan={p.stock_levels.length} className="font-medium">{p.title}</td>
                    </>}
                    <td>{s.qty_on_hand}</td>
                    <td>{s.qty_reserved}</td>
                    <td className="font-semibold">{s.qty_available}</td>
                    <td className={s.qty_damaged > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{s.qty_damaged}</td>
                    <td>{s.is_low_stock ? <span className="flex items-center gap-1 text-red-600 text-xs font-medium"><AlertTriangle className="w-3 h-3" /> Low Stock</span> : <span className="text-green-600 text-xs">OK</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="font-semibold text-gray-800 flex items-center gap-2"><ArrowUpDown className="w-4 h-4" /> Recent Stock Movements</span></div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reference</th><th>By</th></tr>
            </thead>
            <tbody>
              {movements?.results?.map((m: { id: number; created_at: string; product_sku: string; product_title: string; movement_type: string; quantity: number; qty_before: number; qty_after: number; reference_number: string; created_by_name: string }) => (
                <tr key={m.id}>
                  <td className="text-xs text-gray-500">{fmt.datetime(m.created_at)}</td>
                  <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{m.product_sku}</span></td>
                  <td><span className={`badge ${m.movement_type === 'inward' ? 'badge-green' : m.movement_type === 'outward' ? 'badge-red' : 'badge-blue'}`}>{m.movement_type}</span></td>
                  <td className={`font-bold ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                  <td className="text-gray-500">{m.qty_before}</td>
                  <td className="font-medium">{m.qty_after}</td>
                  <td className="text-xs text-gray-500">{m.reference_number || '—'}</td>
                  <td className="text-xs text-gray-500">{m.created_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdjust && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdjust(false)}>
          <div className="modal max-w-md">
            <div className="modal-header">
              <h2>Stock Adjustment</h2>
              <button onClick={() => setShowAdjust(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); adjust.mutate({ product: Number(adjForm.product), location: Number(adjForm.location), quantity: Number(adjForm.quantity), notes: adjForm.notes }) }}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label">Product SKU</label>
                  <input className="input" placeholder="Enter product ID" value={adjForm.product} onChange={e => setAdjForm(p => ({ ...p, product: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Location</label>
                  <select className="select" value={adjForm.location} onChange={e => setAdjForm(p => ({ ...p, location: e.target.value }))} required>
                    <option value="">Select location...</option>
                    {locs?.map((l: { id: number; code: string; name: string }) => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Quantity (positive = add, negative = remove)</label>
                  <input className="input" type="number" value={adjForm.quantity} onChange={e => setAdjForm(p => ({ ...p, quantity: e.target.value }))} required />
                </div>
                <div><label className="label">Reason / Notes</label><textarea className="input" value={adjForm.notes} onChange={e => setAdjForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAdjust(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={adjust.isPending}>{adjust.isPending ? 'Saving...' : 'Save Adjustment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
