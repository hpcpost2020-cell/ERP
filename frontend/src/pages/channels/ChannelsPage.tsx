import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channels as channelsApi } from '../../api/endpoints'
import {
  Plus, RefreshCw, CheckCircle2, AlertTriangle, Wifi, WifiOff,
  Settings2, Zap, Globe, ShoppingBag, Package
} from 'lucide-react'

interface CredentialsSummary {
  store_url?: string
  consumer_key_hint?: string
  has_secret?: boolean
  is_configured?: boolean
}

interface Channel {
  id: number
  name: string
  channel_type: string
  status: string
  last_synced: string | null
  last_sync_status: string
  last_sync_message: string
  credentials_summary: CredentialsSummary
}

const TYPE_LABELS: Record<string, string> = {
  woocommerce: 'WooCommerce',
  ebay: 'eBay',
  amazon: 'Amazon',
  direct: 'Direct',
  wholesale: 'Wholesale',
  other: 'Other',
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  woocommerce: Globe,
  ebay: ShoppingBag,
  amazon: Package,
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    paused: 'bg-amber-100 text-amber-700',
    inactive: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function AddChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState('woocommerce')
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const needsWcCreds = channelType === 'woocommerce'
  const credentialsOnDetailPage = channelType === 'amazon' || channelType === 'ebay'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setErr('Channel name is required'); return }
    if (needsWcCreds) {
      if (!storeUrl.trim()) { setErr('Store URL is required'); return }
      if (!consumerKey.trim()) { setErr('Consumer Key is required'); return }
      if (!consumerSecret.trim()) { setErr('Consumer Secret is required'); return }
    }
    setSaving(true)
    setErr('')
    try {
      const creds: Record<string, string> = {}
      if (needsWcCreds) {
        creds.store_url = storeUrl.trim()
        creds.consumer_key = consumerKey.trim()
        creds.consumer_secret = consumerSecret.trim()
      }
      const res = await channelsApi.create({ name: name.trim(), channel_type: channelType, api_credentials: creds })
      onCreated(res.data.id)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to create channel'
      setErr(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
        <h2 className="text-lg font-bold text-gray-900">Add Channel</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Amazon UK Store"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel Type *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={channelType} onChange={e => setChannelType(e.target.value)}
            >
              <option value="woocommerce">WooCommerce</option>
              <option value="ebay">eBay</option>
              <option value="amazon">Amazon SP-API</option>
              <option value="direct">Direct / Manual</option>
            </select>
          </div>

          {needsWcCreds && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store URL *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={storeUrl} onChange={e => setStoreUrl(e.target.value)}
                  placeholder="https://mystore.com"
                />
                <p className="text-xs text-gray-400 mt-1">Must be HTTPS. No trailing slash needed.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consumer Key *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={consumerKey} onChange={e => setConsumerKey(e.target.value)}
                  placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consumer Secret *</label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)}
                  placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Generate keys at WooCommerce → Settings → Advanced → REST API.
                  Set permissions to <strong>Read/Write</strong>.
                </p>
              </div>
            </>
          )}

          {credentialsOnDetailPage && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              After creating the channel you'll be taken to its settings page to enter credentials.
            </p>
          )}

          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : credentialsOnDetailPage ? 'Create & Configure →' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ChannelsPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; message: string }>>({})
  const [syncingId, setSyncingId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsApi.list().then(r => r.data),
  })
  const channelList: Channel[] = Array.isArray(data) ? data : data?.results || []

  const testMut = useMutation({
    mutationFn: (id: number) => channelsApi.testConnection(id).then(r => r.data),
    onMutate: (id) => setTestingId(id),
    onSuccess: (data, id) => {
      setTestResult(prev => ({ ...prev, [id]: { ok: data.ok, message: data.message } }))
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (err: unknown, id) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Connection failed'
      setTestResult(prev => ({ ...prev, [id]: { ok: false, message: msg } }))
    },
    onSettled: () => setTestingId(null),
  })

  const syncMut = useMutation({
    mutationFn: (id: number) => channelsApi.sync(id).then(r => r.data),
    onMutate: (id) => setSyncingId(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
    onSettled: () => setSyncingId(null),
  })

  const lastSyncedText = (ch: Channel) => {
    if (!ch.last_synced) return 'Never'
    const d = new Date(ch.last_synced)
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Channels</h1>
          <p className="text-sm text-gray-500 mt-1">Manage marketplace integrations and sync settings</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Channel
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-gray-400">Loading channels…</div>
      )}

      {!isLoading && channelList.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <Zap className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-gray-500 font-semibold text-lg">No channels configured</p>
          <p className="text-gray-400 text-sm">Add a WooCommerce, Amazon, or eBay channel to start syncing orders and stock.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add your first channel
          </button>
        </div>
      )}

      <div className="space-y-4">
        {channelList.map(ch => {
          const Icon = TYPE_ICONS[ch.channel_type] || Globe
          const result = testResult[ch.id]
          const configured = ch.credentials_summary?.is_configured

          return (
            <div key={ch.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              {/* Channel header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Icon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{ch.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {TYPE_LABELS[ch.channel_type] || ch.channel_type}
                      </span>
                      <StatusBadge status={ch.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      {configured
                        ? <span className="flex items-center gap-1 text-green-600"><Wifi className="w-3 h-3" /> Credentials configured</span>
                        : <span className="flex items-center gap-1 text-amber-600"><WifiOff className="w-3 h-3" /> Credentials not set</span>
                      }
                      <span>·</span>
                      <span>Last sync: {lastSyncedText(ch)}</span>
                      {ch.last_sync_status === 'failed' && (
                        <span className="text-red-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Sync error
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => nav(`/channels/${ch.id}`)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                  <Settings2 className="w-4 h-4" /> Configure
                </button>
              </div>

              {/* Store URL */}
              {ch.credentials_summary?.store_url && (
                <p className="text-xs font-mono text-gray-400 -mt-1">{ch.credentials_summary.store_url}</p>
              )}

              {/* Test result */}
              {result && (
                <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                  {result.ok
                    ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  }
                  <span>{result.message}</span>
                </div>
              )}

              {/* Last sync message */}
              {ch.last_sync_message && !result && (
                <p className="text-xs text-gray-500 truncate">{ch.last_sync_message}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => testMut.mutate(ch.id)}
                  disabled={testingId === ch.id || !configured}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  {testingId === ch.id
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testing…</>
                    : <><Wifi className="w-3.5 h-3.5" /> Test Connection</>}
                </button>
                <button
                  onClick={() => syncMut.mutate(ch.id)}
                  disabled={syncingId === ch.id || !configured}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  {syncingId === ch.id
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing…</>
                    : <><RefreshCw className="w-3.5 h-3.5" /> Sync Now</>}
                </button>
                <button
                  onClick={() => nav(`/channels/${ch.id}`)}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800"
                >
                  View logs →
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <AddChannelModal
          onClose={() => setShowAdd(false)}
          onCreated={(id) => {
            setShowAdd(false)
            qc.invalidateQueries({ queryKey: ['channels'] })
            nav(`/channels/${id}`)
          }}
        />
      )}
    </div>
  )
}
