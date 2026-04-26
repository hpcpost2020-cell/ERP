import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channels as channelsApi } from '../../api/endpoints'
import {
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Wifi, WifiOff,
  Save, ExternalLink, Package, ChevronRight, Clock, Download, Upload,
  Truck
} from 'lucide-react'

interface CredentialsSummary {
  store_url?: string
  consumer_key_hint?: string
  has_secret?: boolean
  is_configured?: boolean
}

interface SyncLog {
  id: number
  sync_type: string
  status: string
  records_processed: number
  records_created: number
  records_updated: number
  records_failed: number
  message: string
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
}

interface MpOrder {
  id: number
  external_order_id: string
  external_order_number: string
  status: string
  error_message: string
  sales_order: number | null
  sales_order_number: string | null
  fetched_at: string
  imported_at: string | null
}

interface Channel {
  id: number
  name: string
  channel_type: string
  status: string
  last_synced: string | null
  last_sync_status: string
  last_sync_message: string
  auto_import_orders: boolean
  auto_update_stock: boolean
  notes: string
  credentials_summary: CredentialsSummary
  sync_logs: SyncLog[]
}

const SYNC_TYPE_LABELS: Record<string, string> = {
  full: 'Full Sync',
  import_orders: 'Import Orders',
  push_stock: 'Push Stock',
  push_tracking: 'Push Tracking',
  manual: 'Manual',
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    running: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function ImportStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    imported: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-gray-100 text-gray-500',
    duplicate: 'bg-blue-100 text-blue-600',
    ignored: 'bg-gray-100 text-gray-400',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const channelId = Number(id)

  // Credentials form state
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [credSaved, setCredSaved] = useState(false)
  const [credError, setCredError] = useState('')

  // Push tracking form
  const [trackingOrderId, setTrackingOrderId] = useState('')
  const [trackingResult, setTrackingResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Inline action results
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [syncResult, setSyncResult] = useState<SyncLog | null>(null)

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => channelsApi.get(channelId).then(r => r.data as Channel),
  })

  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: ['channel-sync-logs', channelId],
    queryFn: () => channelsApi.syncLogs(channelId).then(r => r.data as SyncLog[]),
    enabled: !!channel,
  })
  const logs: SyncLog[] = Array.isArray(logsData) ? logsData : []

  const { data: mpOrdersData, refetch: refetchMpOrders } = useQuery({
    queryKey: ['channel-mp-orders', channelId],
    queryFn: () => channelsApi.marketplaceOrders(channelId).then(r => r.data as MpOrder[]),
    enabled: !!channel,
  })
  const mpOrders: MpOrder[] = Array.isArray(mpOrdersData) ? mpOrdersData : []

  // Credentials save
  const credMut = useMutation({
    mutationFn: (data: Record<string, string>) => channelsApi.setCredentials(channelId, data).then(r => r.data),
    onSuccess: () => {
      setCredSaved(true)
      setCredError('')
      setConsumerKey('')
      setConsumerSecret('')
      qc.invalidateQueries({ queryKey: ['channel', channelId] })
      setTimeout(() => setCredSaved(false), 3000)
    },
    onError: () => setCredError('Failed to save credentials'),
  })

  const handleSaveCreds = () => {
    setCredError('')
    if (!storeUrl && !consumerKey && !consumerSecret) {
      setCredError('Enter at least one field to update')
      return
    }
    const payload: Record<string, string> = {}
    if (storeUrl.trim()) payload.store_url = storeUrl.trim()
    if (consumerKey.trim()) payload.consumer_key = consumerKey.trim()
    if (consumerSecret.trim()) payload.consumer_secret = consumerSecret.trim()
    credMut.mutate(payload)
  }

  // Test connection
  const testMut = useMutation({
    mutationFn: () => channelsApi.testConnection(channelId).then(r => r.data),
    onSuccess: (data) => {
      setTestResult({ ok: data.ok, message: data.message })
      qc.invalidateQueries({ queryKey: ['channel', channelId] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Connection test failed'
      setTestResult({ ok: false, message: msg })
    },
  })

  // Sync orders
  const syncOrdersMut = useMutation({
    mutationFn: () => channelsApi.syncOrders(channelId).then(r => r.data as SyncLog),
    onSuccess: (log) => {
      setSyncResult(log)
      qc.invalidateQueries({ queryKey: ['channel', channelId] })
      refetchLogs()
      refetchMpOrders()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Sync failed'
      setSyncResult({ id: 0, sync_type: 'import_orders', status: 'failed', records_processed: 0, records_created: 0, records_updated: 0, records_failed: 0, message: msg, started_at: new Date().toISOString(), completed_at: null, duration_seconds: null })
    },
  })

  // Push stock
  const pushStockMut = useMutation({
    mutationFn: () => channelsApi.pushStock(channelId).then(r => r.data as SyncLog),
    onSuccess: (log) => {
      setSyncResult(log)
      refetchLogs()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Stock push failed'
      setSyncResult({ id: 0, sync_type: 'push_stock', status: 'failed', records_processed: 0, records_created: 0, records_updated: 0, records_failed: 0, message: msg, started_at: new Date().toISOString(), completed_at: null, duration_seconds: null })
    },
  })

  // Push tracking
  const pushTrackingMut = useMutation({
    mutationFn: (orderId: number) => channelsApi.pushTracking(channelId, orderId).then(r => r.data),
    onSuccess: (data) => {
      setTrackingResult({ ok: true, message: data.message })
      setTrackingOrderId('')
      refetchLogs()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Push failed'
      setTrackingResult({ ok: false, message: msg })
    },
  })

  const isBusy = syncOrdersMut.isPending || pushStockMut.isPending

  if (isLoading) {
    return <div className="p-6 text-gray-400">Loading…</div>
  }
  if (!channel) {
    return <div className="p-6 text-red-600">Channel not found</div>
  }

  const cs = channel.credentials_summary || {}
  const isWC = channel.channel_type === 'woocommerce'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/channels')} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{channel.name}</h1>
          <p className="text-sm text-gray-400 capitalize">{channel.channel_type}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${channel.status === 'active' ? 'bg-green-100 text-green-700' : channel.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
            {channel.status}
          </span>
        </div>
      </div>

      {/* ── Section 1: Credentials ─────────────────────────────────────────── */}
      {isWC && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">WooCommerce Credentials</h2>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Store URL</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={storeUrl}
                onChange={e => setStoreUrl(e.target.value)}
                placeholder={cs.store_url || 'https://mystore.com'}
              />
              {cs.store_url && !storeUrl && (
                <p className="text-xs text-gray-400 mt-1">Currently: <span className="font-mono">{cs.store_url}</span></p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Consumer Key</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                value={consumerKey}
                onChange={e => setConsumerKey(e.target.value)}
                placeholder={cs.consumer_key_hint ? `Currently: ${cs.consumer_key_hint} — enter to replace` : 'ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Consumer Secret</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                value={consumerSecret}
                onChange={e => setConsumerSecret(e.target.value)}
                placeholder={cs.has_secret ? '•••••••• (configured — enter to replace)' : 'cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Leave fields blank to keep existing values. Only filled fields will be updated.
            Generate keys at WooCommerce → Settings → Advanced → REST API (Read/Write permission required).
          </p>

          {credError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{credError}</p>}
          {credSaved && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Credentials saved.</p>}

          <div className="flex gap-3">
            <button
              onClick={handleSaveCreds}
              disabled={credMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
            >
              {credMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {credMut.isPending ? 'Saving…' : 'Save Credentials'}
            </button>
          </div>
        </div>
      )}

      {/* ── Section 2: Connection Test ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Connection</h2>
            <p className="text-sm text-gray-400 mt-0.5">Last synced: {timeAgo(channel.last_synced)}</p>
          </div>
          {cs.is_configured
            ? <span className="flex items-center gap-1.5 text-sm text-green-600"><Wifi className="w-4 h-4" /> Credentials set</span>
            : <span className="flex items-center gap-1.5 text-sm text-amber-600"><WifiOff className="w-4 h-4" /> Not configured</span>
          }
        </div>

        {testResult && (
          <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 ${testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{testResult.message}</span>
          </div>
        )}

        <button
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending || !cs.is_configured}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {testMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          {testMut.isPending ? 'Testing…' : 'Test Connection'}
        </button>
      </div>

      {/* ── Section 3: Sync Controls ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Sync Controls</h2>

        {syncResult && (
          <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 ${syncResult.status === 'completed' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {syncResult.status === 'completed'
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{syncResult.message}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setSyncResult(null); syncOrdersMut.mutate() }}
            disabled={isBusy || !cs.is_configured}
            className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {syncOrdersMut.isPending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Importing…</>
              : <><Download className="w-4 h-4" /> Import Orders</>}
          </button>
          <button
            onClick={() => { setSyncResult(null); pushStockMut.mutate() }}
            disabled={isBusy || !cs.is_configured}
            className="flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
          >
            {pushStockMut.isPending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Pushing…</>
              : <><Upload className="w-4 h-4" /> Push Stock</>}
          </button>
        </div>

        <p className="text-xs text-gray-400">
          <strong>Import Orders</strong> pulls WooCommerce orders with status processing/on-hold/pending.
          <strong className="ml-2">Push Stock</strong> updates qty_available for all linked products.
          SKUs are matched automatically; unmatched items are imported as-is.
        </p>

        {/* Push tracking */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Truck className="w-4 h-4" /> Push Tracking to WooCommerce
          </h3>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="ERP Sales Order ID (e.g. 42)"
              value={trackingOrderId}
              onChange={e => setTrackingOrderId(e.target.value)}
              type="number"
              min="1"
            />
            <button
              onClick={() => {
                setTrackingResult(null)
                pushTrackingMut.mutate(Number(trackingOrderId))
              }}
              disabled={!trackingOrderId || pushTrackingMut.isPending || !cs.is_configured}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {pushTrackingMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              Push
            </button>
          </div>
          {trackingResult && (
            <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${trackingResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
              {trackingResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{trackingResult.message}</span>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Enter the ERP Sales Order ID. The order must be dispatched with a tracking number, and must have
            been imported from this WooCommerce channel. This will add a customer-facing note and mark the WC order as completed.
          </p>
        </div>
      </div>

      {/* ── Section 4: Sync Logs ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" /> Sync Logs
          </h2>
          <span className="text-xs text-gray-400">{logs.length} entries</span>
        </div>
        {logs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No sync history yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Created</th>
                  <th className="px-4 py-2.5 text-right font-medium">Updated</th>
                  <th className="px-4 py-2.5 text-right font-medium">Failed</th>
                  <th className="px-4 py-2.5 text-left font-medium">Message</th>
                  <th className="px-4 py-2.5 text-left font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">
                      {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={log.status} /></td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{log.records_created || 0}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{log.records_updated || 0}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={log.records_failed > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                        {log.records_failed || 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate" title={log.message}>{log.message}</td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap text-xs">
                      {timeAgo(log.started_at)}
                      {log.duration_seconds != null && ` (${log.duration_seconds}s)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 5: Marketplace Orders ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" /> Imported Orders
          </h2>
          <span className="text-xs text-gray-400">{mpOrders.length} records</span>
        </div>
        {mpOrders.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No orders imported yet. Click <strong>Import Orders</strong> above to pull from WooCommerce.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left font-medium">WC Order #</th>
                  <th className="px-4 py-2.5 text-left font-medium">ERP Order</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Imported</th>
                  <th className="px-4 py-2.5 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mpOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-gray-800 font-bold">
                      #{order.external_order_number || order.external_order_id}
                    </td>
                    <td className="px-4 py-2.5">
                      {order.sales_order_number ? (
                        <Link
                          to={`/sales/${order.sales_order}`}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-mono text-xs font-semibold"
                        >
                          {order.sales_order_number}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><ImportStatusPill status={order.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(order.imported_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600 max-w-xs truncate" title={order.error_message}>
                      {order.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer: link back */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => nav('/channels')} className="flex items-center gap-1 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Back to Channels
        </button>
        {cs.store_url && (
          <>
            <ChevronRight className="w-3 h-3" />
            <a href={cs.store_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-gray-700">
              Open Store <ExternalLink className="w-3 h-3" />
            </a>
          </>
        )}
      </div>
    </div>
  )
}
