import { useState } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import ScanInput from '../../../components/mobile/ScanInput'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { products as productApi } from '../../../api/endpoints'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, Minus, Plus } from 'lucide-react'

type Step = 'SCAN_LOCATION' | 'SCAN_PRODUCT' | 'ENTER_COUNT'

interface Product { id: number; sku: string; title: string }
interface Location { id: number; code: string; name: string }
interface StockLevel { qty_on_hand: number; qty_available: number }

interface CountRecord { sku: string; systemQty: number; countedQty: number; delta: number }

export default function MobileStockCount() {
  const { isOnline, pendingCount, executeOrQueue } = useOfflineQueue()
  const { success, error } = useScanFeedback()

  const [step, setStep] = useState<Step>('SCAN_LOCATION')
  const [location, setLocation] = useState<Location | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [systemQty, setSystemQty] = useState(0)
  const [count, setCount] = useState(0)
  const [scanError, setScanError] = useState('')
  const [saving, setSaving] = useState(false)
  const [counted, setCounted] = useState<CountRecord[]>([])

  const { data: locsData } = useQuery({
    queryKey: ['mobile-locations'],
    queryFn: () => productApi.locations({ is_active: true, page_size: 200 }).then(r => r.data),
    staleTime: 300000,
  })
  const locs: Location[] = Array.isArray(locsData) ? locsData : locsData?.results || []

  const { data: stockData } = useQuery({
    queryKey: ['mobile-stock-at', location?.id, product?.id],
    queryFn: () => productApi.stockLevels({ location: location!.id, product: product!.id, page_size: 1 }).then(r => r.data),
    enabled: !!location && !!product,
  })
  const stockLevels: StockLevel[] = Array.isArray(stockData) ? stockData : stockData?.results || []
  const currentStock = stockLevels[0]?.qty_on_hand ?? 0

  const err = (msg: string) => { setScanError(msg); error() }

  const handleScanLocation = (val: string) => {
    setScanError('')
    const code = val.trim().toUpperCase()
    const found = locs.find(l => l.code === code)
    if (!found) { err(`Unknown location: "${code}"`); return }
    setLocation(found); setCounted([]); setStep('SCAN_PRODUCT'); success()
  }

  const handleScanProduct = async (val: string) => {
    setScanError('')
    try {
      const res = await productApi.searchByBarcode(val)
      const results = Array.isArray(res.data) ? res.data : res.data?.results || []
      if (results.length > 0) {
        setProduct(results[0]); setSystemQty(currentStock); setCount(currentStock); setStep('ENTER_COUNT'); success(); return
      }
      const sr = await productApi.list({ search: val, page_size: 5 })
      const items = Array.isArray(sr.data) ? sr.data : sr.data?.results || []
      const exact = items.find((p: Product) => p.sku === val.toUpperCase())
      if (exact) { setProduct(exact); setSystemQty(currentStock); setCount(currentStock); setStep('ENTER_COUNT'); success() }
      else err(`No product: "${val}"`)
    } catch { err('Scan failed — retry') }
  }

  const handleSubmitCount = async () => {
    if (!product || !location) return
    const delta = count - systemQty
    if (delta === 0) {
      // No adjustment needed — just record as counted
      setCounted(p => [...p, { sku: product.sku, systemQty, countedQty: count, delta: 0 }])
      success()
      setStep('SCAN_PRODUCT'); setProduct(null); setScanError('')
      return
    }
    setSaving(true)
    setScanError('')
    try {
      const result = await executeOrQueue('adjust', {
        product: product.id, location: location.id, quantity: delta,
        notes: `Stock count: system ${systemQty}, actual ${count}`,
      })
      success()
      setCounted(p => [...p, { sku: product.sku, systemQty, countedQty: count, delta }])
      if (result === 'queued') setScanError('Queued — will sync when online')
      setStep('SCAN_PRODUCT'); setProduct(null)
    } catch { err('Save failed — try again') }
    finally { setSaving(false) }
  }

  return (
    <MobileLayout
      title="Stock Count"
      subtitle={location ? `Location: ${location.code}` : 'Scan a location to begin'}
      onBack="/mobile/wms"
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className="p-4 space-y-4">
        {scanError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{scanError}</p>
          </div>
        )}

        {step === 'SCAN_LOCATION' && (
          <ScanInput key="loc" onScan={handleScanLocation} label="Scan location barcode" />
        )}

        {(step === 'SCAN_PRODUCT' || step === 'ENTER_COUNT') && location && (
          <div className="space-y-4">
            {/* Location confirmed */}
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <span className="font-mono font-bold text-blue-800 text-lg">{location.code}</span>
                  <span className="text-sm text-blue-600 ml-2">{location.name}</span>
                </div>
              </div>
              <button className="text-xs text-blue-600 font-semibold px-2 py-1 active:opacity-70"
                onClick={() => { setStep('SCAN_LOCATION'); setLocation(null); setProduct(null); setCounted([]) }}>
                Change
              </button>
            </div>

            {step === 'SCAN_PRODUCT' && (
              <ScanInput key={`product-${counted.length}`} onScan={handleScanProduct} label="Scan product barcode or SKU" />
            )}

            {step === 'ENTER_COUNT' && product && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4">
                  <p className="font-mono font-bold text-blue-700 text-xl">{product.sku}</p>
                  <p className="text-gray-600 text-sm">{product.title}</p>
                  <p className="text-xs text-gray-400 mt-1">System qty: <strong>{systemQty}</strong></p>
                </div>
                <div className="bg-white rounded-2xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wide mb-3">Actual Count</p>
                  <div className="flex items-center gap-4">
                    <button className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center active:bg-gray-200" onClick={() => setCount(c => Math.max(0, c - 1))}>
                      <Minus className="w-7 h-7" />
                    </button>
                    <input
                      className="flex-1 text-center text-4xl font-bold border-2 border-gray-200 rounded-2xl py-3 focus:border-blue-500 focus:outline-none"
                      type="number" min="0" value={count}
                      onChange={e => setCount(Math.max(0, parseInt(e.target.value) || 0))}
                      inputMode="numeric"
                      autoFocus
                    />
                    <button className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center active:bg-blue-700" onClick={() => setCount(c => c + 1)}>
                      <Plus className="w-7 h-7 text-white" />
                    </button>
                  </div>
                  {count !== systemQty && (
                    <p className={`text-center text-sm font-bold mt-2 ${count > systemQty ? 'text-green-600' : 'text-red-600'}`}>
                      Delta: {count > systemQty ? '+' : ''}{count - systemQty} from system
                    </p>
                  )}
                </div>
                <button className="w-full py-5 bg-green-600 text-white rounded-2xl text-xl font-bold active:bg-green-700 disabled:opacity-50"
                  onClick={handleSubmitCount} disabled={saving}>
                  {saving ? 'Saving…' : count === systemQty ? '✓ Confirm (no change)' : `✓ Submit Count (${count > systemQty ? '+' : ''}${count - systemQty})`}
                </button>
                <button className="w-full py-3 bg-gray-100 text-gray-500 rounded-2xl active:bg-gray-200"
                  onClick={() => { setStep('SCAN_PRODUCT'); setProduct(null); setScanError('') }}>
                  ← Back to product scan
                </button>
              </div>
            )}

            {/* Count log */}
            {counted.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="font-semibold text-sm text-gray-600">This Session — {location.code}</p>
                </div>
                {counted.map((r, i) => (
                  <div key={i} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0 gap-3">
                    <span className="font-mono text-sm font-bold flex-1">{r.sku}</span>
                    <span className="text-sm text-gray-400">sys: {r.systemQty}</span>
                    <span className="text-sm font-bold text-gray-800">→ {r.countedQty}</span>
                    <span className={`text-sm font-bold w-10 text-right ${r.delta > 0 ? 'text-green-600' : r.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {r.delta > 0 ? '+' : ''}{r.delta !== 0 ? r.delta : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MobileLayout>
  )
}
