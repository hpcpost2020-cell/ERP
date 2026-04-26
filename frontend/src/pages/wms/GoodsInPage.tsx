import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { purchasing } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { ClipboardCheck, Package, AlertCircle } from 'lucide-react'

type Tab = 'pending' | 'receipts'

interface QcItem {
  id: number
  product_sku: string
  product_title: string
  product_barcode: string
  qty_received: number
  qty_damaged: number
  qc_status: string
  goods_receipt_id?: number
}

interface Receipt {
  id: number
  receipt_number: string
  purchase_order: number
  received_date: string
  delivery_note_ref: string
  notes: string
  received_by_name: string
  created_at: string
}

export default function GoodsInPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['qc-pending'],
    queryFn: () => purchasing.qcPending().then(r => r.data),
    enabled: tab === 'pending',
    refetchInterval: 15000,
  })

  const { data: receiptsData, isLoading: receiptsLoading } = useQuery({
    queryKey: ['receipts', page, search],
    queryFn: () => purchasing.receipts({ page, search: search || undefined, page_size: 20 }).then(r => r.data),
    enabled: tab === 'receipts',
  })

  const pendingItems: QcItem[] = Array.isArray(pendingData) ? pendingData : pendingData?.results || []
  const receipts: Receipt[] = Array.isArray(receiptsData) ? receiptsData : receiptsData?.results || []

  const tabs = [
    { key: 'pending' as Tab, label: 'Pending QC', icon: AlertCircle, count: pendingItems.length },
    { key: 'receipts' as Tab, label: 'All Receipts', icon: Package, count: null },
  ]

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Goods In / QC</h1>
          <p className="page-subtitle">Receive and inspect incoming goods</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1) }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className="ml-1 bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Pending QC tab */}
      {tab === 'pending' && (
        <>
          {pendingLoading && <Loading />}
          {!pendingLoading && pendingItems.length === 0 && (
            <div className="card p-12 text-center">
              <ClipboardCheck className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">All items inspected</p>
              <p className="text-sm text-gray-400 mt-1">No pending QC items — great work!</p>
            </div>
          )}
          {!pendingLoading && pendingItems.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="font-semibold">Items Awaiting QC Inspection</span>
                <span className="badge badge-yellow">{pendingItems.length} pending</span>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Barcode</th>
                      <th className="text-right">Qty Received</th>
                      <th className="text-right">Damaged</th>
                      <th>QC Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map(item => (
                      <tr key={item.id} className="bg-amber-50/30">
                        <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{item.product_sku}</span></td>
                        <td className="font-medium">{item.product_title}</td>
                        <td className="font-mono text-xs text-gray-500">{item.product_barcode || '—'}</td>
                        <td className="text-right font-semibold">{item.qty_received}</td>
                        <td className={`text-right ${item.qty_damaged > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{item.qty_damaged || 0}</td>
                        <td><StatusBadge status={item.qc_status} /></td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => nav(`/wms/goods-in/${item.id}`)}
                          >
                            Inspect →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Receipts tab */}
      {tab === 'receipts' && (
        <>
          {receiptsLoading && <Loading />}
          {!receiptsLoading && (
            <div className="card">
              <div className="card-header">
                <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search GR number, PO number..." />
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>GR Number</th>
                      <th>PO Number</th>
                      <th>Received Date</th>
                      <th>Delivery Note</th>
                      <th>Received By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-gray-400 py-8">No goods receipts found</td></tr>
                    )}
                    {receipts.map(r => (
                      <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => nav(`/wms/receipts/${r.id}`)}>
                        <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.receipt_number}</span></td>
                        <td><span className="font-mono text-xs text-gray-500">PO #{r.purchase_order}</span></td>
                        <td className="text-sm">{fmt.shortDate(r.received_date)}</td>
                        <td className="text-sm text-gray-500">{r.delivery_note_ref || '—'}</td>
                        <td className="text-sm text-gray-500">{r.received_by_name || '—'}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm">View →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={20} total={receiptsData?.count || 0} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
