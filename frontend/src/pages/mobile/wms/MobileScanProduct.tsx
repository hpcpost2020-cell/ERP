import { useState } from 'react'
import MobileLayout from '../../../components/mobile/MobileLayout'
import ScanInput from '../../../components/mobile/ScanInput'
import { useOfflineQueue } from '../../../hooks/useOfflineQueue'
import { useScanFeedback } from '../../../hooks/useScanFeedback'
import { products as productApi } from '../../../api/endpoints'
import { useQuery } from '@tanstack/react-query'
import { Package, AlertTriangle, MapPin } from 'lucide-react'

interface Product {
  id: number; sku: string; title: string; barcode?: string
  sell_price: string; buy_price: string; status: string
}
interface StockLevel {
  id: number; location_code: string; location_name: string
  qty_on_hand: number; qty_available: number; qty_reserved: number
}

export default function MobileScanProduct() {
  const { isOnline, pendingCount } = useOfflineQueue()
  const { success, error } = useScanFeedback()
  const [product, setProduct] = useState<Product | null>(null)
  const [notFound, setNotFound] = useState('')
  const [scanKey, setScanKey] = useState(0)

  const { data: stockData } = useQuery({
    queryKey: ['mobile-product-stock', product?.id],
    queryFn: () => productApi.stock(product!.id).then(r => r.data),
    enabled: !!product,
  })

  const stockLevels: StockLevel[] = Array.isArray(stockData) ? stockData : stockData?.results || []
  const totalAvail = stockLevels.reduce((t, l) => t + l.qty_available, 0)

  const handleScan = async (val: string) => {
    setNotFound('')
    try {
      const res = await productApi.searchByBarcode(val)
      const results = Array.isArray(res.data) ? res.data : res.data?.results || []
      if (results.length > 0) {
        setProduct(results[0])
        success()
      } else {
        // Try SKU search
        const skuRes = await productApi.list({ search: val, page_size: 5 })
        const skuResults = Array.isArray(skuRes.data) ? skuRes.data : skuRes.data?.results || []
        const exact = skuResults.find((p: Product) => p.sku === val.toUpperCase())
        if (exact) {
          setProduct(exact)
          success()
        } else {
          setNotFound(val)
          setProduct(null)
          error()
          setScanKey(k => k + 1)
        }
      }
    } catch {
      setNotFound(val)
      error()
      setScanKey(k => k + 1)
    }
  }

  return (
    <MobileLayout
      title="Scan Product"
      subtitle="Lookup product info"
      onBack="/mobile/wms"
      isOnline={isOnline}
      pendingCount={pendingCount}
    >
      <div className="p-4 space-y-4">
        <ScanInput
          key={scanKey}
          onScan={handleScan}
          placeholder="Scan barcode or type SKU…"
          label="Barcode / SKU"
        />

        {notFound && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">Not found</p>
              <p className="text-sm text-red-600 font-mono">{notFound}</p>
            </div>
          </div>
        )}

        {product && (
          <div className="space-y-3">
            {/* Product info card */}
            <div className="bg-white rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-blue-700 text-lg">{product.sku}</p>
                  <p className="text-gray-800 font-medium leading-tight">{product.title}</p>
                  {product.barcode && <p className="text-xs text-gray-400 font-mono mt-0.5">{product.barcode}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-xs text-gray-400">Buy</p>
                  <p className="font-bold text-gray-800">£{product.buy_price}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Sell</p>
                  <p className="font-bold text-gray-800">£{product.sell_price}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Total Avail</p>
                  <p className={`font-bold ${totalAvail > 0 ? 'text-green-600' : 'text-red-600'}`}>{totalAvail}</p>
                </div>
              </div>
            </div>

            {/* Stock by location */}
            {stockLevels.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="font-semibold text-gray-700 text-sm">Stock by Location</p>
                </div>
                {stockLevels.map(sl => (
                  <div key={sl.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-mono text-sm font-semibold flex-1">{sl.location_code}</span>
                    <span className="text-sm text-gray-500 mr-2">{sl.location_name}</span>
                    <span className={`font-bold text-lg ${sl.qty_available > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {sl.qty_available}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              className="w-full py-4 bg-gray-100 text-gray-600 font-semibold rounded-2xl active:bg-gray-200 text-base"
              onClick={() => { setProduct(null); setNotFound(''); setScanKey(k => k + 1) }}
            >
              Scan Another
            </button>
          </div>
        )}
      </div>
    </MobileLayout>
  )
}
