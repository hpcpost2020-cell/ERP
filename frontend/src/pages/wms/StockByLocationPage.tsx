import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { products as productApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import { AlertTriangle, Package, MapPin } from 'lucide-react'

interface StockLevel {
  id: number
  product: number
  product_sku: string
  product_title: string
  location: number
  location_code: string
  location_name: string
  qty_on_hand: number
  qty_reserved: number
  qty_damaged: number
  qty_available: number
  is_low_stock: boolean
  updated_at: string
}

interface Location { id: number; code: string; name: string; is_active: boolean }

export default function StockByLocationPage() {
  const nav = useNavigate()
  const [locationId, setLocationId] = useState<string>('')
  const [search, setSearch] = useState('')

  const { data: locsData } = useQuery({
    queryKey: ['locations', 'active'],
    queryFn: () => productApi.locations({ is_active: true, page_size: 200 }).then(r => r.data),
  })

  const { data: stockData, isLoading } = useQuery({
    queryKey: ['stock-levels', locationId, search],
    queryFn: () => productApi.stockLevels({
      location: locationId || undefined,
      search: search || undefined,
      page_size: 500,
      ordering: 'product__sku',
    }).then(r => r.data),
    enabled: !!locationId,
  })

  const locs: Location[] = Array.isArray(locsData) ? locsData : locsData?.results || []
  const levels: StockLevel[] = Array.isArray(stockData) ? stockData : stockData?.results || []
  const selectedLoc = locs.find(l => String(l.id) === locationId)

  const totalOnHand = levels.reduce((s, l) => s + l.qty_on_hand, 0)
  const totalAvailable = levels.reduce((s, l) => s + l.qty_available, 0)
  const lowStockCount = levels.filter(l => l.is_low_stock).length

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock by Location</h1>
          <p className="page-subtitle">View stock levels at any warehouse location</p>
        </div>
      </div>

      {/* Location selector */}
      <div className="card card-body">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <label className="label mb-0 font-semibold">Location</label>
          </div>
          <select
            className="select w-72"
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
          >
            <option value="">— Select a location —</option>
            {locs.map(l => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
          </select>
          {locationId && (
            <SearchBar value={search} onChange={v => setSearch(v)} placeholder="Filter by SKU or product name..." />
          )}
        </div>
      </div>

      {!locationId && (
        <div className="card p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Select a location to view stock</p>
          <p className="text-gray-400 text-sm mt-1">Choose a warehouse location from the dropdown above</p>
        </div>
      )}

      {locationId && isLoading && <Loading />}

      {locationId && !isLoading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card card-body text-center">
              <div className="text-2xl font-bold text-brand-700">{levels.length}</div>
              <div className="text-xs text-gray-500 mt-1">SKUs at {selectedLoc?.code}</div>
            </div>
            <div className="card card-body text-center">
              <div className="text-2xl font-bold text-brand-700">{fmt.number(totalOnHand)}</div>
              <div className="text-xs text-gray-500 mt-1">Total On Hand</div>
            </div>
            <div className="card card-body text-center">
              <div className="text-2xl font-bold text-green-600">{fmt.number(totalAvailable)}</div>
              <div className="text-xs text-gray-500 mt-1">Available</div>
            </div>
            <div className="card card-body text-center">
              <div className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{lowStockCount}</div>
              <div className="text-xs text-gray-500 mt-1">Low Stock Items</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="font-semibold">Stock at {selectedLoc?.code} — {selectedLoc?.name}</span>
              <span className="text-sm text-gray-400">{levels.length} product{levels.length !== 1 ? 's' : ''}</span>
            </div>
            {levels.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {search ? 'No products match your search' : 'No stock recorded at this location'}
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th className="text-right">On Hand</th>
                      <th className="text-right">Reserved</th>
                      <th className="text-right">Available</th>
                      <th className="text-right">Damaged</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levels.map(sl => (
                      <tr key={sl.id} className="cursor-pointer hover:bg-gray-50" onClick={() => nav(`/products/${sl.product}`)}>
                        <td>
                          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{sl.product_sku}</span>
                        </td>
                        <td className="font-medium">{sl.product_title}</td>
                        <td className="text-right font-semibold">{sl.qty_on_hand}</td>
                        <td className="text-right text-amber-600">{sl.qty_reserved || 0}</td>
                        <td className={`text-right font-bold ${sl.qty_available <= 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {sl.qty_available}
                        </td>
                        <td className={`text-right ${sl.qty_damaged > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          {sl.qty_damaged || 0}
                        </td>
                        <td>
                          {sl.is_low_stock ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
                              <AlertTriangle className="w-3 h-3" /> Low Stock
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs">OK</span>
                          )}
                        </td>
                        <td className="text-xs text-gray-400">{fmt.shortDate(sl.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
