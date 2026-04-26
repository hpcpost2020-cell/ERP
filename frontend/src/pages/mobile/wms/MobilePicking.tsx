import { useState } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import ScanInput from '../../../components/mobile/ScanInput'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { sales, products as productApi } from '../../../api/endpoints'
import { useQuery } from '@tanstack/react-query'
import Loading from '../../../components/ui/Loading'
import StatusBadge from '../../../components/ui/StatusBadge'
import { ClipboardList, CheckCircle2, AlertTriangle, ScanLine, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Order {
  id: number; order_number: string; customer_name: string; channel: string
  status: string; total_value: number; items_count: number
}
interface OrderItem { id: number; sku?: string; title?: string; quantity: number }
interface StockLevel { product_sku: string; qty_available: number; location_code: string }

type Screen = 'ORDERS' | 'PICK'

export default function MobilePicking() {
  const { isOnline, pendingCount } = useOfflineQueue()
  const nav = useNavigate()

  const [screen, setScreen] = useState<Screen>('ORDERS')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set())
  const [scanError, setScanError] = useState('')
  const [scanSuccess, setScanSuccess] = useState('')
  const [scanKey, setScanKey] = useState(0)
  const { success, error } = useScanFeedback()

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['mobile-picking-orders'],
    queryFn: () => sales.list({ status: 'confirmed,processing,awaiting_dispatch', page_size: 50, ordering: 'created_at' }).then(r => r.data),
    refetchInterval: 60000,
  })
  const orders: Order[] = Array.isArray(ordersData) ? ordersData : ordersData?.results || []

  const { data: stockData } = useQuery({
    queryKey: ['mobile-all-stock'],
    queryFn: () => productApi.stockLevels({ page_size: 1000 }).then(r => r.data),
    staleTime: 120000,
  })
  const stockLevels: StockLevel[] = Array.isArray(stockData) ? stockData : stockData?.results || []

  const { data: stockStatus } = useQuery({
    queryKey: ['mobile-stock-status'],
    queryFn: () => sales.stockStatus({ status: 'confirmed,processing,awaiting_dispatch' }).then(r => r.data),
    staleTime: 120000,
  })
  const statusMap: Record<string, boolean> = stockStatus || {}

  const { data: orderDetail } = useQuery({
    queryKey: ['mobile-order-detail', selectedOrder?.id],
    queryFn: () => sales.get(selectedOrder!.id).then(r => r.data),
    enabled: !!selectedOrder,
  })
  const items: OrderItem[] = orderDetail?.items || []
  const unpickedItems = items.filter(i => !pickedIds.has(i.id))
  const allPicked = items.length > 0 && pickedIds.size === items.length

  const getStock = (sku: string) => stockLevels.filter(s => s.product_sku === sku && s.qty_available > 0)
    .sort((a, b) => b.qty_available - a.qty_available)

  const handleScan = async (val: string) => {
    setScanError('')
    setScanSuccess('')
    if (unpickedItems.length === 0) return

    // Try to match scan to an unpicked item
    let matchedItem: OrderItem | null = null

    // Direct SKU match
    const skuMatch = unpickedItems.find(i => i.sku === val.trim().toUpperCase())
    if (skuMatch) { matchedItem = skuMatch }
    else {
      // Barcode lookup
      try {
        const res = await productApi.searchByBarcode(val)
        const results = Array.isArray(res.data) ? res.data : res.data?.results || []
        if (results.length > 0) {
          const scannedSku = results[0].sku
          matchedItem = unpickedItems.find(i => i.sku === scannedSku) || null
        }
      } catch { /* ignore lookup errors */ }
    }

    if (matchedItem) {
      setPickedIds(p => new Set(p).add(matchedItem!.id))
      setScanSuccess(`✓ ${matchedItem.sku || 'Item'} picked`)
      setScanKey(k => k + 1)
      success()
    } else {
      setScanError(`"${val}" not on this order or already picked`)
      setScanKey(k => k + 1)
      error()
    }
  }

  const openOrder = (order: Order) => {
    setSelectedOrder(order)
    setPickedIds(new Set())
    setScreen('PICK')
    setScanError('')
    setScanSuccess('')
  }

  if (screen === 'PICK' && selectedOrder) {
    return (
      <MobileLayout
        title={selectedOrder.order_number}
        subtitle={`${pickedIds.size}/${items.length} picked · ${selectedOrder.customer_name}`}
        onBack={() => { setScreen('ORDERS'); setSelectedOrder(null) }}
        isOnline={isOnline}
        pendingCount={pendingCount}
      >
        <div className="p-4 space-y-4">
          {allPicked && (
            <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-green-800 font-bold text-xl">Order Complete!</p>
              <p className="text-green-700 text-sm">All {items.length} line{items.length !== 1 ? 's' : ''} picked</p>
              <button className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold text-lg active:bg-green-700"
                onClick={() => nav(`/sales/${selectedOrder.id}`)}>
                Open in ERP <ExternalLink className="w-4 h-4 inline ml-1" />
              </button>
              <button className="w-full py-3 bg-gray-100 text-gray-600 rounded-2xl font-medium active:bg-gray-200"
                onClick={() => { setScreen('ORDERS'); setSelectedOrder(null) }}>
                ← Back to orders
              </button>
            </div>
          )}

          {!allPicked && (
            <>
              {/* Scan input */}
              <div className="space-y-2">
                <ScanInput key={`pick-scan-${scanKey}`} onScan={handleScan} label={`Scan product (${unpickedItems.length} remaining)`} />
                {scanSuccess && (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> {scanSuccess}
                  </div>
                )}
                {scanError && (
                  <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {scanError}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{pickedIds.size} picked</span>
                  <span>{unpickedItems.length} remaining</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: items.length > 0 ? `${(pickedIds.size / items.length) * 100}%` : '0%' }} />
                </div>
              </div>

              {/* Pick list */}
              {items.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">Loading items…</div>}
              {items.map(item => {
                const isPicked = pickedIds.has(item.id)
                const sku = item.sku || ''
                const locs = getStock(sku)
                const totalAvail = locs.reduce((t, l) => t + l.qty_available, 0)
                const hasEnough = totalAvail >= item.quantity

                return (
                  <div key={item.id} className={`bg-white rounded-2xl p-4 flex items-start gap-3 ${isPicked ? 'opacity-50' : ''}`}>
                    <button
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors
                        ${isPicked ? 'bg-green-500 border-green-500' : 'border-gray-300 active:border-green-400'}`}
                      onClick={() => setPickedIds(p => { const next = new Set(p); isPicked ? next.delete(item.id) : next.add(item.id); return next })}
                    >
                      {isPicked && <CheckCircle2 className="w-5 h-5 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-gray-800">{sku || '—'}</span>
                        {!hasEnough && !isPicked && (
                          <span className="text-xs bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Short
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{item.title}</p>
                      {!isPicked && locs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {locs.slice(0, 3).map(l => (
                            <span key={l.location_code} className="text-xs bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded-lg">
                              {l.location_code} ({l.qty_available})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-800 text-lg">{item.quantity}</p>
                      <p className="text-xs text-gray-400">needed</p>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </MobileLayout>
    )
  }

  // Order list screen
  return (
    <MobileLayout
      title="Pick List"
      subtitle={`${orders.length} orders ready`}
      onBack="/mobile/wms"
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className="p-4 space-y-3">
        {isLoading && <div className="py-12"><Loading /></div>}

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-16">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold text-lg">No orders to pick</p>
            <p className="text-gray-400 text-sm mt-1">Orders appear here when confirmed</p>
          </div>
        )}

        {!isLoading && orders.map(order => {
          const hasStockIssue = statusMap[String(order.id)] === true
          return (
            <button
              key={order.id}
              className="w-full bg-white rounded-2xl p-4 text-left active:bg-gray-50 space-y-2"
              onClick={() => openOrder(order)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-gray-800 text-lg">{order.order_number}</span>
                  <StatusBadge status={order.status} />
                  {hasStockIssue && (
                    <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Stock short
                    </span>
                  )}
                </div>
                <ScanLine className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
              </div>
              <p className="text-gray-600 truncate">{order.customer_name}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="capitalize">{order.channel}</span>
                <span>·</span>
                <span>{order.items_count} line{order.items_count !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>£{parseFloat(String(order.total_value)).toFixed(2)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </MobileLayout>
  )
}
