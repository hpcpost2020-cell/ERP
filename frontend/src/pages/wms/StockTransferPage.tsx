import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { products as productApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { fmt } from '../../utils/format'
import { ArrowRight, Search, ScanLine, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Location { id: number; code: string; name: string; is_active: boolean }
interface Product { id: number; sku: string; title: string; barcode?: string }
interface StockLevel {
  id: number; product: number; location: number; location_code: string
  qty_on_hand: number; qty_available: number
}

export default function StockTransferPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const barcodeRef = useRef<HTMLInputElement>(null)

  const [fromLoc, setFromLoc] = useState('')
  const [toLoc, setToLoc] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [lastTransfer, setLastTransfer] = useState<{ from: string; to: string; sku: string; qty: number } | null>(null)

  const { data: locsData } = useQuery({
    queryKey: ['locations', 'active'],
    queryFn: () => productApi.locations({ is_active: true, page_size: 200 }).then(r => r.data),
  })

  const { data: stockAtFrom } = useQuery({
    queryKey: ['stock-at-from', fromLoc, selectedProduct?.id],
    queryFn: () => productApi.stockLevels({ location: fromLoc, product: selectedProduct?.id, page_size: 1 }).then(r => r.data),
    enabled: !!fromLoc && !!selectedProduct,
  })

  const { data: searchResults } = useQuery({
    queryKey: ['product-search', searchTerm],
    queryFn: () => productApi.list({ search: searchTerm, page_size: 10 }).then(r => r.data),
    enabled: searchTerm.length >= 2,
  })

  const locs: Location[] = Array.isArray(locsData) ? locsData : locsData?.results || []
  const fromStockLevels: StockLevel[] = Array.isArray(stockAtFrom) ? stockAtFrom : stockAtFrom?.results || []
  const fromStockLevel = fromStockLevels[0]
  const availableQty = fromStockLevel?.qty_available ?? null

  const transfer = useMutation({
    mutationFn: async () => {
      const transferNote = `Transfer from ${locs.find(l => String(l.id) === fromLoc)?.code} to ${locs.find(l => String(l.id) === toLoc)?.code}${notes ? ` — ${notes}` : ''}`
      const qty_n = Number(qty)
      await productApi.adjust({ product: selectedProduct!.id, location: Number(fromLoc), quantity: -qty_n, notes: transferNote })
      await productApi.adjust({ product: selectedProduct!.id, location: Number(toLoc), quantity: qty_n, notes: transferNote })
    },
    onSuccess: () => {
      const fromCode = locs.find(l => String(l.id) === fromLoc)?.code || ''
      const toCode = locs.find(l => String(l.id) === toLoc)?.code || ''
      setLastTransfer({ from: fromCode, to: toCode, sku: selectedProduct!.sku, qty: Number(qty) })
      qc.invalidateQueries({ queryKey: ['stock-levels'] })
      qc.invalidateQueries({ queryKey: ['stock-at-from'] })
      toast(`Transferred ${qty} × ${selectedProduct!.sku} → ${toCode}`, 'success')
      setSelectedProduct(null)
      setBarcodeInput('')
      setQty('1')
      setNotes('')
      setTimeout(() => barcodeRef.current?.focus(), 100)
    },
    onError: () => toast('Transfer failed — check stock levels', 'error'),
  })

  const handleBarcodeScan = async (value: string) => {
    if (!value.trim()) return
    try {
      const res = await productApi.searchByBarcode(value.trim())
      const results = Array.isArray(res.data) ? res.data : res.data?.results || []
      if (results.length > 0) {
        setSelectedProduct(results[0])
        setBarcodeInput('')
      } else {
        toast(`No product found for barcode: ${value}`, 'error')
        setBarcodeInput('')
      }
    } catch {
      toast('Barcode lookup failed', 'error')
    }
  }

  const canTransfer = fromLoc && toLoc && fromLoc !== toLoc && selectedProduct && Number(qty) > 0
    && (availableQty === null || Number(qty) <= availableQty)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Transfer</h1>
          <p className="page-subtitle">Move stock between warehouse locations</p>
        </div>
      </div>

      {lastTransfer && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <span>
            Transferred <strong>{lastTransfer.qty}×</strong> <strong>{lastTransfer.sku}</strong>{' '}
            from <strong>{lastTransfer.from}</strong> → <strong>{lastTransfer.to}</strong>
          </span>
          <button className="ml-auto text-green-600 hover:text-green-800 font-medium text-xs" onClick={() => setLastTransfer(null)}>Dismiss</button>
        </div>
      )}

      <div className="card card-body space-y-5">
        {/* From / To locations */}
        <div className="grid grid-cols-2 gap-4 items-end">
          <div>
            <label className="label">From Location *</label>
            <select className="select" value={fromLoc} onChange={e => setFromLoc(e.target.value)}>
              <option value="">— Select source —</option>
              {locs.map(l => <option key={l.id} value={l.id} disabled={String(l.id) === toLoc}>{l.code} – {l.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <ArrowRight className="w-6 h-6 text-gray-400 mb-2 shrink-0" />
            <div className="flex-1">
              <label className="label">To Location *</label>
              <select className="select" value={toLoc} onChange={e => setToLoc(e.target.value)}>
                <option value="">— Select destination —</option>
                {locs.map(l => <option key={l.id} value={l.id} disabled={String(l.id) === fromLoc}>{l.code} – {l.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {fromLoc && toLoc && fromLoc === toLoc && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Source and destination cannot be the same
          </div>
        )}

        {/* Product selection */}
        <div className="space-y-2">
          <label className="label">Product *</label>

          {/* Barcode input — big, barcode-scanner ready */}
          <div className="relative">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={barcodeRef}
              className="input pl-10 font-mono text-lg h-12"
              placeholder="Scan barcode or type SKU/barcode and press Enter"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeScan(barcodeInput) } }}
              autoFocus
            />
          </div>

          {/* Manual search fallback */}
          <div className="relative">
            <button
              type="button"
              className="text-xs text-brand-600 hover:underline flex items-center gap-1"
              onClick={() => setShowSearch(!showSearch)}
            >
              <Search className="w-3 h-3" /> Search by name instead
            </button>
            {showSearch && (
              <div className="mt-2 space-y-2">
                <input
                  className="input text-sm"
                  placeholder="Type product name or SKU..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm.length >= 2 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    {(searchResults?.results || []).map((p: Product) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                        onClick={() => { setSelectedProduct(p); setShowSearch(false); setSearchTerm('') }}
                      >
                        <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded mr-2">{p.sku}</span>
                        {p.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected product */}
          {selectedProduct && (
            <div className="flex items-center justify-between px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg">
              <div>
                <span className="font-mono text-sm font-semibold text-brand-700">{selectedProduct.sku}</span>
                <span className="text-sm text-gray-600 ml-2">{selectedProduct.title}</span>
              </div>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600"
                onClick={() => { setSelectedProduct(null); setBarcodeInput(''); setTimeout(() => barcodeRef.current?.focus(), 50) }}
              >
                Clear
              </button>
            </div>
          )}

          {/* Stock at source */}
          {selectedProduct && fromLoc && (
            <div className={`text-sm px-3 py-2 rounded-lg ${availableQty !== null && availableQty <= 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
              {availableQty === null
                ? 'Loading stock...'
                : availableQty <= 0
                ? `⚠ No stock available at ${locs.find(l => String(l.id) === fromLoc)?.code || 'source'}`
                : `Available at ${locs.find(l => String(l.id) === fromLoc)?.code || 'source'}: ${availableQty} units`
              }
            </div>
          )}
        </div>

        {/* Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Quantity *</label>
            <input
              className="input text-center text-2xl font-bold h-14"
              type="number"
              min="1"
              max={availableQty ?? undefined}
              value={qty}
              onChange={e => setQty(e.target.value)}
            />
            {availableQty !== null && Number(qty) > availableQty && (
              <p className="text-xs text-red-600 mt-1">Exceeds available qty ({availableQty})</p>
            )}
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input h-14" placeholder="Reason / reference..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <button
          className="btn-primary w-full py-3 text-base"
          onClick={() => transfer.mutate()}
          disabled={!canTransfer || transfer.isPending}
        >
          {transfer.isPending ? 'Transferring...' : `Transfer ${qty || '?'} unit${Number(qty) !== 1 ? 's' : ''} →`}
        </button>
      </div>

      {/* Recent transfers */}
      <RecentTransfers />
    </div>
  )
}

function RecentTransfers() {
  const { data } = useQuery({
    queryKey: ['recent-transfers'],
    queryFn: () => productApi.stockMovements({ movement_type: 'adjustment', page_size: 10, ordering: '-created_at' }).then(r => r.data),
    refetchInterval: 10000,
  })

  const movements = Array.isArray(data) ? data : data?.results || []

  if (movements.length === 0) return null

  return (
    <div className="card">
      <div className="card-header"><span className="font-semibold text-sm">Recent Adjustments</span></div>
      <div className="table-container">
        <table>
          <thead><tr><th>Time</th><th>SKU</th><th>Location</th><th>Qty</th><th>Notes</th><th>By</th></tr></thead>
          <tbody>
            {movements.map((m: { id: number; created_at: string; product_sku: string; location_code: string; quantity: number; notes: string; created_by_name: string }) => (
              <tr key={m.id}>
                <td className="text-xs text-gray-500">{fmt.datetime(m.created_at)}</td>
                <td><span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{m.product_sku}</span></td>
                <td className="font-mono text-xs">{m.location_code}</td>
                <td className={`font-bold text-sm ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                <td className="text-xs text-gray-500 max-w-xs truncate">{m.notes || '—'}</td>
                <td className="text-xs text-gray-500">{m.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
