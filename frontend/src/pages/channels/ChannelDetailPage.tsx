import { useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channels as channelsApi } from '../../api/endpoints'
import {
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Wifi, WifiOff,
  Save, ExternalLink, Package, ChevronRight, Clock, Download, Upload,
  Truck, Link2, Tag, BookOpen, FlaskConical
} from 'lucide-react'

type Tab = 'overview' | 'credentials' | 'skus' | 'unmatched' | 'logs' | 'tracking' | 'guide'

interface CredentialsSummary {
  // WooCommerce
  store_url?: string
  consumer_key_hint?: string
  has_secret?: boolean
  // eBay
  app_id_hint?: string
  has_token?: boolean
  has_refresh_token?: boolean
  token_valid?: boolean
  token_expires_at?: string
  refresh_token_expires_at?: string
  sandbox?: boolean
  marketplace_id?: string
  // Amazon
  seller_id_hint?: string
  lwa_client_id_hint?: string
  // shared
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

interface SkuMapping {
  id: number
  product: number
  product_sku: string
  product_title: string
  channel: string
  external_id: string
  parent_id: string
  external_sku: string
  channel_price: string | null
  is_active: boolean
  last_synced: string | null
  is_variation: boolean
}

interface UnmatchedOrder {
  id: number
  external_order_id: string
  external_order_number: string
  status: string
  error_message: string
  fetched_at: string
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

function LogRow({ log }: { log: SyncLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasError = log.status === 'failed' || log.records_failed > 0
  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${hasError ? 'bg-red-50/30' : ''}`}
        onClick={() => log.message && setExpanded(e => !e)}
      >
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
        <td className="px-4 py-2.5 text-xs text-gray-400">
          {log.duration_seconds != null ? `${log.duration_seconds}s` : '—'}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{timeAgo(log.started_at)}</td>
      </tr>
      {expanded && log.message && (
        <tr className={hasError ? 'bg-red-50' : 'bg-gray-50'}>
          <td colSpan={7} className="px-4 py-3">
            <pre className={`text-xs whitespace-pre-wrap font-mono ${hasError ? 'text-red-700' : 'text-gray-600'}`}>
              {log.message}
            </pre>
          </td>
        </tr>
      )}
    </>
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

// ── eBay Live Test Guide ──────────────────────────────────────────────────────

interface GuideStep {
  num: number
  title: string
  done: boolean
  action?: string
  tab?: Tab
  details: React.ReactNode
  warning?: React.ReactNode
}

function StepRow({ step, onGotoTab }: { step: GuideStep; onGotoTab: (t: Tab) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`border rounded-xl overflow-hidden ${step.done ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-white'}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
          {step.done ? <CheckCircle2 className="w-4 h-4" /> : step.num}
        </span>
        <span className={`flex-1 text-sm font-semibold ${step.done ? 'text-green-800' : 'text-gray-800'}`}>{step.title}</span>
        {step.tab && !step.done && (
          <button
            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-0.5 border border-blue-200 rounded-full"
            onClick={e => { e.stopPropagation(); onGotoTab(step.tab!) }}
          >
            {step.action || 'Go →'}
          </button>
        )}
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
          <div className="text-sm text-gray-600 space-y-1">{step.details}</div>
          {step.warning && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{step.warning}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EbayGuideTab({ cs, channel, onGotoTab }: {
  cs: CredentialsSummary
  channel: { status: string; last_synced: string | null }
  onGotoTab: (t: Tab) => void
}) {
  const hasAppId = !!cs.app_id_hint
  const hasToken = !!(cs.has_token && cs.token_valid)
  const isConnected = channel.status === 'active' && hasToken
  const hasSynced = !!channel.last_synced

  const steps: GuideStep[] = [
    {
      num: 1,
      title: 'Create an eBay Developer Account',
      done: hasAppId,
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">developer.ebay.com</a> and sign in with your eBay seller account</li>
          <li>Click <strong>My Account</strong> → <strong>Application Keys</strong></li>
          <li>Click <strong>Create a keyset</strong> and select <strong>Production</strong></li>
          <li>Note down your <strong>App ID (Client ID)</strong>, <strong>Cert ID (Client Secret)</strong>, and <strong>Dev ID</strong></li>
          <li>Under <strong>User Tokens</strong>, select <strong>OAuth User Token</strong></li>
          <li>Add scopes: <code className="text-xs bg-gray-100 px-1 rounded">sell.fulfillment</code>, <code className="text-xs bg-gray-100 px-1 rounded">sell.inventory</code></li>
          <li>Configure a <strong>RuName</strong> (any redirect URI name you define — it wraps your actual redirect URL)</li>
        </ol>
      ),
    },
    {
      num: 2,
      title: 'Paste App ID, Cert ID and RuName into ERP',
      done: hasAppId,
      tab: 'credentials',
      action: 'Credentials tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <strong>Credentials tab</strong> on this page</li>
          <li>Under <em>Step 1 — App Credentials</em>, enter your <strong>App ID</strong>, <strong>Cert ID</strong>, and <strong>RuName</strong></li>
          <li>Select the correct <strong>Marketplace</strong> (e.g. EBAY_GB for UK)</li>
          <li>Check <em>Sandbox</em> only if you are using the eBay sandbox environment for testing</li>
          <li>Click <strong>Save App Credentials</strong></li>
        </ol>
      ),
    },
    {
      num: 3,
      title: 'Generate Auth URL and grant access in your browser',
      done: hasToken,
      tab: 'credentials',
      action: 'Credentials tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>In the Credentials tab, click <strong>Generate Auth URL</strong></li>
          <li>Open the generated link in your browser (must be logged in as the eBay seller)</li>
          <li>Review the permissions and click <strong>Agree</strong></li>
          <li>eBay redirects to your RuName URL with <code className="text-xs bg-gray-100 px-1 rounded">?code=v^1.1...</code> in the URL</li>
          <li>Copy the value after <code className="text-xs bg-gray-100 px-1 rounded">code=</code> (it is long — copy the whole thing)</li>
        </ol>
      ),
      warning: 'The authorization code expires in 5 minutes. Complete the next step immediately after copying it.',
    },
    {
      num: 4,
      title: 'Exchange the authorization code for tokens',
      done: hasToken,
      tab: 'credentials',
      action: 'Credentials tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>In the Credentials tab, paste the code into the <em>Step 3 — Paste Authorization Code</em> box</li>
          <li>Click <strong>Exchange Code</strong></li>
          <li>A success message confirms tokens were saved. The access token is valid for 2 hours; it auto-refreshes using the refresh token (valid ~18 months)</li>
        </ol>
      ),
    },
    {
      num: 5,
      title: 'Test the connection',
      done: isConnected,
      tab: 'credentials',
      action: 'Credentials tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>In the Credentials tab, click <strong>Test Connection</strong></li>
          <li>A green message confirms eBay API access is working</li>
          <li>A red error usually means: wrong App ID / Cert ID, wrong RuName, token expired, or missing scopes</li>
        </ol>
      ),
    },
    {
      num: 6,
      title: 'Import orders safely',
      done: hasSynced,
      tab: 'overview',
      action: 'Overview tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to the <strong>Overview</strong> tab and click <strong>Import Orders</strong></li>
          <li>This pulls orders with status <em>NOT_STARTED</em> or <em>IN_PROGRESS</em> (i.e. paid, awaiting fulfilment)</li>
          <li>Check <strong>Sales → Orders</strong> to see the imported orders</li>
          <li><strong>No stock is pushed yet</strong> — mappings are created inactive and must be confirmed first</li>
        </ol>
      ),
      warning: 'Import is safe to run multiple times — duplicates are detected and skipped.',
    },
    {
      num: 7,
      title: 'Review unmatched orders',
      done: false,
      tab: 'unmatched',
      action: 'Unmatched Orders →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <strong>Unmatched Orders</strong> tab</li>
          <li>Any order with a line item that could not be matched to an ERP product appears here</li>
          <li>The error column shows why: missing SKU, no match in ERP catalogue, etc.</li>
          <li>Go to <strong>SKU Mapping</strong> to add the missing mapping, then re-import</li>
        </ol>
      ),
    },
    {
      num: 8,
      title: 'Activate SKU mappings one at a time',
      done: false,
      tab: 'skus',
      action: 'SKU Mapping →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <strong>SKU Mapping</strong> tab</li>
          <li>Auto-created mappings show as <em>Inactive</em> — stock will not be pushed until you activate them</li>
          <li>Verify each row: confirm the <strong>ERP Product</strong> column shows the correct product</li>
          <li>The <strong>Channel SKU</strong> must match the eBay <strong>Inventory API SKU</strong> (not the listing ID) for stock push to work</li>
          <li>Click <strong>Inactive</strong> to toggle to <strong>Active</strong> for each confirmed mapping</li>
        </ol>
      ),
      warning: 'Only activate mappings you have verified. Activating a wrong mapping will push incorrect stock to eBay.',
    },
    {
      num: 9,
      title: 'Dry-run stock push (preview — no changes to eBay)',
      done: false,
      tab: 'overview',
      action: 'Overview tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>In the <strong>Overview</strong> tab, click <strong>Dry Run (preview only)</strong></li>
          <li>This shows every active mapping and the quantity that <em>would</em> be sent to eBay</li>
          <li>No API calls are made to eBay — it is completely safe</li>
          <li>Review the preview table before committing to a live push</li>
        </ol>
      ),
      warning: 'The Dry Run does not check whether your eBay listings were created via the Inventory API. Run it first to confirm the quantities, then do a live push on one listing to check for legacy errors.',
    },
    {
      num: 10,
      title: 'Live stock push on one listing',
      done: false,
      tab: 'overview',
      action: 'Overview tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Activate exactly <strong>one</strong> SKU mapping for a known Inventory-API listing</li>
          <li>Click <strong>Push Stock</strong></li>
          <li>Check the <strong>Sync Logs</strong> tab — a successful push shows "1 updated"</li>
          <li>If you see <em>"Not found in eBay Inventory API (legacy listing)"</em>, that listing was created via the old Sell Your Item flow. You'll need to re-list it via the Inventory API or update stock manually on eBay</li>
          <li>Once confirmed working, activate the remaining mappings and push again</li>
        </ol>
      ),
      warning: (
        <>
          <strong>Legacy listings warning:</strong> eBay listings created via the traditional "Sell Your Item" flow
          (including most bulk-imported listings) are not accessible through the Inventory API.
          The stock push will log these as "legacy" and skip them — it will NOT break or corrupt anything.
          To fix this: re-list the item using eBay's Inventory API (via third-party tools or the eBay Seller Hub).
        </>
      ),
    },
    {
      num: 11,
      title: 'Test tracking push on one order',
      done: false,
      tab: 'tracking',
      action: 'Push Tracking →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Dispatch a sales order in ERP with a real tracking number (Sales → Orders → Dispatch)</li>
          <li>Go to the <strong>Push Tracking</strong> tab</li>
          <li>Enter the ERP Sales Order ID, Order Number, or eBay Order ID</li>
          <li>Optionally enter a tracking number and courier override (e.g. "Royal Mail" → mapped to ROYALMAIL)</li>
          <li>Click <strong>Push Tracking to eBay</strong></li>
          <li>Check the eBay order in Seller Hub — it should show as <em>Shipped</em> with the tracking number</li>
          <li>Check <strong>Sync Logs</strong> for the result</li>
        </ol>
      ),
      warning: 'The tracking push marks the eBay order as shipped permanently. Only do this on a real dispatched order with a genuine tracking number.',
    },
  ]

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" /> eBay Live Test Checklist
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Step-by-step guide to connect, test, and go live with eBay integration. Click any step to expand instructions.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map(step => (
          <StepRow key={step.num} step={step} onGotoTab={onGotoTab} />
        ))}
      </div>
    </div>
  )
}

// ── Amazon Live Test Guide ────────────────────────────────────────────────────

function AmazonGuideTab({ cs, channel, onGotoTab }: {
  cs: CredentialsSummary
  channel: { status: string; last_synced: string | null }
  onGotoTab: (t: Tab) => void
}) {
  const hasCredentials = !!(cs.seller_id_hint && cs.has_refresh_token)
  const isConnected = channel.status === 'active' && hasCredentials
  const hasSynced = !!channel.last_synced

  const steps: GuideStep[] = [
    {
      num: 1,
      title: 'Create an Amazon SP-API application',
      done: hasCredentials,
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Log in to <strong>Seller Central</strong> at sellercentral.amazon.co.uk</li>
          <li>Go to <strong>Apps &amp; Services → Develop Apps</strong></li>
          <li>Click <strong>Add new app client</strong>, give it a name (e.g. "ERP Integration"), select <strong>SP-API</strong></li>
          <li>Under <strong>API type</strong>, select <strong>Seller</strong> (not Vendor)</li>
          <li>Note your <strong>LWA Client ID</strong> (starts with <code className="text-xs bg-gray-100 px-1 rounded">amzn1.application-oa2-client.</code>) and <strong>LWA Client Secret</strong></li>
          <li>Click <strong>Authorise</strong> on your own application to generate a <strong>Refresh Token</strong> — copy it immediately, it is shown once</li>
          <li>Find your <strong>Seller ID</strong> (Merchant Token) at Seller Central → Account Info</li>
        </ol>
      ),
    },
    {
      num: 2,
      title: 'Enter credentials in ERP',
      done: hasCredentials,
      tab: 'credentials',
      action: 'Credentials tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <strong>Credentials tab</strong> on this page</li>
          <li>Enter your <strong>Seller ID</strong>, <strong>LWA Client ID</strong>, <strong>LWA Client Secret</strong>, and <strong>Refresh Token</strong></li>
          <li>Select your <strong>Marketplace</strong> (default: Amazon UK — A1F83G8C2ARO7P)</li>
          <li>Click <strong>Save Credentials</strong></li>
        </ol>
      ),
    },
    {
      num: 3,
      title: 'Test the connection',
      done: isConnected,
      tab: 'credentials',
      action: 'Credentials tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>In the Credentials tab, click <strong>Test Connection</strong></li>
          <li>A green message confirms SP-API access works and shows your marketplace participations</li>
          <li>If it fails: check Seller ID, ensure the app is authorised in Seller Central, and verify the refresh token was not revoked</li>
        </ol>
      ),
    },
    {
      num: 4,
      title: 'Import FBM orders',
      done: hasSynced,
      tab: 'overview',
      action: 'Overview tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to the <strong>Overview</strong> tab and click <strong>Import Orders</strong></li>
          <li>This fetches FBM (Merchant Fulfilled) orders with status <em>Unshipped</em> or <em>PartiallyShipped</em></li>
          <li>Orders are matched to ERP products by <strong>Seller SKU</strong></li>
          <li>Check <strong>Sales → Orders</strong> to see imported orders</li>
          <li>No stock is pushed yet — mappings start inactive and must be confirmed first</li>
        </ol>
      ),
      warning: 'Import is safe to run multiple times — duplicates are detected and skipped.',
    },
    {
      num: 5,
      title: 'Review unmatched orders',
      done: false,
      tab: 'unmatched',
      action: 'Unmatched Orders →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <strong>Unmatched Orders</strong> tab</li>
          <li>Orders with line items that could not be matched to an ERP product appear here</li>
          <li>Use the <strong>SKU Mapping</strong> tab to link the Amazon Seller SKU to an ERP product</li>
        </ol>
      ),
    },
    {
      num: 6,
      title: 'Activate SKU mappings',
      done: false,
      tab: 'skus',
      action: 'SKU Mapping →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the <strong>SKU Mapping</strong> tab</li>
          <li>Auto-created mappings are <em>Inactive</em> — stock will not be pushed until you activate them</li>
          <li>The <strong>Channel SKU</strong> column must contain the Amazon <strong>Seller SKU</strong> (not ASIN) for stock push to work</li>
          <li>Verify each row, then click <strong>Inactive</strong> to activate confirmed mappings</li>
        </ol>
      ),
      warning: 'Only activate mappings you have verified. Activating a wrong mapping pushes incorrect stock to Amazon.',
    },
    {
      num: 7,
      title: 'Dry-run stock push (preview — no changes to Amazon)',
      done: false,
      tab: 'overview',
      action: 'Overview tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>In the <strong>Overview</strong> tab, click <strong>Dry Run (preview only)</strong></li>
          <li>This shows every active mapping and the quantity that <em>would</em> be sent to Amazon</li>
          <li>No API calls are made to Amazon — completely safe to run any number of times</li>
          <li>Review the preview table, then proceed to a live push when ready</li>
        </ol>
      ),
    },
    {
      num: 8,
      title: 'Live stock push',
      done: false,
      tab: 'overview',
      action: 'Overview tab →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Activate one or more SKU mappings in the SKU Mapping tab</li>
          <li>Click <strong>Push Stock</strong> in the Overview tab</li>
          <li>Check the <strong>Sync Logs</strong> tab — a successful push shows "N updated"</li>
          <li>Stock is updated on Amazon via the <strong>Listings Items API</strong> (FBM fulfillment availability)</li>
          <li>Note: Amazon may take a few minutes to reflect the new stock level</li>
        </ol>
      ),
      warning: 'Stock push only works for listings managed via the SP-API. FBA listings are not affected — this integration pushes FBM (Merchant Fulfilled) availability only.',
    },
    {
      num: 9,
      title: 'Test tracking push on one order',
      done: false,
      tab: 'tracking',
      action: 'Push Tracking →',
      details: (
        <ol className="list-decimal list-inside space-y-1">
          <li>Dispatch a sales order in ERP with a real tracking number (Sales → Orders → Dispatch)</li>
          <li>Go to the <strong>Push Tracking</strong> tab</li>
          <li>Enter the ERP Sales Order ID or Order Number</li>
          <li>Optionally enter a tracking number and courier override (e.g. "Royal Mail")</li>
          <li>Click <strong>Push Tracking to Amazon</strong></li>
          <li>Amazon marks the order as shipped via <code className="text-xs bg-gray-100 px-1 rounded">confirm_shipment</code></li>
          <li>Check <strong>Sync Logs</strong> for the result</li>
        </ol>
      ),
      warning: 'The tracking push marks the Amazon order as shipped permanently. Only do this on a real dispatched order with a genuine tracking number.',
    },
  ]

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-orange-600" /> Amazon SP-API Live Test Checklist
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Step-by-step guide to connect, test, and go live with Amazon SP-API. Click any step to expand instructions.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map(step => (
          <StepRow key={step.num} step={step} onGotoTab={onGotoTab} />
        ))}
      </div>
    </div>
  )
}

export default function ChannelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const channelId = Number(id)

  const initialTab = (location.state as { tab?: Tab } | null)?.tab ?? 'overview'
  const [tab, setTab] = useState<Tab>(initialTab)

  // WooCommerce credentials form state
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [credSaved, setCredSaved] = useState(false)
  const [credError, setCredError] = useState('')

  // eBay credentials form state
  const [ebayAppId, setEbayAppId] = useState('')
  const [ebayCertId, setEbayCertId] = useState('')
  const [ebayRuName, setEbayRuName] = useState('')
  const [ebayMarketplace, setEbayMarketplace] = useState('EBAY_GB')
  const [ebaySandbox, setEbaySandbox] = useState(false)
  const [ebayAuthUrl, setEbayAuthUrl] = useState('')
  const [ebayCode, setEbayCode] = useState('')
  const [ebayCodeResult, setEbayCodeResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [ebayCredSaved, setEbayCredSaved] = useState(false)

  // Amazon credentials form state
  const [amzSellerId, setAmzSellerId] = useState('')
  const [amzClientId, setAmzClientId] = useState('')
  const [amzClientSecret, setAmzClientSecret] = useState('')
  const [amzRefreshToken, setAmzRefreshToken] = useState('')
  const [amzMarketplaceId, setAmzMarketplaceId] = useState('A1F83G8C2ARO7P')
  const [amzCredSaved, setAmzCredSaved] = useState(false)

  // Amazon: save credentials mutation
  const amzCredMut = useMutation({
    mutationFn: (data: Record<string, string>) =>
      channelsApi.setCredentials(channelId, data).then(r => r.data),
    onSuccess: () => {
      setAmzCredSaved(true)
      setAmzClientSecret('')
      setAmzRefreshToken('')
      qc.invalidateQueries({ queryKey: ['channel', channelId] })
      setTimeout(() => setAmzCredSaved(false), 3000)
    },
  })

  // Push tracking form
  const [trackingOrderId, setTrackingOrderId] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingCourier, setTrackingCourier] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [trackingResult, setTrackingResult] = useState<{ ok: boolean; message: string } | null>(null)

  // SKU Mapping form
  const [newExtSku, setNewExtSku] = useState('')
  const [newExtId, setNewExtId] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [newErpSku, setNewErpSku] = useState('')
  const [skuFormError, setSkuFormError] = useState('')
  const [skuFormOk, setSkuFormOk] = useState('')

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

  const { data: skuMappingsData, refetch: refetchSkuMappings } = useQuery({
    queryKey: ['channel-sku-mappings', channelId],
    queryFn: () => channelsApi.skuMappings(channelId).then(r => r.data as SkuMapping[]),
    enabled: !!channel,
  })
  const skuMappings: SkuMapping[] = Array.isArray(skuMappingsData) ? skuMappingsData : []

  const { data: unmatchedData, refetch: refetchUnmatched } = useQuery({
    queryKey: ['channel-unmatched-orders', channelId],
    queryFn: () => channelsApi.unmatchedOrders(channelId).then(r => r.data as UnmatchedOrder[]),
    enabled: !!channel,
  })
  const unmatchedOrders: UnmatchedOrder[] = Array.isArray(unmatchedData) ? unmatchedData : []

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

  // eBay: save App ID / Cert ID / RuName
  const ebayCredMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      channelsApi.setCredentials(channelId, data).then(r => r.data),
    onSuccess: () => {
      setEbayCredSaved(true)
      qc.invalidateQueries({ queryKey: ['channel', channelId] })
      setTimeout(() => setEbayCredSaved(false), 3000)
    },
  })

  // eBay: generate auth URL
  const ebayAuthUrlMut = useMutation({
    mutationFn: () => channelsApi.ebayAuthUrl(channelId).then(r => r.data as { auth_url: string }),
    onSuccess: (data) => setEbayAuthUrl(data.auth_url),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to generate URL'
      setEbayCodeResult({ ok: false, message: msg })
    },
  })

  // eBay: exchange authorization code for tokens
  const ebayExchangeMut = useMutation({
    mutationFn: (code: string) => channelsApi.ebayExchangeCode(channelId, { code }).then(r => r.data),
    onSuccess: (data) => {
      setEbayCodeResult({ ok: true, message: data.message })
      setEbayCode('')
      setEbayAuthUrl('')
      qc.invalidateQueries({ queryKey: ['channel', channelId] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Code exchange failed'
      setEbayCodeResult({ ok: false, message: msg })
    },
  })

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
      refetchUnmatched()
      refetchSkuMappings()
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
    mutationFn: (payload: Record<string, string>) => channelsApi.pushTracking(channelId, payload).then(r => r.data),
    onSuccess: (data) => {
      setTrackingResult({ ok: true, message: data.message })
      setTrackingOrderId('')
      setTrackingNumber('')
      setTrackingCourier('')
      setTrackingUrl('')
      refetchLogs()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Push failed'
      setTrackingResult({ ok: false, message: msg })
    },
  })

  // Create SKU mapping
  const createSkuMut = useMutation({
    mutationFn: (data: Record<string, string>) => channelsApi.createSkuMapping(channelId, data).then(r => r.data),
    onSuccess: () => {
      setSkuFormOk('Mapping created.')
      setSkuFormError('')
      setNewExtSku(''); setNewExtId(''); setNewParentId(''); setNewErpSku('')
      refetchSkuMappings()
      setTimeout(() => setSkuFormOk(''), 3000)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data?.error
        || (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Failed to create mapping'
      setSkuFormError(msg)
    },
  })

  // Toggle SKU mapping active
  const toggleSkuMut = useMutation({
    mutationFn: ({ listingId, isActive }: { listingId: number; isActive: boolean }) =>
      channelsApi.updateSkuMapping(channelId, { listing_id: listingId, is_active: isActive }).then(r => r.data),
    onSuccess: () => refetchSkuMappings(),
  })

  // Delete SKU mapping
  const deleteSkuMut = useMutation({
    mutationFn: (listingId: number) => channelsApi.deleteSkuMapping(channelId, listingId).then(r => r.data),
    onSuccess: () => refetchSkuMappings(),
  })

  // eBay dry-run stock push
  const [dryRunResult, setDryRunResult] = useState<{
    preview: Array<{ erp_sku: string; ebay_sku?: string; amazon_sku?: string; qty: number }>
    message: string
  } | null>(null)

  const dryRunMut = useMutation({
    mutationFn: () => channelsApi.pushStockDryRun(channelId).then(r => r.data),
    onSuccess: (data) => {
      setDryRunResult({ preview: data.preview || [], message: data.message || '' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Dry run failed'
      setSyncResult({ id: 0, sync_type: 'push_stock', status: 'failed', records_processed: 0, records_created: 0, records_updated: 0, records_failed: 0, message: msg, started_at: new Date().toISOString(), completed_at: null, duration_seconds: null })
    },
  })

  const isBusy = syncOrdersMut.isPending || pushStockMut.isPending || dryRunMut.isPending

  if (isLoading) {
    return <div className="p-6 text-gray-400">Loading…</div>
  }
  if (!channel) {
    return <div className="p-6 text-red-600">Channel not found</div>
  }

  const cs = channel.credentials_summary || {}
  const isWC = channel.channel_type === 'woocommerce'
  const isEbay = channel.channel_type === 'ebay'
  const isAmazon = channel.channel_type === 'amazon'

  const tabClass = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
      tab === t
        ? 'border-blue-600 text-blue-700'
        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
    }`

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

      {/* Tab bar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200 px-2">
          <button className={tabClass('overview')} onClick={() => setTab('overview')}>
            <Wifi className="w-3.5 h-3.5" /> Overview
          </button>
          <button className={tabClass('credentials')} onClick={() => setTab('credentials')}>
            <Tag className="w-3.5 h-3.5" /> Credentials
          </button>
          <button className={tabClass('skus')} onClick={() => setTab('skus')}>
            <Link2 className="w-3.5 h-3.5" /> SKU Mapping
          </button>
          <button className={tabClass('unmatched')} onClick={() => setTab('unmatched')}>
            <AlertTriangle className="w-3.5 h-3.5" /> Unmatched Orders
          </button>
          <button className={tabClass('logs')} onClick={() => setTab('logs')}>
            <Clock className="w-3.5 h-3.5" /> Sync Logs
          </button>
          <button className={tabClass('tracking')} onClick={() => setTab('tracking')}>
            <Truck className="w-3.5 h-3.5" /> Push Tracking
          </button>
          {(isEbay || isAmazon) && (
            <button className={tabClass('guide')} onClick={() => setTab('guide')}>
              <BookOpen className="w-3.5 h-3.5" /> Live Test Guide
            </button>
          )}
        </div>

        {/* Placeholder panels for tabs not yet implemented */}
        {tab === 'credentials' && (
          <div className="p-5 space-y-6">

            {/* ── eBay OAuth setup ─────────────────────────────────────── */}
            {isEbay && (
              <>
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                    <Tag className="w-4 h-4" /> How to connect your eBay seller account
                  </h3>
                  <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                    <li>Register at <strong>developer.ebay.com</strong> and create a production application</li>
                    <li>Copy your <strong>App ID</strong> (Client ID), <strong>Cert ID</strong> (Client Secret), and <strong>Dev ID</strong> from the "Application Keys" page</li>
                    <li>In your eBay app settings, add an <strong>OAuth User Token</strong> with scopes: <code className="text-xs bg-blue-100 px-1 rounded">sell.fulfillment sell.inventory</code></li>
                    <li>Set a <strong>RuName</strong> (Redirect URI Name) — for a local ERP you can use any HTTPS URL you control, or the eBay sandbox test URL</li>
                    <li>Enter App ID, Cert ID, and RuName below, then click <strong>Save App Credentials</strong></li>
                    <li>Click <strong>Generate Auth URL</strong>, visit the URL in your browser, sign in as the seller, and grant access</li>
                    <li>eBay will redirect to your RuName with <code className="text-xs bg-blue-100 px-1 rounded">?code=v^1.1...</code> in the URL — copy that code value</li>
                    <li>Paste the code into the "Exchange Code" box below and click <strong>Exchange Code</strong></li>
                  </ol>
                </div>

                {/* Token status */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">Current token status</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">App ID</span>
                      <p className="font-mono text-gray-800 mt-0.5">{cs.app_id_hint || <span className="text-gray-400 font-sans">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Mode</span>
                      <p className="mt-0.5">
                        {cs.sandbox
                          ? <span className="text-amber-600 font-semibold">Sandbox</span>
                          : <span className="text-green-700 font-semibold">Production</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Access Token</span>
                      <p className="mt-0.5">
                        {cs.has_token
                          ? cs.token_valid
                            ? <span className="text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Valid</span>
                            : <span className="text-red-600 font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Expired</span>
                          : <span className="text-gray-400">Not set</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Refresh Token</span>
                      <p className="mt-0.5">
                        {cs.has_refresh_token
                          ? <span className="text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Stored</span>
                          : <span className="text-gray-400">Not stored</span>}
                      </p>
                    </div>
                    {cs.token_expires_at && (
                      <div className="col-span-2">
                        <span className="text-gray-400">Token expires</span>
                        <p className="text-gray-600 mt-0.5 text-xs font-mono">{cs.token_expires_at}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 1: App credentials */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">Step 1 — App Credentials</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">App ID (Client ID)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={ebayAppId} onChange={e => setEbayAppId(e.target.value)}
                        placeholder={cs.app_id_hint || 'MyApp-12345-abc...'}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Cert ID (Client Secret)</label>
                      <input
                        type="password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={ebayCertId} onChange={e => setEbayCertId(e.target.value)}
                        placeholder="SBX-abc123... or PRD-abc123..."
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">RuName (OAuth Redirect URI Name)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={ebayRuName} onChange={e => setEbayRuName(e.target.value)}
                        placeholder="MyApp-MyApp-abc-xyz"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Marketplace</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        value={ebayMarketplace} onChange={e => setEbayMarketplace(e.target.value)}
                      >
                        <option value="EBAY_GB">eBay UK (EBAY_GB)</option>
                        <option value="EBAY_US">eBay US (EBAY_US)</option>
                        <option value="EBAY_DE">eBay Germany (EBAY_DE)</option>
                        <option value="EBAY_FR">eBay France (EBAY_FR)</option>
                        <option value="EBAY_IT">eBay Italy (EBAY_IT)</option>
                        <option value="EBAY_ES">eBay Spain (EBAY_ES)</option>
                        <option value="EBAY_AU">eBay Australia (EBAY_AU)</option>
                        <option value="EBAY_CA">eBay Canada (EBAY_CA)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="ebaySandbox" checked={ebaySandbox} onChange={e => setEbaySandbox(e.target.checked)} className="rounded" />
                    <label htmlFor="ebaySandbox" className="text-sm text-gray-600">Use Sandbox (testing only)</label>
                  </div>
                  {ebayCredSaved && (
                    <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> App credentials saved.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      const payload: Record<string, unknown> = { marketplace_id: ebayMarketplace, sandbox: ebaySandbox }
                      if (ebayAppId.trim()) payload.app_id = ebayAppId.trim()
                      if (ebayCertId.trim()) payload.cert_id = ebayCertId.trim()
                      if (ebayRuName.trim()) payload.ru_name = ebayRuName.trim()
                      ebayCredMut.mutate(payload)
                    }}
                    disabled={ebayCredMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                  >
                    {ebayCredMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {ebayCredMut.isPending ? 'Saving…' : 'Save App Credentials'}
                  </button>
                </div>

                {/* Step 2: Generate auth URL */}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700">Step 2 — Generate Auth URL &amp; Visit It</h3>
                  <p className="text-xs text-gray-400">After saving App ID, Cert ID, and RuName above, generate the eBay consent URL and open it in your browser.</p>
                  <button
                    onClick={() => { setEbayAuthUrl(''); ebayAuthUrlMut.mutate() }}
                    disabled={ebayAuthUrlMut.isPending || !cs.app_id_hint}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {ebayAuthUrlMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Generate Auth URL
                  </button>
                  {ebayAuthUrl && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-600">Open this URL in your browser and sign in as the seller:</p>
                      <a
                        href={ebayAuthUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 hover:text-blue-800 break-all flex items-start gap-1"
                      >
                        {ebayAuthUrl} <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                      </a>
                      <p className="text-xs text-gray-400">After granting access, eBay redirects you to your RuName URL. Copy the <code className="bg-gray-200 px-1 rounded">code=</code> value from that URL.</p>
                    </div>
                  )}
                </div>

                {/* Step 3: Exchange code */}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700">Step 3 — Paste Authorization Code</h3>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    value={ebayCode}
                    onChange={e => setEbayCode(e.target.value)}
                    placeholder="v^1.1#i^1#p^3#f^0#..."
                  />
                  {ebayCodeResult && (
                    <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${ebayCodeResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                      {ebayCodeResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                      <span>{ebayCodeResult.message}</span>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setEbayCodeResult(null); ebayExchangeMut.mutate(ebayCode.trim()) }}
                      disabled={!ebayCode.trim() || ebayExchangeMut.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {ebayExchangeMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {ebayExchangeMut.isPending ? 'Exchanging…' : 'Exchange Code'}
                    </button>
                    <button
                      onClick={() => testMut.mutate()}
                      disabled={testMut.isPending || !cs.is_configured}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      Test Connection
                    </button>
                  </div>
                  {testResult && (
                    <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                      {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Amazon SP-API credentials ─────────────────────────────── */}
            {isAmazon && (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                    <Tag className="w-4 h-4" /> How to connect your Amazon Seller account
                  </h3>
                  <ol className="text-sm text-orange-700 space-y-1.5 list-decimal list-inside">
                    <li>Go to <strong>Seller Central → Apps &amp; Services → Develop Apps</strong></li>
                    <li>Create a new application (SP-API, self-authorised)</li>
                    <li>Under <strong>LWA Credentials</strong>, note your <strong>Client ID</strong> (starts with <code className="text-xs bg-orange-100 px-1 rounded">amzn1.application-oa2-client.</code>) and <strong>Client Secret</strong></li>
                    <li>Under <strong>Authorise</strong>, generate a <strong>Refresh Token</strong> by clicking "Authorise" and following the flow — copy the token shown at the end</li>
                    <li>Find your <strong>Seller ID</strong> in Seller Central → Account Info → Merchant Token</li>
                    <li>Enter all four values below and click <strong>Save Credentials</strong></li>
                    <li>Click <strong>Test Connection</strong> to verify everything is working</li>
                  </ol>
                </div>

                {/* Current status */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">Current credential status</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Seller ID</span>
                      <p className="font-mono text-gray-800 mt-0.5">{cs.seller_id_hint || <span className="text-gray-400 font-sans">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Marketplace</span>
                      <p className="font-mono text-gray-800 mt-0.5">{cs.marketplace_id || 'A1F83G8C2ARO7P'}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">LWA Client ID</span>
                      <p className="font-mono text-gray-800 mt-0.5">{cs.lwa_client_id_hint || <span className="text-gray-400 font-sans">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Refresh Token</span>
                      <p className="mt-0.5">
                        {cs.has_refresh_token
                          ? <span className="text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Stored</span>
                          : <span className="text-gray-400">Not stored</span>}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400">Ready</span>
                      <p className="mt-0.5">
                        {cs.is_configured
                          ? <span className="text-green-700 font-semibold flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> Configured</span>
                          : <span className="text-amber-600 flex items-center gap-1"><WifiOff className="w-3.5 h-3.5" /> Incomplete — fill all fields below</span>}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Credentials form */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">SP-API Credentials</h3>
                  <p className="text-xs text-gray-400">Leave a field blank to keep its existing value. Secrets are stored encrypted and never shown again.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Seller ID (Merchant Token)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={amzSellerId} onChange={e => setAmzSellerId(e.target.value)}
                        placeholder={cs.seller_id_hint || 'XXXXXXXXXX'}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Marketplace ID</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        value={amzMarketplaceId} onChange={e => setAmzMarketplaceId(e.target.value)}
                      >
                        <option value="A1F83G8C2ARO7P">Amazon UK (A1F83G8C2ARO7P)</option>
                        <option value="ATVPDKIKX0DER">Amazon US (ATVPDKIKX0DER)</option>
                        <option value="A1PA6795UKMFR9">Amazon DE (A1PA6795UKMFR9)</option>
                        <option value="APJ6JRA9NG5V4">Amazon IT (APJ6JRA9NG5V4)</option>
                        <option value="A13V1IB3VIYZZH">Amazon FR (A13V1IB3VIYZZH)</option>
                        <option value="A1RKKUPIHCS9HS">Amazon ES (A1RKKUPIHCS9HS)</option>
                        <option value="A39IBJ37TRP1C6">Amazon AU (A39IBJ37TRP1C6)</option>
                        <option value="A2EUQ1WTGCTBG2">Amazon CA (A2EUQ1WTGCTBG2)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">LWA Client ID</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={amzClientId} onChange={e => setAmzClientId(e.target.value)}
                        placeholder={cs.lwa_client_id_hint || 'amzn1.application-oa2-client.xxx'}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">LWA Client Secret</label>
                      <input
                        type="password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={amzClientSecret} onChange={e => setAmzClientSecret(e.target.value)}
                        placeholder={cs.is_configured ? '•••••••• (stored — enter to replace)' : 'amzn1.oa2-cs.v1.xxx'}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Refresh Token</label>
                      <input
                        type="password"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        value={amzRefreshToken} onChange={e => setAmzRefreshToken(e.target.value)}
                        placeholder={cs.has_refresh_token ? '•••••••• (stored — enter to replace)' : 'Atzr|…'}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {amzCredSaved && (
                    <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Amazon credentials saved.
                    </p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => {
                        const payload: Record<string, string> = { marketplace_id: amzMarketplaceId }
                        if (amzSellerId.trim()) payload.seller_id = amzSellerId.trim()
                        if (amzClientId.trim()) payload.lwa_client_id = amzClientId.trim()
                        if (amzClientSecret.trim()) payload.lwa_client_secret = amzClientSecret.trim()
                        if (amzRefreshToken.trim()) payload.refresh_token = amzRefreshToken.trim()
                        amzCredMut.mutate(payload)
                      }}
                      disabled={amzCredMut.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                    >
                      {amzCredMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {amzCredMut.isPending ? 'Saving…' : 'Save Credentials'}
                    </button>
                    <button
                      onClick={() => testMut.mutate()}
                      disabled={testMut.isPending || !cs.is_configured}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      {testMut.isPending ? 'Testing…' : 'Test Connection'}
                    </button>
                  </div>

                  {testResult && (
                    <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 ${testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                      {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── WooCommerce credentials ──────────────────────────────── */}
            {isWC && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                    <Tag className="w-4 h-4" /> How to generate WooCommerce API keys
                  </h3>
                  <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                    <li>Log in to your WordPress admin dashboard</li>
                    <li>Go to <strong>WooCommerce → Settings → Advanced → REST API</strong></li>
                    <li>Click <strong>Add key</strong></li>
                    <li>Set Description (e.g. "ERP Integration"), User (admin), Permissions = <strong>Read/Write</strong></li>
                    <li>Click <strong>Generate API key</strong></li>
                    <li>Copy the <strong>Consumer key</strong> (starts with <code>ck_</code>) and <strong>Consumer secret</strong> (starts with <code>cs_</code>) — these are shown only once</li>
                    <li>Paste them into the form below along with your store URL</li>
                  </ol>
                </div>

                {/* Current credential status */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">Current status</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Store URL</span>
                      <p className="font-mono text-gray-800 mt-0.5 truncate">{cs.store_url || <span className="text-gray-400 font-sans">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Consumer Key</span>
                      <p className="font-mono text-gray-800 mt-0.5">{cs.consumer_key_hint || <span className="text-gray-400 font-sans">Not set</span>}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Consumer Secret</span>
                      <p className="mt-0.5">
                        {cs.has_secret
                          ? <span className="text-green-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Set</span>
                          : <span className="text-gray-400">Not set</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Configured</span>
                      <p className="mt-0.5">
                        {cs.is_configured
                          ? <span className="text-green-700 font-semibold flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> Ready</span>
                          : <span className="text-amber-600 flex items-center gap-1"><WifiOff className="w-3.5 h-3.5" /> Incomplete</span>}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Credentials form */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">Update credentials</h3>
                  <p className="text-xs text-gray-400">Leave any field blank to keep its existing value. Only non-blank fields will be saved.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Store URL</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={storeUrl}
                      onChange={e => setStoreUrl(e.target.value)}
                      placeholder={cs.store_url || 'https://mystore.com'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Consumer Key</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                      value={consumerKey}
                      onChange={e => setConsumerKey(e.target.value)}
                      placeholder={cs.consumer_key_hint ? `Currently: ${cs.consumer_key_hint}… — enter to replace` : 'ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                      autoComplete="off"
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
                      autoComplete="new-password"
                    />
                  </div>

                  {credError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{credError}</p>}
                  {credSaved && (
                    <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Credentials saved successfully.
                    </p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handleSaveCreds}
                      disabled={credMut.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                    >
                      {credMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {credMut.isPending ? 'Saving…' : 'Save Credentials'}
                    </button>
                    <button
                      onClick={() => testMut.mutate()}
                      disabled={testMut.isPending || !cs.is_configured}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                      {testMut.isPending ? 'Testing…' : 'Test Connection'}
                    </button>
                  </div>

                  {testResult && (
                    <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 ${testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                      {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {tab === 'skus' && (
          <div className="divide-y divide-gray-100">
            {/* Explanation */}
            <div className="p-4 bg-amber-50 text-amber-800 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Stock push safety:</strong> Only mappings marked <strong>Active</strong> will push stock to {isEbay ? 'eBay' : isAmazon ? 'Amazon' : 'WooCommerce'}.
                {isEbay && <> For eBay, the <strong>Channel SKU</strong> column must contain the eBay Inventory API SKU (not the listing ID). Stock push uses the Inventory API.</>}
                {isAmazon && <> For Amazon, the <strong>Channel SKU</strong> column must contain the <strong>Seller SKU</strong> (not the ASIN). Stock push uses the Listings Items API.</>}
                Auto-created mappings start as inactive. Review and activate each one after confirming the product match is correct.
              </span>
            </div>

            {/* Mapping table */}
            {skuMappings.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                No SKU mappings yet. Import orders to auto-create mappings, or add one manually below.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left font-medium">{isAmazon ? 'Seller SKU' : isEbay ? 'eBay SKU' : 'Channel SKU'}</th>
                      <th className="px-4 py-2.5 text-left font-medium">{isAmazon ? 'ASIN' : isEbay ? 'Item ID' : 'Channel ID'}</th>
                      <th className="px-4 py-2.5 text-left font-medium">ERP Product</th>
                      <th className="px-4 py-2.5 text-left font-medium">Type</th>
                      <th className="px-4 py-2.5 text-left font-medium">Active</th>
                      <th className="px-4 py-2.5 text-left font-medium">Last Synced</th>
                      <th className="px-4 py-2.5 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {skuMappings.map(m => (
                      <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{m.external_sku || m.external_id}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                          {m.parent_id ? `${m.parent_id} / ${m.external_id}` : m.external_id}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-xs text-gray-800">{m.product_sku}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[160px]">{m.product_title}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.is_variation ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {m.is_variation ? 'Variation' : 'Simple'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => toggleSkuMut.mutate({ listingId: m.id, isActive: !m.is_active })}
                            disabled={toggleSkuMut.isPending}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer border ${m.is_active ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'}`}
                          >
                            {m.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(m.last_synced)}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => { if (confirm('Delete this mapping?')) deleteSkuMut.mutate(m.id) }}
                            disabled={deleteSkuMut.isPending}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add manual mapping */}
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Link2 className="w-4 h-4" /> Add Manual Mapping</h3>
              <p className="text-xs text-gray-400">
                Enter the WooCommerce product details and the ERP product SKU. For variable products, enter the variation ID in "WC ID" and the parent product ID in "Parent ID".
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">WC SKU (external_sku)</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    value={newExtSku} onChange={e => setNewExtSku(e.target.value)}
                    placeholder="e.g. WC-SHIRT-RED-M"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">WC Product/Variation ID</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    value={newExtId} onChange={e => setNewExtId(e.target.value)}
                    placeholder="e.g. 123 (or variation ID)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Parent Product ID (variations only)</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    value={newParentId} onChange={e => setNewParentId(e.target.value)}
                    placeholder="Leave blank for simple products"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ERP Product SKU</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    value={newErpSku} onChange={e => setNewErpSku(e.target.value)}
                    placeholder="e.g. SHIRT-RED-M"
                  />
                </div>
              </div>
              {skuFormError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{skuFormError}</p>}
              {skuFormOk && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{skuFormOk}</p>}
              <button
                onClick={() => {
                  setSkuFormError('')
                  if (!newExtId || !newErpSku) { setSkuFormError('WC ID and ERP SKU are required'); return }
                  createSkuMut.mutate({ external_id: newExtId, external_sku: newExtSku, parent_id: newParentId, sku: newErpSku })
                }}
                disabled={createSkuMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {createSkuMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {createSkuMut.isPending ? 'Creating…' : 'Create Mapping'}
              </button>
            </div>
          </div>
        )}
        {tab === 'unmatched' && (
          <div className="divide-y divide-gray-100">
            <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <strong>{unmatchedOrders.length}</strong> order{unmatchedOrders.length !== 1 ? 's' : ''} with unmatched items
              </p>
              <button
                onClick={() => refetchUnmatched()}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {unmatchedOrders.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                No unmatched orders. All imported items have been matched to ERP products.
              </div>
            ) : (
              <>
                <div className="px-5 py-3 bg-amber-50 text-amber-800 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    These orders were imported but one or more line items could not be matched to an ERP product.
                    Go to the <button className="underline font-semibold" onClick={() => setTab('skus')}>SKU Mapping tab</button> to add mappings.
                    Once a mapping is created, re-import orders to link the items.
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="px-4 py-2.5 text-left font-medium">WC Order #</th>
                        <th className="px-4 py-2.5 text-left font-medium">Status</th>
                        <th className="px-4 py-2.5 text-left font-medium">Fetched</th>
                        <th className="px-4 py-2.5 text-left font-medium">Error / Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {unmatchedOrders.map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono font-bold text-gray-800">
                            #{o.external_order_number || o.external_order_id}
                          </td>
                          <td className="px-4 py-2.5">
                            <ImportStatusPill status={o.status} />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(o.fetched_at)}</td>
                          <td className="px-4 py-2.5 text-xs text-red-600 max-w-xs">
                            {o.error_message || <span className="text-gray-400">No error message</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {tab === 'logs' && (
          <div className="divide-y divide-gray-100">
            <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600"><strong>{logs.length}</strong> log entries</p>
              <button onClick={() => refetchLogs()} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No sync history yet. Run Import Orders or Push Stock to create entries.</div>
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
                      <th className="px-4 py-2.5 text-left font-medium">Duration</th>
                      <th className="px-4 py-2.5 text-left font-medium">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <LogRow key={log.id} log={log} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === 'tracking' && (
          <div className="p-5 space-y-5">
            <p className="text-sm text-gray-500">
              {isEbay
                ? 'Push a tracking number to eBay to mark an order as shipped. The order must have been imported from this channel and dispatched in ERP. This creates a shipping fulfillment record on eBay.'
                : isAmazon
                  ? 'Push a tracking number to Amazon to confirm shipment. The order must have been imported from this channel and dispatched in ERP. This calls confirm_shipment on the Amazon Orders API.'
                  : 'Push a tracking number and courier to WooCommerce for a specific order. The order must have been imported from this channel and be dispatched in ERP. This adds a customer-visible note and marks the WooCommerce order as completed.'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                  Order Reference <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="ERP Sales Order ID, Order Number, or WC Order ID"
                  value={trackingOrderId}
                  onChange={e => setTrackingOrderId(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Accepts ERP order ID (e.g. 42), order number (e.g. SO-0042), or WooCommerce order ID.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                    Tracking Number <span className="text-gray-400">(optional override)</span>
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave blank to use shipment tracking"
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                    Courier Name <span className="text-gray-400">(optional override)</span>
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Royal Mail, DHL, FedEx"
                    value={trackingCourier}
                    onChange={e => setTrackingCourier(e.target.value)}
                  />
                </div>
              </div>

              {!isEbay && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                    Tracking URL <span className="text-gray-400">(optional override)</span>
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                    placeholder="https://track.example.com/ABC123 — leave blank to auto-generate"
                    value={trackingUrl}
                    onChange={e => setTrackingUrl(e.target.value)}
                  />
                </div>
              )}
              {(isEbay || isAmazon) && (
                <p className="text-xs text-gray-400 col-span-2">
                  Carrier code is auto-detected from the courier name (e.g. "Royal Mail" → {isEbay ? 'ROYALMAIL' : 'Royal Mail'}).
                  If unrecognised, it defaults to {isEbay ? 'OTHER' : 'Other'}.
                </p>
              )}
            </div>

            {trackingResult && (
              <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 ${trackingResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                {trackingResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{trackingResult.message}</span>
              </div>
            )}

            <button
              onClick={() => {
                setTrackingResult(null)
                const payload: Record<string, string> = {}
                const ref = trackingOrderId.trim()
                if (!ref) return
                if (/^\d+$/.test(ref)) {
                  payload.order_id = ref
                } else {
                  payload.order_number = ref
                }
                if (trackingNumber.trim()) payload.tracking_number = trackingNumber.trim()
                if (trackingCourier.trim()) payload.courier = trackingCourier.trim()
                if (trackingUrl.trim()) payload.tracking_url = trackingUrl.trim()
                pushTrackingMut.mutate(payload)
              }}
              disabled={!trackingOrderId.trim() || pushTrackingMut.isPending || !cs.is_configured}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {pushTrackingMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              {pushTrackingMut.isPending ? 'Pushing…' : isEbay ? 'Push Tracking to eBay' : isAmazon ? 'Push Tracking to Amazon' : 'Push Tracking to WooCommerce'}
            </button>
          </div>
        )}
        {/* Live Test Guide */}
        {tab === 'guide' && isEbay && (
          <EbayGuideTab cs={cs} channel={channel} onGotoTab={setTab} />
        )}
        {tab === 'guide' && isAmazon && (
          <AmazonGuideTab cs={cs} channel={channel} onGotoTab={setTab} />
        )}
      </div>

      {/* Overview tab: all existing sections */}
      {tab === 'overview' && (<>

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

        {/* Dry run — eBay and Amazon */}
        {(isEbay || isAmazon) && (
          <div className="space-y-2">
            <button
              onClick={() => { setDryRunResult(null); dryRunMut.mutate() }}
              disabled={isBusy || !cs.is_configured}
              className="flex items-center gap-2 px-4 py-2 border border-purple-300 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 disabled:opacity-50"
            >
              {dryRunMut.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Checking…</>
                : <><FlaskConical className="w-4 h-4" /> Dry Run (preview only — no changes)</>}
            </button>
            {dryRunResult && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-purple-800">
                  Dry Run: {dryRunResult.preview.length} listing(s) would be updated
                </p>
                {dryRunResult.preview.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-purple-600 uppercase tracking-wide">
                        <th className="text-left py-1">ERP SKU</th>
                        <th className="text-left py-1">{isAmazon ? 'Seller SKU' : 'eBay Inventory SKU'}</th>
                        <th className="text-right py-1">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-100">
                      {dryRunResult.preview.map((p, i) => (
                        <tr key={i}>
                          <td className="py-1 font-mono">{p.erp_sku}</td>
                          <td className="py-1 font-mono">{isAmazon ? p.amazon_sku : p.ebay_sku}</td>
                          <td className="py-1 text-right font-semibold">{p.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-xs text-purple-600 italic">No changes were made to {isAmazon ? 'Amazon' : 'eBay'}.</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400">
          <strong>Import Orders</strong> pulls {isEbay ? 'eBay' : isAmazon ? 'Amazon FBM (Merchant Fulfilled)' : 'WooCommerce'} orders
          {isAmazon ? ' with status Unshipped or PartiallyShipped' : ' with status processing/on-hold/pending'}.
          <strong className="ml-2">Push Stock</strong> updates qty_available for all <strong>confirmed active</strong> mappings only — inactive mappings are never pushed.
          {isEbay && <><br /><strong className="text-amber-600">Note:</strong> Only listings managed via the eBay Inventory API can be updated. Traditional "Sell Your Item" listings are skipped and logged.</>}
          {isAmazon && <><br /><strong className="text-amber-600">Note:</strong> Stock push uses the Listings Items API and updates FBM (Merchant Fulfilled) availability. FBA inventory is managed separately by Amazon.</>}
        </p>

        {/* Push tracking */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Truck className="w-4 h-4" /> {isEbay ? 'Push Tracking to eBay' : isAmazon ? 'Push Tracking to Amazon' : 'Push Tracking to WooCommerce'}
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
                pushTrackingMut.mutate({ order_id: trackingOrderId })
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

      </>)}

    </div>
  )
}
