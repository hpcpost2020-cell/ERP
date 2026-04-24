// @ts-nocheck
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reports } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import { BarChart3, TrendingUp, Users, Package, Truck, RotateCcw, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, parseISO } from 'date-fns'

type Tab = 'sales' | 'channels' | 'products' | 'profit' | 'customers' | 'low-stock' | 'open-pos' | 'returns'
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'sales', label: 'Daily Sales', icon: TrendingUp },
  { key: 'channels', label: 'Channels', icon: BarChart3 },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'profit', label: 'Profit', icon: TrendingUp },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'low-stock', label: 'Low Stock', icon: AlertTriangle },
  { key: 'open-pos', label: 'Open POs', icon: Truck },
  { key: 'returns', label: 'Returns', icon: RotateCcw },
]

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales')
  const [days, setDays] = useState(30)

  const { data: dailySales, isLoading: dls } = useQuery({ queryKey: ['r-daily', days], queryFn: () => reports.dailySales(days).then(r => r.data), enabled: tab === 'sales' })
  const { data: channels, isLoading: cls } = useQuery({ queryKey: ['r-channels', days], queryFn: () => reports.channelPerformance(days).then(r => r.data), enabled: tab === 'channels' })
  const { data: prods, isLoading: pls } = useQuery({ queryKey: ['r-products', days], queryFn: () => reports.productPerformance(days).then(r => r.data), enabled: tab === 'products' })
  const { data: profit, isLoading: profls } = useQuery({ queryKey: ['r-profit', days], queryFn: () => reports.profit(days).then(r => r.data), enabled: tab === 'profit' })
  const { data: custSpend, isLoading: cus } = useQuery({ queryKey: ['r-customers'], queryFn: () => reports.customerSpend().then(r => r.data), enabled: tab === 'customers' })
  const { data: lowStock, isLoading: lss } = useQuery({ queryKey: ['r-lowstock'], queryFn: () => reports.lowStock().then(r => r.data), enabled: tab === 'low-stock' })
  const { data: openPos, isLoading: ops } = useQuery({ queryKey: ['r-openpos'], queryFn: () => reports.openPos().then(r => r.data), enabled: tab === 'open-pos' })
  const { data: returnsData, isLoading: rts } = useQuery({ queryKey: ['r-returns', days], queryFn: () => reports.returnsReport(days).then(r => r.data), enabled: tab === 'returns' })

  const loading = dls || cls || pls || profls || cus || lss || ops || rts

  const DaysFilter = () => (
    <select className="select w-32" value={days} onChange={e => setDays(Number(e.target.value))}>
      <option value={7}>Last 7 days</option>
      <option value={30}>Last 30 days</option>
      <option value={60}>Last 60 days</option>
      <option value={90}>Last 90 days</option>
    </select>
  )

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Reports & Analytics</h1></div>
        <DaysFilter />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          )
        })}
      </div>

      {loading && <Loading />}

      {/* Daily Sales */}
      {tab === 'sales' && !dls && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Daily Revenue — Last {days} Days</span></div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailySales?.map((d: { day: string; total: number; orders: number }) => ({ ...d, day: format(parseISO(d.day), 'dd MMM') }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `£${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => [fmt.currency(v as number), 'Revenue']} />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="table-container border-0 border-t">
            <table>
              <thead><tr><th>Date</th><th>Orders</th><th>Revenue</th><th>Avg Order</th></tr></thead>
              <tbody>
                {dailySales?.slice().reverse().map((d: { day: string; orders: number; total: number; avg_order: number }) => (
                  <tr key={d.day}><td>{fmt.shortDate(d.day)}</td><td>{d.orders}</td><td>{fmt.currency(d.total)}</td><td>{fmt.currency(d.avg_order)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Channels */}
      {tab === 'channels' && !cls && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Channel Performance</span></div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={channels}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="channel" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `£${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => [fmt.currency(v as number), 'Revenue']} />
                <Bar dataKey="total" fill="#2563eb" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-container border-0 border-t">
            <table>
              <thead><tr><th>Channel</th><th>Orders</th><th>Revenue</th><th>Avg Order</th></tr></thead>
              <tbody>
                {channels?.map((c: { channel: string; orders: number; total: number; avg_order: number }) => (
                  <tr key={c.channel}><td className="capitalize font-medium">{c.channel}</td><td>{c.orders}</td><td>{fmt.currency(c.total)}</td><td>{fmt.currency(c.avg_order)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Products */}
      {tab === 'products' && !pls && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Product Performance — Top 100</span></div>
          <div className="table-container border-0">
            <table>
              <thead><tr><th>#</th><th>SKU</th><th>Title</th><th>Orders</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
              <tbody>
                {prods?.map((p: { sku: string; title: string; order_count: number; qty_sold: number; revenue: number }, i: number) => (
                  <tr key={p.sku}><td className="text-gray-400 text-xs">{i+1}</td><td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.sku}</span></td><td className="max-w-xs truncate">{p.title}</td><td>{p.order_count}</td><td className="font-medium">{p.qty_sold}</td><td className="font-semibold">{fmt.currency(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profit */}
      {tab === 'profit' && !profls && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Profit by Order</span></div>
          <div className="table-container border-0">
            <table>
              <thead><tr><th>Order</th><th>Channel</th><th>Date</th><th>Revenue</th><th>Cost</th><th>Gross Profit</th><th>Margin</th></tr></thead>
              <tbody>
                {profit?.map((p: { order_number: string; channel: string; date: string; revenue: number; cost: number; gross_profit: number; margin_pct: number }) => (
                  <tr key={p.order_number}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.order_number}</span></td>
                    <td className="capitalize">{p.channel}</td>
                    <td className="text-xs text-gray-500">{fmt.shortDate(p.date)}</td>
                    <td>{fmt.currency(p.revenue)}</td>
                    <td>{fmt.currency(p.cost)}</td>
                    <td className={Number(p.gross_profit) > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{fmt.currency(p.gross_profit)}</td>
                    <td><span className={`text-xs font-bold ${Number(p.margin_pct) > 30 ? 'text-green-600' : Number(p.margin_pct) > 15 ? 'text-amber-600' : 'text-red-600'}`}>{fmt.pct(p.margin_pct)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customers */}
      {tab === 'customers' && !cus && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Top Customers by Spend</span></div>
          <div className="table-container border-0">
            <table>
              <thead><tr><th>#</th><th>Customer</th><th>Email</th><th>Orders</th><th>Total Spend</th><th>Avg Order</th></tr></thead>
              <tbody>
                {custSpend?.map((c: { customer: number; customer__company_name: string; customer__first_name: string; customer__last_name: string; customer__email: string; order_count: number; total_spend: number; avg_order: number }, i: number) => (
                  <tr key={c.customer}>
                    <td className="text-gray-400 text-xs">{i+1}</td>
                    <td className="font-medium">{c.customer__company_name || `${c.customer__first_name} ${c.customer__last_name}`}</td>
                    <td className="text-sm text-gray-500">{c.customer__email}</td>
                    <td>{c.order_count}</td>
                    <td className="font-semibold">{fmt.currency(c.total_spend)}</td>
                    <td>{fmt.currency(c.avg_order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low Stock */}
      {tab === 'low-stock' && !lss && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Low Stock Report</span></div>
          <div className="table-container border-0">
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th>Location</th><th>On Hand</th><th>Available</th><th>Threshold</th><th>Reorder Qty</th><th>Alert</th></tr></thead>
              <tbody>
                {lowStock?.map((s: { sku: string; title: string; location: string; qty_on_hand: number; qty_available: number; threshold: number; reorder_qty: number; is_low: boolean }) => (
                  <tr key={`${s.sku}-${s.location}`} className={s.is_low ? 'bg-red-50' : ''}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{s.sku}</span></td>
                    <td className="max-w-xs truncate">{s.title}</td>
                    <td>{s.location}</td>
                    <td>{s.qty_on_hand}</td>
                    <td className={s.is_low ? 'text-red-600 font-bold' : 'font-medium'}>{s.qty_available}</td>
                    <td>{s.threshold}</td>
                    <td>{s.reorder_qty}</td>
                    <td>{s.is_low && <span className="badge badge-red flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Low</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open POs */}
      {tab === 'open-pos' && !ops && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Open Purchase Orders</span></div>
          <div className="table-container border-0">
            <table>
              <thead><tr><th>PO Number</th><th>Supplier</th><th>Status</th><th>Order Date</th><th>Expected</th><th>Overdue</th><th>Value</th></tr></thead>
              <tbody>
                {openPos?.map((p: { po_number: string; supplier: string; status: string; order_date: string; expected_date: string; is_overdue: boolean; total_value: number }) => (
                  <tr key={p.po_number} className={p.is_overdue ? 'bg-red-50' : ''}>
                    <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p.po_number}</span></td>
                    <td className="font-medium">{p.supplier}</td>
                    <td><span className="badge badge-blue">{p.status}</span></td>
                    <td className="text-xs text-gray-500">{fmt.shortDate(p.order_date)}</td>
                    <td className={`text-xs ${p.is_overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{fmt.shortDate(p.expected_date)}</td>
                    <td>{p.is_overdue ? <span className="badge-red">Overdue</span> : <span className="badge-green">On Time</span>}</td>
                    <td className="font-medium">{fmt.currency(p.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Returns */}
      {tab === 'returns' && !rts && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Returns Summary</span></div>
          <div className="table-container border-0">
            <table>
              <thead><tr><th>Reason</th><th>Status</th><th>Resolution</th><th>Count</th><th>Total Refunded</th></tr></thead>
              <tbody>
                {returnsData?.map((r: { reason: string; status: string; resolution: string; count: number; total_refund: number }, i: number) => (
                  <tr key={i}>
                    <td className="capitalize">{r.reason?.replace(/_/g,' ') || '—'}</td>
                    <td>{r.status}</td>
                    <td>{r.resolution || '—'}</td>
                    <td className="font-semibold">{r.count}</td>
                    <td>{fmt.currency(r.total_refund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
