// @ts-nocheck
import { useQuery } from '@tanstack/react-query'
import { dashboard } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import {
  TrendingUp, ShoppingCart, AlertTriangle, Truck, RotateCcw,
  PackageX, Package, Clock, DollarSign, BarChart2, Activity
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { format, parseISO } from 'date-fns'

const CHANNEL_COLORS: Record<string, string> = {
  ebay: '#e53e3e', amazon: '#f6ad55', woocommerce: '#68d391',
  direct: '#63b3ed', wholesale: '#a78bfa', phone: '#fc8181'
}
const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

function StatCard({ label, value, sub, icon: Icon, color = 'blue', trend }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple'; trend?: string
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700', green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700'
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value mt-1">{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
          {trend && <div className="stat-delta-pos mt-1">{trend}</div>}
        </div>
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => dashboard.get().then(r => r.data), refetchInterval: 60000 })

  if (isLoading) return <Loading text="Loading dashboard..." />
  if (!data) return null

  const channelChartData = (data.sales_by_channel || []).map((c: { channel: string; total: number; count: number }) => ({
    name: c.channel.charAt(0).toUpperCase() + c.channel.slice(1),
    value: c.total, orders: c.count
  }))

  const dailyData = (data.daily_trend || []).map((d: { day: string; total: number; count: number }) => ({
    day: format(parseISO(d.day), 'dd MMM'),
    sales: d.total, orders: d.count
  }))

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Live operational overview — {fmt.shortDate(new Date().toISOString())}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">Live</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today's Sales" value={fmt.currency(data.today_sales)} sub={`${data.today_orders} orders`} icon={TrendingUp} color="blue" />
        <StatCard label="Yesterday" value={fmt.currency(data.yesterday_sales)} sub={`${data.yesterday_orders} orders`} icon={BarChart2} color="blue" />
        <StatCard label="This Week" value={fmt.currency(data.week_sales)} sub={`${data.week_orders} orders`} icon={Activity} color="green" />
        <StatCard label="This Month" value={fmt.currency(data.month_sales)} sub={`${data.month_orders} orders`} icon={DollarSign} color="green" />
      </div>

      {/* Operational KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open Orders" value={String(data.open_orders)} sub="Not completed" icon={ShoppingCart} color="blue" />
        <StatCard label="Awaiting Dispatch" value={String(data.awaiting_dispatch)} sub="Ready to ship" icon={Package} color="amber" />
        <StatCard label="Overdue POs" value={String(data.overdue_pos)} sub="Past expected date" icon={Truck} color={data.overdue_pos > 0 ? 'red' : 'green'} />
        <StatCard label="Open Returns" value={String(data.return_count)} sub="This month" icon={RotateCcw} color={data.return_count > 5 ? 'red' : 'amber'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Low Stock Items" value={String(data.low_stock_count)} sub="Below threshold" icon={AlertTriangle} color={data.low_stock_count > 0 ? 'red' : 'green'} />
        <StatCard label="Courier Issues" value={String(data.courier_issues)} sub="Open cases" icon={PackageX} color={data.courier_issues > 0 ? 'red' : 'green'} />
        <StatCard label="Gross Profit (Month)" value={fmt.currency(data.gross_profit_month)} sub={`Margin: ${fmt.pct(data.margin_pct_month)}`} icon={TrendingUp} color="purple" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-800">Revenue — Last 14 Days</h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `£${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmt.currency(v), 'Revenue']} />
                <Area type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-800">Sales by Channel</h3></div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={channelChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {channelChartData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [fmt.currency(v), 'Revenue']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Sellers */}
        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-800">Best Selling Products (Month)</h3></div>
          <div className="p-4">
            {data.best_sellers?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No sales data yet</p>}
            <div className="space-y-2">
              {data.best_sellers?.slice(0, 8).map((p: { sku: string; title: string; qty_sold: number; revenue: number }, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">{p.title}</div>
                    <div className="text-xs text-gray-400">{p.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-gray-800">{p.qty_sold} sold</div>
                    <div className="text-xs text-gray-500">{fmt.currency(p.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Low Stock */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-800">Low Stock Alerts</h3>
            {data.low_stock_count > 0 && <span className="badge-red">{data.low_stock_count} items</span>}
          </div>
          <div className="p-4">
            {data.low_stock_alerts?.length === 0 && <p className="text-sm text-green-600 text-center py-4">✓ All stock levels healthy</p>}
            <div className="space-y-2">
              {data.low_stock_alerts?.slice(0, 8).map((s: { sku: string; title: string; qty_available: number; threshold: number; location: string }, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${s.qty_available === 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">{s.title}</div>
                    <div className="text-xs text-gray-400">{s.sku} · {s.location}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${s.qty_available === 0 ? 'text-red-600' : 'text-amber-600'}`}>{s.qty_available}</div>
                    <div className="text-xs text-gray-400">min {s.threshold}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
