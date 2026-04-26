import { useState } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import ScanInput from '../../../components/mobile/ScanInput'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { products as productApi } from '../../../api/endpoints'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, Minus, Plus, ArrowRight } from 'lucide-react'

type Step = 'SCAN_PRODUCT' | 'ENTER_QTY' | 'SCAN_BIN' | 'CONFIRM'

interface Product { id: number; sku: string; title: string; barcode?: string }
interface Location { id: number; code: string; name: string; is_receiving_bay?: boolean }

export default function MobilePutAway() {
  const { isOnline, pendingCount, executeOrQueue } = useOfflineQueue()
  const { success, error } = useScanFeedback()

  const [step, setStep] = useState<Step>('SCAN_PRODUCT')
  const [product, setProduct] = useState<Product | null>(null)
  const [qty, setQty] = useState(1)
  const [binLoc, setBinLoc] = useState<Location | null>(null)
  const [scanError, setScanError] = useState('')
  const [lastResult, setLastResult] = useState<{ sku: string; qty: number; bin: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: locsData } = useQuery({
    queryKey: ['mobile-locations'],
    queryFn: () => productApi.locations({ is_active: true, page_size: 200 }).then(r => r.data),
    staleTime: 300000,
  })
  const locs: Location[] = Array.isArray(locsData) ? locsData : locsData?.results || []
  const recvBay = locs.find(l => l.is_receiving_bay)

  const reset = () => { setStep('SCAN_PRODUCT'); setProduct(null); setQty(1); setBinLoc(null); setScanError('') }

  const handleScanProduct = async (val: string) => {
    setScanError('')
    try {
      const res = await productApi.searchByBarcode(val)
      const results = Array.isArray(res.data) ? res.data : res.data?.results || []
      if (results.length > 0) {
        setProduct(results[0]); setStep('ENTER_QTY'); success()
      } else {
        // Try SKU search
        const sr = await productApi.list({ search: val, page_size: 5 })
        const items = Array.isArray(sr.data) ? sr.data : sr.data?.results || []
        const exact = items.find((p: Product) => p.sku === val.toUpperCase())
        if (exact) { setProduct(exact); setStep('ENTER_QTY'); success() }
        else { setScanError(`No product: "${val}"`); error() }
      }
    } catch { setScanError('Scan failed — retry'); error() }
  }

  const handleScanBin = (val: string) => {
    setScanError('')
    const code = val.trim().toUpperCase()
    const found = locs.find(l => l.code === code)
    if (!found) { setScanError(`Unknown location: "${code}"`); error(); return }
    if (found.is_receiving_bay) { setScanError('Cannot put-away TO the receiving bay'); error(); return }
    setBinLoc(found); setStep('CONFIRM'); success()
  }

  const handleConfirm = async () => {
    if (!product || !binLoc || !recvBay) return
    setSaving(true)
    setScanError('')
    try {
      const result = await executeOrQueue('transfer', {
        product: product.id, from_location: recvBay.id, to_location: binLoc.id, quantity: qty,
        notes: `Put-away: ${product.sku} ${recvBay.code}→${binLoc.code}`,
      })
      setLastResult({ sku: product.sku, qty, bin: binLoc.code })
      success()
      if (result === 'queued') setScanError('Queued — will sync when online')
      reset()
    } catch { setScanError('Failed — try again'); error() }
    finally { setSaving(false) }
  }

  const stepLabel = step === 'SCAN_PRODUCT' ? 'Step 1 of 4 — Scan Product'
    : step === 'ENTER_QTY' ? 'Step 2 of 4 — Enter Quantity'
    : step === 'SCAN_BIN' ? 'Step 3 of 4 — Scan Bin'
    : 'Step 4 of 4 — Confirm'

  return (
    <MobileLayout
      title="Put-Away"
      subtitle={stepLabel}
      onBack="/mobile/wms"
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className="p-4 space-y-4">

        {!recvBay && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">No receiving bay configured. Mark a location as receiving bay in Locations settings.</p>
          </div>
        )}

        {lastResult && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              Put away <strong>{lastResult.qty}× {lastResult.sku}</strong> → <strong>{lastResult.bin}</strong>
            </p>
            <button className="ml-auto text-xs text-green-600" onClick={() => setLastResult(null)}>×</button>
          </div>
        )}

        {scanError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{scanError}</p>
          </div>
        )}

        {/* Step 1: Scan product */}
        {step === 'SCAN_PRODUCT' && (
          <ScanInput key="scan-product" onScan={handleScanProduct} label="Scan product barcode or SKU" />
        )}

        {/* Step 2: Enter quantity */}
        {step === 'ENTER_QTY' && product && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wide mb-2">Product</p>
              <p className="font-mono font-bold text-blue-700 text-xl">{product.sku}</p>
              <p className="text-gray-700">{product.title}</p>
              {recvBay && <p className="text-xs text-gray-400 mt-1">From: <span className="font-mono">{recvBay.code}</span> ({recvBay.name})</p>}
            </div>
            <div className="bg-white rounded-2xl p-4">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wide mb-3">Quantity</p>
              <div className="flex items-center gap-4">
                <button className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center active:bg-gray-200" onClick={() => setQty(q => Math.max(1, q - 1))}>
                  <Minus className="w-7 h-7" />
                </button>
                <input
                  className="flex-1 text-center text-4xl font-bold border-2 border-gray-200 rounded-2xl py-3 focus:border-blue-500 focus:outline-none"
                  type="number" min="1" value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  inputMode="numeric"
                />
                <button className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center active:bg-blue-700" onClick={() => setQty(q => q + 1)}>
                  <Plus className="w-7 h-7 text-white" />
                </button>
              </div>
            </div>
            <button className="w-full py-5 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700" onClick={() => setStep('SCAN_BIN')}>
              Scan Destination Bin →
            </button>
            <button className="w-full py-3 bg-gray-100 text-gray-500 rounded-2xl active:bg-gray-200" onClick={reset}>Start Over</button>
          </div>
        )}

        {/* Step 3: Scan bin */}
        {step === 'SCAN_BIN' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <div>
                <p className="font-mono font-bold text-blue-700">{product?.sku}</p>
                <p className="text-sm text-gray-500">{qty} unit{qty !== 1 ? 's' : ''} · from {recvBay?.code}</p>
              </div>
            </div>
            <ScanInput key="scan-bin" onScan={handleScanBin} label="Scan destination bin barcode" />
            <button className="w-full py-3 bg-gray-100 text-gray-500 rounded-2xl active:bg-gray-200" onClick={() => setStep('ENTER_QTY')}>← Back</button>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'CONFIRM' && product && binLoc && recvBay && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 space-y-4">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wide">Confirm Put-Away</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">From</p>
                  <p className="font-mono font-bold text-gray-800 text-lg">{recvBay.code}</p>
                  <p className="text-xs text-gray-500">{recvBay.name}</p>
                </div>
                <ArrowRight className="w-6 h-6 text-gray-400" />
                <div className="flex-1 text-center">
                  <p className="text-xs text-gray-400">To</p>
                  <p className="font-mono font-bold text-blue-700 text-lg">{binLoc.code}</p>
                  <p className="text-xs text-gray-500">{binLoc.name}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="font-mono font-bold text-gray-800 text-xl">{product.sku}</p>
                <p className="text-gray-600">{product.title}</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{qty} unit{qty !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              className="w-full py-6 bg-green-600 text-white rounded-2xl text-2xl font-bold active:bg-green-700 disabled:opacity-50"
              onClick={handleConfirm}
              disabled={saving || !recvBay}
            >
              {saving ? 'Saving…' : '✓ Confirm Put-Away'}
            </button>
            <button className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl active:bg-gray-200" onClick={() => setStep('SCAN_BIN')}>← Change Bin</button>
          </div>
        )}
      </div>
    </MobileLayout>
  )
}
