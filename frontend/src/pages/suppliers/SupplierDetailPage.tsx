import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { suppliers as suppliersApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import SupplierFormModal from './SupplierFormModal'
import { ArrowLeft, Edit, Package, Truck } from 'lucide-react'

type Tab = 'overview' | 'products' | 'orders'

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const suppId = Number(id)
  const [tab, setTab] = useState<Tab>('overview')
  const [showEdit, setShowEdit] = useState(false)

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', suppId],
    queryFn: () => suppliersApi.get(suppId).then(r => r.data),
  })

  const { data: orders } = useQuery({
    queryKey: ['supplier-orders', suppId],
    queryFn: () => suppliersApi.orders(suppId).then(r => r.data),
    enabled: tab === 'orders',
  })

  if (isLoading) return <Loading />
  if (!supplier) return <div className="text-red-500 p-8">Supplier not found</div>

  const tabs = [
    { key: 'overview' as Tab, label: 'Overview', icon: Edit },
    { key: 'products' as Tab, label: `Products (${supplier.products?.length || 0})`, icon: Package },
    { key: 'orders' as Tab, label: 'Purchase Orders', icon: Truck },
  ]

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/suppliers')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">{supplier.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={supplier.status} />
              <span className="text-sm text-gray-500 font-mono">{supplier.code}</span>
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowEdit(true)}><Edit className="w-4 h-4" /> Edit Supplier</button>
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
            <h3 className="font-semibold">Contact</h3>
            <div className="text-sm space-y-2">
              {supplier.contact_name && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Contact</span><span>{supplier.contact_name}</span></div>}
              {supplier.email && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Email</span><a href={`mailto:${supplier.email}`} className="text-brand-600 hover:underline">{supplier.email}</a></div>}
              {supplier.phone && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Phone</span><span>{supplier.phone}</span></div>}
              {supplier.website && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Website</span><a href={supplier.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate">{supplier.website}</a></div>}
            </div>
          </div>
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Trading Terms</h3>
            <div className="text-sm space-y-2">
              <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Payment Terms</span><span className="capitalize">{supplier.payment_terms?.replace(/_/g, ' ')}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Lead Time</span><span>{supplier.lead_time_days} days</span></div>
              {supplier.credit_limit && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Credit Limit</span><span>{fmt.currency(supplier.credit_limit)}</span></div>}
              <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Currency</span><span>{supplier.currency}</span></div>
            </div>
          </div>
          {(supplier.address_line1 || supplier.city) && (
            <div className="card card-body">
              <h3 className="font-semibold mb-2">Address</h3>
              <div className="text-sm text-gray-600 space-y-0.5">
                {supplier.address_line1 && <div>{supplier.address_line1}</div>}
                {supplier.address_line2 && <div>{supplier.address_line2}</div>}
                {supplier.city && <div>{supplier.city}{supplier.county ? `, ${supplier.county}` : ''}</div>}
                {supplier.postcode && <div>{supplier.postcode} {supplier.country}</div>}
              </div>
            </div>
          )}
          {supplier.notes && (
            <div className="card card-body">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{supplier.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'products' && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Supplier Products</span></div>
          {!supplier.products?.length ? (
            <div className="p-8 text-center text-gray-400">No products linked to this supplier</div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>SKU</th><th>Product</th><th>Supplier SKU</th><th>Buy Price</th><th>Pack Size</th><th>Lead Time</th><th>Preferred</th></tr></thead>
                <tbody>
                  {supplier.products.map((p: { id: number; product_sku: string; product_title: string; supplier_sku: string; buy_price: number; pack_size: number; lead_time_days: number; is_preferred: boolean }) => (
                    <tr key={p.id}>
                      <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.product_sku}</span></td>
                      <td className="font-medium">{p.product_title}</td>
                      <td className="text-gray-500 text-sm">{p.supplier_sku || '—'}</td>
                      <td>{fmt.currency(p.buy_price)}</td>
                      <td>{p.pack_size || 1}</td>
                      <td>{p.lead_time_days || '—'} days</td>
                      <td>{p.is_preferred ? <span className="badge badge-green">Yes</span> : <span className="text-gray-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Purchase Orders</span></div>
          {!orders?.length ? (
            <div className="p-8 text-center text-gray-400">No purchase orders yet</div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>PO Number</th><th>Date</th><th>Expected</th><th>Value</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {(Array.isArray(orders) ? orders : orders?.results || []).map((po: { id: number; po_number: string; order_date: string; expected_delivery_date: string; total_value: number; status: string }) => (
                    <tr key={po.id} className="cursor-pointer" onClick={() => nav(`/purchasing/${po.id}`)}>
                      <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{po.po_number}</span></td>
                      <td className="text-gray-500 text-xs">{fmt.shortDate(po.order_date)}</td>
                      <td className="text-gray-500 text-xs">{fmt.shortDate(po.expected_delivery_date)}</td>
                      <td className="font-semibold">{fmt.currency(po.total_value)}</td>
                      <td><StatusBadge status={po.status} /></td>
                      <td><button className="btn btn-secondary btn-sm">View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showEdit && <SupplierFormModal id={suppId} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
