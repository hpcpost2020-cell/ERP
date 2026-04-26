import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { products as productApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import ProductModal from './ProductModal'
import { ArrowLeft, Edit, Package, TrendingUp } from 'lucide-react'

type Tab = 'overview' | 'stock' | 'movements'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  useQueryClient()
  const prodId = Number(id)
  const [tab, setTab] = useState<Tab>('overview')
  const [showEdit, setShowEdit] = useState(false)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', prodId],
    queryFn: () => productApi.get(prodId).then(r => r.data),
  })

  const { data: stock } = useQuery({
    queryKey: ['product-stock', prodId],
    queryFn: () => productApi.stock(prodId).then(r => r.data),
    enabled: tab === 'stock',
  })

  const { data: movements } = useQuery({
    queryKey: ['product-movements', prodId],
    queryFn: () => productApi.movements(prodId).then(r => r.data),
    enabled: tab === 'movements',
  })

  if (isLoading) return <Loading />
  if (!product) return <div className="text-red-500 p-8">Product not found</div>

  const tabs = [
    { key: 'overview' as Tab, label: 'Overview', icon: Package },
    { key: 'stock' as Tab, label: 'Stock Levels', icon: Package },
    { key: 'movements' as Tab, label: 'Movements', icon: TrendingUp },
  ]

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/products')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">{product.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={product.status} />
              <span className="text-sm text-gray-500 font-mono">{product.sku}</span>
              {product.barcode && <span className="text-xs text-gray-400">· {product.barcode}</span>}
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowEdit(true)}><Edit className="w-4 h-4" /> Edit Product</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card card-body text-center">
          <div className="text-2xl font-bold text-brand-700">{fmt.currency(product.buy_price)}</div>
          <div className="text-xs text-gray-500 mt-1">Buy Price</div>
        </div>
        <div className="card card-body text-center">
          <div className="text-2xl font-bold text-brand-700">{fmt.currency(product.sell_price)}</div>
          <div className="text-xs text-gray-500 mt-1">Sell Price</div>
        </div>
        <div className="card card-body text-center">
          <div className={`text-2xl font-bold ${Number(product.margin_pct) > 30 ? 'text-green-600' : Number(product.margin_pct) > 15 ? 'text-amber-600' : 'text-red-600'}`}>
            {fmt.pct(product.margin_pct)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Margin</div>
        </div>
        <div className="card card-body text-center">
          <div className={`text-2xl font-bold ${(product.qty_on_hand || 0) <= (product.low_stock_threshold || 0) ? 'text-red-600' : 'text-green-600'}`}>
            {product.qty_on_hand || 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">Total Stock</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Product Details</h3>
            <div className="text-sm space-y-2">
              {product.brand && <div className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">Brand</span><span>{product.brand}</span></div>}
              {product.category_name && <div className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">Category</span><span>{product.category_name}</span></div>}
              <div className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">VAT Rate</span><span>{product.vat_rate}%</span></div>
              {product.weight_grams && <div className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">Weight</span><span>{product.weight_grams}g</span></div>}
            </div>
          </div>
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Stock Settings</h3>
            <div className="text-sm space-y-2">
              <div className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">Low Stock At</span>
                <span className={product.qty_on_hand <= product.low_stock_threshold ? 'text-red-600 font-semibold' : ''}>{product.low_stock_threshold}</span>
              </div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 shrink-0">Reorder Qty</span><span>{product.reorder_quantity}</span></div>
            </div>
          </div>
          {product.description && (
            <div className="card card-body lg:col-span-2">
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-sm text-gray-600">{product.description}</p>
            </div>
          )}
          {product.notes && (
            <div className="card card-body lg:col-span-2">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{product.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Stock by Location</span></div>
          {!stock?.length ? (
            <div className="p-8 text-center text-gray-400">No stock records found</div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>Location</th><th>On Hand</th><th>Allocated</th><th>Available</th></tr></thead>
                <tbody>
                  {stock.map((s: { id: number; location_name: string; qty_on_hand: number; qty_allocated: number; qty_available: number }) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.location_name}</td>
                      <td className="font-semibold">{s.qty_on_hand}</td>
                      <td className="text-amber-600">{s.qty_allocated}</td>
                      <td className={s.qty_available <= 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{s.qty_available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div className="card">
          <div className="card-header">
            <span className="font-semibold">Stock Movements</span>
            {Array.isArray(movements) && movements.length > 0 && <span className="text-xs text-gray-400">Showing last {Math.min(movements.length, 100)}</span>}
          </div>
          {!(Array.isArray(movements) ? movements : movements?.results || []).length ? (
            <div className="p-8 text-center text-gray-400">No movements recorded</div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reference</th><th>Notes</th></tr></thead>
                <tbody>
                  {(Array.isArray(movements) ? movements : movements?.results || []).slice(0, 100).map((m: { id: number; created_at: string; movement_type: string; quantity: number; qty_before: number; qty_after: number; reference_number: string; notes: string }) => (
                    <tr key={m.id}>
                      <td className="text-xs text-gray-500">{fmt.shortDate(m.created_at)}</td>
                      <td><span className={`badge ${m.movement_type === 'inward' ? 'badge-green' : m.movement_type === 'outward' ? 'badge-red' : 'badge-blue'}`}>{m.movement_type}</span></td>
                      <td className={`font-semibold ${m.movement_type === 'inward' ? 'text-green-600' : 'text-red-600'}`}>{m.movement_type === 'inward' ? '+' : '-'}{m.quantity}</td>
                      <td className="text-gray-500">{m.qty_before}</td>
                      <td className="font-medium">{m.qty_after}</td>
                      <td className="text-xs text-gray-500">{m.reference_number || '—'}</td>
                      <td className="text-xs text-gray-500 max-w-xs truncate">{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showEdit && <ProductModal id={prodId} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
