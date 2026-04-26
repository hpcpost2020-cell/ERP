import { useState, useEffect } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import ScanInput from '../../../components/mobile/ScanInput'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { sales, products as productApi } from '../../../api/endpoints'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Loading from '../../../components/ui/Loading'
import StatusBadge from '../../../components/ui/StatusBadge'
import {
  ClipboardList, CheckCircle2, AlertTriangle, ChevronRight,
  Truck, RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// ── Session persistence helpers ─────────────────────────────────────────────

const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 hours

function loadPickSession(orderId: number): number[] {
  try {
    const raw = localStorage.getItem(`pick_${orderId}`)
    if (!raw) return []
    const data = JSON.parse(raw) as { ids: number[]; ts: number }
    if (Date.now() - data.ts > SESSION_TTL) { localStorage.removeItem(`pick_${orderId}`); return [] }
    return data.ids || []
  } catch { return [] }
}

function savePickSession(orderId: number, ids: number[]) {
  // Preserve the original session start time so TTL is from first open, not last update
  let ts = Date.now()
  try {
    const existing = localStorage.getItem(`pick_${orderId}`)
    if (existing) ts = (JSON.parse(existing) as { ts: number }).ts || ts
  } catch { /* use now */ }
  localStorage.setItem(`pick_${orderId}`, JSON.stringify({ ids, ts }))
}

function clearPickSession(orderId: number) {
  localStorage.removeItem(`pick_${orderId}`)
}

// ── Types ───────────────────────────────────────────────────────────────────

interface Order {
  id: number; order_number: string; customer_name: string; channel: string
  status: string; total_value: number; items_count: number
}
interface OrderItem { id: number; sku?: string; title?: string; quantity: number }
interface StockLevel { product_sku: string; qty_available: number; location_code: string }

type Screen = 'ORDERS' | 'PICK' | 'HANDOVER'

// ── Page ────────────────────────────────────────────────────────────────────

export default function MobilePicking() {
  const { isOnline, pendingCount, executeOrQueue } = useOfflineQueue()
  const { success, error } = useScanFeedback()
  const nav = useNavigate()
  const qc = useQueryClient()

  const [screen, setScreen] = useState<Screen>('ORDERS')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set())
  const [scanError, setScanError] = useState('')
  const [scanSuccess, setScanSuccess] = useState('')
  const [scanKey, setScanKey] = useState(0)
  const [markingReady, setMarkingReady] = useState(false)
  const [handoverQueued, setHandoverQueued] = useState(false)

  const { data: ordersData, isLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['mobile-picking-orders'],
    queryFn: () => sales.list({
      status: 'confirmed,processing,awaiting_dispatch',
      page_size: 50,
      ordering: 'created_at',
    }).then(r => r.data),
    refetchInterval: 60000,
  })
  const orders: Order[] = Array.isArray(ordersData) ? ordersData : ordersData?.results || []

  const { data: stockData } = useQuery({
    queryKey: ['mobile-all-stock'],
    queryFn: () => productApi.stockLevels({ page_size: 1000 }).then(r => r.data),
    staleTime: 120000,
  })
  const stockLevels: StockLevel[] = Array.isArray(stockData) ? stockData : stockData?.results || []

  const { data: statusData } = useQuery({
    queryKey: ['mobile-stock-status'],
    queryFn: () => sales.stockStatus({ status: 'confirmed,processing,awaiting_dispatch' }).then(r => r.data),
    staleTime: 120000,
  })
  const stockStatusMap: Record<string, boolean> = statusData || {}

  const { data: orderDetail } = useQuery({
    queryKey: ['mobile-order-detail', selectedOrder?.id],
    queryFn: () => sales.get(selectedOrder!.id).then(r => r.data),
    enabled: !!selectedOrder,
  })
  const items: OrderItem[] = orderDetail?.items || []

  // Keep pickedIds in sync with localStorage whenever it changes
  useEffect(() => {
    if (selectedOrder && pickedIds.size >= 0) {
      savePickSession(selectedOrder.id, Array.from(pickedIds))
    }
  }, [pickedIds, selectedOrder])

  const allPicked = items.length > 0 && pickedIds.size >= items.length

  const getStock = (sku: string) =>
    stockLevels.filter(s => s.product_sku === sku && s.qty_available > 0)
      .sort((a, b) => b.qty_available - a.qty_available)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenOrder = async (order: Order) => {
    const savedIds = loadPickSession(order.id)
    setPickedIds(new Set(savedIds))
    setSelectedOrder(order)
    setScanError('')
    setScanSuccess('')
    setScreen('PICK')

    // Non-critical: promote confirmed → processing so status reflects reality
    if (order.status === 'confirmed' && isOnline) {
      sales.markProcessing(order.id).catch(() => { /* ignore */ })
    }
  }

  const toggleItem = (itemId: number) => {
    setPickedIds(prev => {
      const next = new Set(prev)
      next.has(itemId) ? next.delete(itemId) : next.add(itemId)
      return next
    })
  }

  const handleScan = async (val: string) => {
    setScanError('')
    setScanSuccess('')
    const unpicked = items.filter(i => !pickedIds.has(i.id))
    if (unpicked.length === 0) return

    let matched: OrderItem | null = null

    // Direct SKU match first (fast, no network)
    const direct = unpicked.find(i => i.sku === val.trim().toUpperCase())
    if (direct) {
      matched = direct
    } else if (isOnline) {
      // Barcode lookup
      try {
        const res = await productApi.searchByBarcode(val)
        const results = Array.isArray(res.data) ? res.data : res.data?.results || []
        if (results.length > 0) {
          const scannedSku = results[0].sku as string
          matched = unpicked.find(i => i.sku === scannedSku) || null
        }
      } catch { /* ignore */ }
    }

    if (matched) {
      setPickedIds(prev => new Set(prev).add(matched!.id))
      setScanSuccess(`✓ ${matched.sku || 'item'} picked`)
      setScanKey(k => k + 1)
      success()
    } else {
      setScanError(`"${val}" not on this order or already picked`)
      setScanKey(k => k + 1)
      error()
    }
  }

  const handleCompletePickng = async () => {
    if (!selectedOrder) return
    setMarkingReady(true)
    try {
      const result = await executeOrQueue('order_mark_ready', { order_id: selectedOrder.id })
      clearPickSession(selectedOrder.id)
      setHandoverQueued(result === 'queued')
      setScreen('HANDOVER')
      // Invalidate orders list so status badge updates
      qc.invalidateQueries({ queryKey: ['mobile-picking-orders'] })
    } catch { /* show handover anyway */ setScreen('HANDOVER') }
    finally { setMarkingReady(false) }
  }

  const handleBackToOrders = () => {
    setScreen('ORDERS')
    setSelectedOrder(null)
    setScanError('')
    setScanSuccess('')
    refetchOrders()
  }

  // ── Render: ORDERS ────────────────────────────────────────────────────────

  if (screen === 'ORDERS') {
    const active = orders.filter(o => ['confirmed', 'processing'].includes(o.status))
    const ready = orders.filter(o => o.status === 'awaiting_dispatch')

    return (
      <MobileLayout title="Pick List" subtitle={`${active.length} to pick`}
        onBack="/mobile/wms" isOnline={isOnline} pendingCount={pendingCount}>
        <div className="p-4 space-y-4">

          {isLoading && <div className="py-12"><Loading /></div>}

          {!isLoading && orders.length === 0 && (
            <div className="text-center py-16">
              <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold text-lg">No orders to pick</p>
            </div>
          )}

          {/* Ready-to-dispatch banner */}
          {ready.length > 0 && (
            <button className="w-full bg-green-50 border-2 border-green-300 rounded-2xl p-4 flex items-center gap-3 active:bg-green-100"
              onClick={() => nav('/mobile/wms/dispatch')}>
              <Truck className="w-8 h-8 text-green-600 shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-bold text-green-800">{ready.length} order{ready.length !== 1 ? 's' : ''} ready to dispatch</p>
                <p className="text-sm text-green-600">Tap to open Dispatch screen</p>
              </div>
              <ChevronRight className="w-5 h-5 text-green-500" />
            </button>
          )}

          {/* Active orders */}
          {active.length > 0 && (
            <div className="space-y-2">
              {active.length > 0 && <p className="text-xs text-gray-400 uppercase font-bold tracking-wide px-1">To Pick ({active.length})</p>}
              {active.map(order => {
                const hasSession = loadPickSession(order.id).length > 0
                const hasStockIssue = stockStatusMap[String(order.id)] === true
                return (
                  <button key={order.id}
                    className="w-full bg-white rounded-2xl p-4 text-left active:bg-gray-50 space-y-2"
                    onClick={() => handleOpenOrder(order)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-gray-800 text-lg">{order.order_number}</span>
                        <StatusBadge status={order.status} />
                        {hasStockIssue && (
                          <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Short
                          </span>
                        )}
                        {hasSession && (
                          <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                            In progress
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
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
          )}

          <button className="w-full py-3 bg-gray-100 text-gray-500 rounded-2xl active:bg-gray-200 flex items-center justify-center gap-2"
            onClick={() => refetchOrders()}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </MobileLayout>
    )
  }

  // ── Render: HANDOVER ──────────────────────────────────────────────────────

  if (screen === 'HANDOVER' && selectedOrder) {
    return (
      <MobileLayout title="Picking Complete" onBack={handleBackToOrders}
        isOnline={isOnline} pendingCount={pendingCount}>
        <div className="p-4 space-y-4">
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 text-center space-y-2">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
            <p className="text-2xl font-bold text-green-800">{selectedOrder.order_number}</p>
            <p className="text-green-700">{selectedOrder.customer_name}</p>
            <p className="text-green-600 text-sm">All {items.length} line{items.length !== 1 ? 's' : ''} picked</p>
            {handoverQueued && (
              <p className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Status update queued — will sync when online
              </p>
            )}
          </div>

          <button
            className="w-full py-6 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700 flex items-center justify-center gap-3"
            onClick={() => nav('/mobile/wms/dispatch')}
          >
            <Truck className="w-6 h-6" /> Go to Dispatch
          </button>

          <button
            className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl active:bg-gray-200 font-medium"
            onClick={handleBackToOrders}
          >
            ← Back to Pick List
          </button>
        </div>
      </MobileLayout>
    )
  }

  // ── Render: PICK ──────────────────────────────────────────────────────────

  return (
    <MobileLayout
      title={selectedOrder?.order_number || ''}
      subtitle={`${pickedIds.size}/${items.length} picked · ${selectedOrder?.customer_name || ''}`}
      onBack={() => setScreen('ORDERS')}
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className="p-4 space-y-4">
        {/* Scan input */}
        <div className="space-y-2">
          <ScanInput
            key={`pick-scan-${scanKey}`}
            onScan={handleScan}
            label={`Scan product (${items.filter(i => !pickedIds.has(i.id)).length} remaining)`}
          />
          {scanSuccess && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {scanSuccess}
            </div>
          )}
          {scanError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm font-medium text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {scanError}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {items.length > 0 && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{pickedIds.size} picked</span>
              <span>{items.length - pickedIds.size} remaining</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(pickedIds.size / items.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Complete button — appears when all items ticked */}
        {allPicked && (
          <button
            className="w-full py-5 bg-green-600 text-white rounded-2xl text-xl font-bold active:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            onClick={handleCompletePickng}
            disabled={markingReady}
          >
            {markingReady
              ? <><RefreshCw className="w-5 h-5 animate-spin" /> Marking ready…</>
              : <><CheckCircle2 className="w-6 h-6" /> Mark Ready to Dispatch</>}
          </button>
        )}

        {/* Pick list items */}
        {items.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">Loading items…</div>}
        {items.map(item => {
          const isPicked = pickedIds.has(item.id)
          const sku = item.sku || ''
          const locs = getStock(sku)
          const totalAvail = locs.reduce((t, l) => t + l.qty_available, 0)
          const hasEnough = totalAvail >= item.quantity

          return (
            <div key={item.id}
              className={`bg-white rounded-2xl p-4 flex items-start gap-3 transition-opacity ${isPicked ? 'opacity-40' : ''}`}>
              <button
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors active:scale-95
                  ${isPicked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                onClick={() => toggleItem(item.id)}
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
                    {locs.length === 0 && !isPicked && (
                      <span className="text-xs text-red-500">No stock found</span>
                    )}
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
      </div>
    </MobileLayout>
  )
}
