import { useRef, useState } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import ScanInput from '../../../components/mobile/ScanInput'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { sales } from '../../../api/endpoints'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Loading from '../../../components/ui/Loading'
import { CheckCircle2, AlertTriangle, Package, RefreshCw, Truck } from 'lucide-react'

const COURIERS = [
  { value: 'evri', label: 'Evri (Hermes)' },
  { value: 'royal_mail', label: 'Royal Mail' },
  { value: 'dpd', label: 'DPD' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'parcelforce', label: 'Parcelforce' },
  { value: 'dhl', label: 'DHL' },
  { value: 'yodel', label: 'Yodel' },
  { value: 'other', label: 'Other' },
]

interface Order {
  id: number; order_number: string; customer_name: string; channel: string
  status: string; total_value: number; items_count: number
  ship_to_name: string; ship_to_address1?: string; ship_to_city?: string; ship_to_postcode?: string
}
interface OrderItem { id: number; sku?: string; title?: string; quantity: number }

type Screen = 'ORDERS' | 'DISPATCH_FORM'

export default function MobileDispatch() {
  const { isOnline, pendingCount, executeOrQueue } = useOfflineQueue()
  const { success, error } = useScanFeedback()
  const qc = useQueryClient()
  const trackingRef = useRef<HTMLInputElement>(null)

  const [screen, setScreen] = useState<Screen>('ORDERS')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [courier, setCourier] = useState('evri')
  const [tracking, setTracking] = useState('')
  const [cost, setCost] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState('')
  const [lastDispatched, setLastDispatched] = useState<string | null>(null)

  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['mobile-dispatch-orders'],
    queryFn: () => sales.list({ status: 'awaiting_dispatch', page_size: 50, ordering: 'created_at' }).then(r => r.data),
    refetchInterval: 30000,
  })
  const orders: Order[] = Array.isArray(ordersData) ? ordersData : ordersData?.results || []

  const { data: orderDetail } = useQuery({
    queryKey: ['mobile-order-detail', selectedOrder?.id],
    queryFn: () => sales.get(selectedOrder!.id).then(r => r.data),
    enabled: !!selectedOrder,
  })
  const items: OrderItem[] = orderDetail?.items || []

  const handleOpenOrder = (order: Order) => {
    setSelectedOrder(order)
    setTracking('')
    setCost('')
    setCourier('evri')
    setDispatchError('')
    setScreen('DISPATCH_FORM')
    setTimeout(() => trackingRef.current?.focus(), 200)
  }

  const handleDispatch = async () => {
    if (!selectedOrder) return
    if (!tracking.trim()) { setDispatchError('Tracking number is required'); error(); return }
    setDispatching(true)
    setDispatchError('')
    try {
      const result = await executeOrQueue('order_dispatch', {
        order_id: selectedOrder.id,
        tracking_number: tracking.trim(),
        courier,
        cost: cost ? parseFloat(cost) : 0,
      })
      success()
      setLastDispatched(`${selectedOrder.order_number} dispatched via ${COURIERS.find(c => c.value === courier)?.label || courier}${result === 'queued' ? ' (queued)' : ''}`)
      qc.invalidateQueries({ queryKey: ['mobile-dispatch-orders'] })
      setScreen('ORDERS')
      setSelectedOrder(null)
    } catch { setDispatchError('Dispatch failed — try again'); error() }
    finally { setDispatching(false) }
  }

  // ── Dispatch form ─────────────────────────────────────────────────────────

  if (screen === 'DISPATCH_FORM' && selectedOrder) {
    return (
      <MobileLayout
        title={selectedOrder.order_number}
        subtitle={`Dispatch · ${selectedOrder.customer_name}`}
        onBack={() => setScreen('ORDERS')}
        isOnline={isOnline}
        pendingCount={pendingCount}
      >
        <div className="p-4 space-y-4">
          {dispatchError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{dispatchError}</p>
            </div>
          )}

          {/* Shipping address */}
          {(selectedOrder.ship_to_name || orderDetail?.ship_to_name) && (
            <div className="bg-white rounded-2xl p-4 space-y-1">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Ship To</p>
              <p className="font-semibold text-gray-800">{orderDetail?.ship_to_name || selectedOrder.ship_to_name}</p>
              {orderDetail?.ship_to_address1 && <p className="text-sm text-gray-600">{orderDetail.ship_to_address1}</p>}
              {orderDetail?.ship_to_city && <p className="text-sm text-gray-600">{orderDetail.ship_to_city}</p>}
              {orderDetail?.ship_to_postcode && <p className="text-sm font-mono font-bold text-gray-800">{orderDetail.ship_to_postcode}</p>}
            </div>
          )}

          {/* Items summary */}
          {items.length > 0 && (
            <div className="bg-white rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">{items.length} Item{items.length !== 1 ? 's' : ''}</p>
              </div>
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <span className="font-mono text-sm font-bold flex-1">{item.sku || '—'}</span>
                  <span className="text-sm text-gray-500 truncate max-w-[120px]">{item.title}</span>
                  <span className="font-bold text-gray-800 shrink-0">×{item.quantity}</span>
                </div>
              ))}
            </div>
          )}

          {/* Courier */}
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Courier *</p>
            <div className="grid grid-cols-2 gap-2">
              {COURIERS.map(c => (
                <button
                  key={c.value}
                  className={`py-3 px-3 rounded-xl text-sm font-semibold text-left transition-colors active:opacity-80
                    ${courier === c.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                  onClick={() => setCourier(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tracking number — scan ready */}
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Tracking Number *</p>
            <ScanInput
              key="tracking"
              onScan={val => setTracking(val)}
              placeholder="Scan or type tracking number…"
              autoFocus={false}
            />
            {tracking && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span className="font-mono text-sm font-bold text-green-800">{tracking}</span>
                <button className="ml-auto text-xs text-gray-400" onClick={() => setTracking('')}>Clear</button>
              </div>
            )}
          </div>

          {/* Cost (optional) */}
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Shipping Cost (optional)</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">£</span>
              <input
                className="w-full pl-8 pr-4 py-4 text-xl border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={e => setCost(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>

          <button
            className="w-full py-6 bg-blue-700 text-white rounded-2xl text-2xl font-bold active:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-3"
            onClick={handleDispatch}
            disabled={dispatching || !tracking.trim()}
          >
            {dispatching
              ? <><RefreshCw className="w-6 h-6 animate-spin" /> Dispatching…</>
              : <><Truck className="w-6 h-6" /> Dispatch Order</>}
          </button>
        </div>
      </MobileLayout>
    )
  }

  // ── Orders list ───────────────────────────────────────────────────────────

  return (
    <MobileLayout
      title="Dispatch"
      subtitle={`${orders.length} ready to dispatch`}
      onBack="/mobile/wms"
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className="p-4 space-y-3">
        {lastDispatched && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 font-medium flex-1">{lastDispatched}</p>
            <button className="text-xs text-green-600" onClick={() => setLastDispatched(null)}>×</button>
          </div>
        )}

        {isLoading && <div className="py-12"><Loading /></div>}

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Truck className="w-16 h-16 text-gray-300 mx-auto" />
            <p className="text-gray-500 font-semibold text-lg">No orders ready</p>
            <p className="text-gray-400 text-sm">Orders appear here after picking is complete</p>
          </div>
        )}

        {orders.map(order => (
          <button
            key={order.id}
            className="w-full bg-white rounded-2xl p-4 text-left active:bg-gray-50 space-y-2"
            onClick={() => handleOpenOrder(order)}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono font-bold text-gray-800 text-lg">{order.order_number}</span>
              <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-1 rounded-full shrink-0">Ready</span>
            </div>
            <p className="text-gray-600">{order.ship_to_name || order.customer_name}</p>
            {order.ship_to_postcode && (
              <p className="text-sm font-mono text-gray-500">{order.ship_to_postcode}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <Package className="w-3 h-3" />
              <span>{order.items_count} item{order.items_count !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>£{parseFloat(String(order.total_value)).toFixed(2)}</span>
            </div>
          </button>
        ))}

        <button
          className="w-full py-3 bg-gray-100 text-gray-500 rounded-2xl active:bg-gray-200 flex items-center justify-center gap-2"
          onClick={() => refetch()}
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
    </MobileLayout>
  )
}
