import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { sales, products as productApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import StatusBadge from '../../components/ui/StatusBadge'
import { ClipboardList, AlertTriangle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface SalesOrder {
  id: number
  order_number: string
  customer_name: string
  channel: string
  status: string
  created_at: string
  total_value: number
  items_count: number
}

interface StockLevel {
  product_sku: string
  location_code: string
  qty_available: number
}

export default function PickingPage() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('confirmed,processing,awaiting_dispatch')
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null)

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['picking-orders', search, statusFilter],
    queryFn: () => sales.list({
      search: search || undefined,
      status: statusFilter || undefined,
      page_size: 50,
      ordering: 'created_at',
    }).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: stockData } = useQuery({
    queryKey: ['all-stock-levels'],
    queryFn: () => productApi.stockLevels({ page_size: 1000 }).then(r => r.data),
    staleTime: 60000,
  })

  const orders: SalesOrder[] = Array.isArray(ordersData) ? ordersData : ordersData?.results || []
  const stockLevels: StockLevel[] = Array.isArray(stockData) ? stockData : stockData?.results || []

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pick List</h1>
          <p className="page-subtitle">Orders ready for picking and packing</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex gap-3 flex-wrap">
            <SearchBar value={search} onChange={v => setSearch(v)} placeholder="Search order number, customer..." />
            <select className="select w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="confirmed,processing,awaiting_dispatch">All Active</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="awaiting_dispatch">Awaiting Dispatch</option>
            </select>
          </div>
        </div>

        {isLoading && <div className="p-8"><Loading /></div>}

        {!isLoading && orders.length === 0 && (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No orders to pick</p>
            <p className="text-gray-400 text-sm mt-1">Orders will appear here when confirmed</p>
          </div>
        )}

        {!isLoading && orders.length > 0 && (
          <div className="divide-y divide-gray-100">
            {orders.map(order => {
              const isExpanded = expandedOrder === order.id

              return (
                <div key={order.id}>
                  {/* Order header row */}
                  <div
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  >
                    <button className="text-gray-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{order.order_number}</span>
                        <span className="text-sm text-gray-700 truncate">{order.customer_name}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                        <span>{fmt.shortDate(order.created_at)}</span>
                        <span className="capitalize">{order.channel}</span>
                        <span>{fmt.currency(order.total_value)}</span>
                        {order.items_count > 0 && <span>{order.items_count} line{order.items_count !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => { e.stopPropagation(); nav(`/sales/${order.id}`) }}
                        title="Open order"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded pick lines */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      <PickLines order={order} stockLevels={stockLevels} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function PickLines({ order, stockLevels }: { order: SalesOrder; stockLevels: StockLevel[] }) {
  const { data: orderDetail } = useQuery({
    queryKey: ['sales', order.id],
    queryFn: () => sales.get(order.id).then(r => r.data),
    staleTime: 60000,
  })

  const items = orderDetail?.items || []

  const getLocationsForSku = (sku: string) => stockLevels
    .filter(s => s.product_sku === sku && s.qty_available > 0)
    .sort((a, b) => b.qty_available - a.qty_available)

  if (!items.length) return (
    <div className="px-8 py-4 text-sm text-gray-400">Loading items...</div>
  )

  return (
    <div className="px-4 py-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left py-2 pl-8 font-medium">SKU</th>
            <th className="text-left py-2 font-medium">Product</th>
            <th className="text-right py-2 font-medium">Ordered</th>
            <th className="text-left py-2 pl-4 font-medium">Pick From (Available)</th>
            <th className="text-right py-2 font-medium">Total Available</th>
            <th className="py-2 font-medium text-center">Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item: { id: number; sku?: string; title?: string; quantity: number }) => {
            const sku = item.sku || ''
            const title = item.title || ''
            const locations = getLocationsForSku(sku)
            const totalAvail = locations.reduce((t, l) => t + l.qty_available, 0)
            const hasEnough = totalAvail >= item.quantity

            return (
              <tr key={item.id} className={!hasEnough ? 'bg-red-50/40' : ''}>
                <td className="py-2 pl-8">
                  <span className="font-mono text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded">{sku || '—'}</span>
                </td>
                <td className="py-2 text-gray-700">{title}</td>
                <td className="py-2 text-right font-semibold">{item.quantity}</td>
                <td className="py-2 pl-4">
                  {locations.length === 0 ? (
                    <span className="text-red-600 text-xs font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> No stock
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {locations.slice(0, 4).map(l => (
                        <span key={l.location_code} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded font-mono">
                          {l.location_code} <span className="text-green-600 font-semibold">({l.qty_available})</span>
                        </span>
                      ))}
                      {locations.length > 4 && <span className="text-xs text-gray-400">+{locations.length - 4} more</span>}
                    </div>
                  )}
                </td>
                <td className={`py-2 text-right font-bold ${hasEnough ? 'text-green-600' : 'text-red-600'}`}>
                  {totalAvail}
                </td>
                <td className="py-2 text-center">
                  {hasEnough
                    ? <span className="badge badge-green text-xs">OK</span>
                    : <span className="badge badge-red text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Short</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
