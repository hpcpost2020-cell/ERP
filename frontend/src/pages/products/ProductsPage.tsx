import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { products as productApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { Plus, Package, Edit, Trash2, Eye } from 'lucide-react'
import ProductModal from './ProductModal'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editProduct, setEditProduct] = useState<number | null>(null)
  const nav = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search, status],
    queryFn: () => productApi.list({ page, search, status: status || undefined }).then(r => r.data),
  })

  const del = useMutation({
    mutationFn: (id: number) => productApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] })
  })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">{data?.count || 0} products in catalogue</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditProduct(null); setShowModal(true) }}>
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex gap-3">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search SKU, title, barcode..." />
            <select className="select w-40" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>
        {data?.results?.length === 0 ? <EmptyState icon={Package} title="No products found" /> : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th><th>Title</th><th>Brand</th><th>Category</th>
                    <th>Buy Price</th><th>Sell Price</th><th>Margin</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.results?.map((p: { id: number; sku: string; title: string; brand: string; category_name: string; buy_price: number; sell_price: number; margin_pct: number; status: string }) => (
                    <tr key={p.id}>
                      <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.sku}</span></td>
                      <td className="max-w-xs truncate font-medium">{p.title}</td>
                      <td className="text-gray-500">{p.brand || '—'}</td>
                      <td className="text-gray-500">{p.category_name || '—'}</td>
                      <td>{fmt.currency(p.buy_price)}</td>
                      <td className="font-medium">{fmt.currency(p.sell_price)}</td>
                      <td><span className={`text-xs font-semibold ${Number(p.margin_pct) > 30 ? 'text-green-600' : Number(p.margin_pct) > 15 ? 'text-amber-600' : 'text-red-600'}`}>{fmt.pct(p.margin_pct)}</span></td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => nav(`/products/${p.id}`)} className="btn btn-secondary btn-sm"><Eye className="w-3 h-3" /></button>
                          <button onClick={() => { setEditProduct(p.id); setShowModal(true) }} className="btn btn-secondary btn-sm"><Edit className="w-3 h-3" /></button>
                          <button onClick={() => { if (confirm('Delete product?')) del.mutate(p.id) }} className="btn btn-secondary btn-sm text-red-500"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={50} total={data?.count || 0} onPage={setPage} />
          </>
        )}
      </div>

      {showModal && <ProductModal id={editProduct} onClose={() => setShowModal(false)} />}
    </div>
  )
}
