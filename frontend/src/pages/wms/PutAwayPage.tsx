import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { purchasing, products as productApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import StatusBadge from '../../components/ui/StatusBadge'
import Loading from '../../components/ui/Loading'
import { ScanLine, CheckCircle2, ArrowRight, Package } from 'lucide-react'

interface QcItem {
  id: number
  product_sku: string
  product_title: string
  product_barcode: string
  qty_received: number
  qc_status: string
  qc_checked_at: string
}

interface Location { id: number; code: string; name: string }

export default function PutAwayPage() {
  const toast = useToast()
  useQueryClient()
  const locInputRef = useRef<HTMLInputElement>(null)

  const [selectedItem, setSelectedItem] = useState<QcItem | null>(null)
  const [targetLocCode, setTargetLocCode] = useState('')
  const [qty, setQty] = useState('1')
  const [confirmed, setConfirmed] = useState<string[]>([])

  const { data: passedData, isLoading } = useQuery({
    queryKey: ['qc-passed-items'],
    queryFn: () => purchasing.qcItems({ qc_status: 'passed', page_size: 100 }).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: locsData } = useQuery({
    queryKey: ['locations', 'active'],
    queryFn: () => productApi.locations({ is_active: true, page_size: 200 }).then(r => r.data),
  })

  const passedItems: QcItem[] = (Array.isArray(passedData) ? passedData : passedData?.results || [])
    .filter((i: QcItem) => !confirmed.includes(String(i.id)))

  const locs: Location[] = Array.isArray(locsData) ? locsData : locsData?.results || []

  const putAway = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !targetLocCode) throw new Error('Missing item or location')
      const loc = locs.find(l => l.code.toLowerCase() === targetLocCode.toLowerCase())
      if (!loc) throw new Error(`Location not found: ${targetLocCode}`)

      await productApi.adjust({
        product_sku: selectedItem.product_sku,
        location: loc.id,
        quantity: Number(qty),
        notes: `Put-away from goods receipt QC — ${selectedItem.product_sku}`,
        movement_type: 'adjustment',
      })
    },
    onSuccess: () => {
      toast(`Put away ${qty}× ${selectedItem?.product_sku} → ${targetLocCode.toUpperCase()}`, 'success')
      setConfirmed(p => [...p, String(selectedItem!.id)])
      setSelectedItem(null)
      setTargetLocCode('')
      setQty('1')
    },
    onError: (err: Error) => toast(err.message || 'Put-away failed', 'error'),
  })

  const handleLocScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = targetLocCode.trim().toUpperCase()
      const found = locs.find(l => l.code === code)
      if (!found) {
        toast(`Unknown location: ${code}`, 'error')
      }
    }
  }

  const foundLoc = locs.find(l => l.code.toLowerCase() === targetLocCode.toLowerCase())

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Put-Away</h1>
          <p className="page-subtitle">Place QC-passed goods into warehouse bin locations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: QC passed items needing put-away */}
        <div className="card">
          <div className="card-header">
            <span className="font-semibold">QC Passed — Awaiting Put-Away</span>
            <span className="text-sm text-gray-400">{passedItems.length} item{passedItems.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading && <div className="p-8"><Loading /></div>}

          {!isLoading && passedItems.length === 0 && (
            <div className="p-8 text-center">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No items awaiting put-away</p>
            </div>
          )}

          {!isLoading && passedItems.length > 0 && (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {passedItems.map(item => (
                <button
                  key={item.id}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedItem?.id === item.id ? 'bg-brand-50 border-l-4 border-brand-600' : ''}`}
                  onClick={() => { setSelectedItem(item); setQty(String(item.qty_received)); setTimeout(() => locInputRef.current?.focus(), 100) }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-semibold">{item.product_sku}</span>
                      <span className="text-sm text-gray-500 ml-2">{item.product_title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{item.qty_received} units</span>
                      <StatusBadge status={item.qc_status} />
                    </div>
                  </div>
                  {item.product_barcode && (
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{item.product_barcode}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Put-away form */}
        <div className="card card-body space-y-4">
          <h3 className="font-semibold">Put-Away Details</h3>

          {!selectedItem && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Select an item from the left to begin put-away
            </div>
          )}

          {selectedItem && (
            <>
              <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <div className="font-mono font-semibold text-brand-700">{selectedItem.product_sku}</div>
                  <div className="text-sm text-gray-600">{selectedItem.product_title}</div>
                </div>
              </div>

              <div>
                <label className="label">Quantity to Put Away</label>
                <input
                  className="input text-center text-xl font-bold h-12"
                  type="number"
                  min="1"
                  max={selectedItem.qty_received}
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Max: {selectedItem.qty_received} received</p>
              </div>

              <div>
                <label className="label">Target Location (scan or type code) *</label>
                <div className="relative">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    ref={locInputRef}
                    className="input pl-10 font-mono uppercase text-lg h-12"
                    placeholder="Scan location barcode or type code..."
                    value={targetLocCode}
                    onChange={e => setTargetLocCode(e.target.value)}
                    onKeyDown={handleLocScan}
                    list="loc-list"
                  />
                  <datalist id="loc-list">
                    {locs.map(l => <option key={l.id} value={l.code}>{l.name}</option>)}
                  </datalist>
                </div>
                {targetLocCode && foundLoc && (
                  <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {foundLoc.name}
                  </p>
                )}
                {targetLocCode && !foundLoc && (
                  <p className="text-sm text-red-600 mt-1">Unknown location code</p>
                )}
              </div>

              {/* Drop-down fallback */}
              <div>
                <label className="label text-xs text-gray-400">Or select from list</label>
                <select
                  className="select text-sm"
                  value={foundLoc ? String(foundLoc.id) : ''}
                  onChange={e => {
                    const loc = locs.find(l => String(l.id) === e.target.value)
                    if (loc) setTargetLocCode(loc.code)
                  }}
                >
                  <option value="">— Select location —</option>
                  {locs.map(l => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
                </select>
              </div>

              <button
                className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2"
                onClick={() => putAway.mutate()}
                disabled={!foundLoc || !qty || putAway.isPending}
              >
                <ArrowRight className="w-5 h-5" />
                {putAway.isPending ? 'Saving...' : `Put Away ${qty} × ${selectedItem.product_sku} → ${targetLocCode.toUpperCase() || '?'}`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recent put-aways */}
      {confirmed.length > 0 && (
        <div className="card card-body">
          <h3 className="font-semibold mb-3 text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Completed This Session ({confirmed.length})
          </h3>
          <p className="text-sm text-gray-500">
            {confirmed.length} item{confirmed.length !== 1 ? 's' : ''} put away. Refresh to see updated stock levels.
          </p>
        </div>
      )}
    </div>
  )
}
