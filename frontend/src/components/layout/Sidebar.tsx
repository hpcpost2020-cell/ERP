import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building2,
  BarChart3, FileText, RotateCcw, Ship, Settings, BookOpen, Layers,
  LogOut, CheckSquare, Sliders
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const nav = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { divider: 'Operations' },
  { label: 'Sales Orders', to: '/sales', icon: ShoppingCart },
  { label: 'Purchase Orders', to: '/purchasing', icon: Truck },
  { label: 'Shipping', to: '/shipping', icon: Ship },
  { label: 'Returns', to: '/returns', icon: RotateCcw },
  { divider: 'Catalogue' },
  { label: 'Products', to: '/products', icon: Package },
  { label: 'Inventory', to: '/inventory', icon: Layers },
  { divider: 'Accounts' },
  { label: 'Customers', to: '/customers', icon: Users },
  { label: 'Suppliers', to: '/suppliers', icon: Building2 },
  { label: 'Invoices', to: '/invoicing', icon: FileText },
  { divider: 'Analytics' },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { divider: 'System' },
  { label: 'Tasks', to: '/tasks', icon: CheckSquare },
  { label: 'Users', to: '/users', icon: Settings },
  { label: 'Settings', to: '/settings', icon: Sliders },
  { label: 'Audit Log', to: '/audit', icon: BookOpen },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-gray-200 flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-700 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight">ERP System</div>
            <div className="text-xs text-gray-400">Operations Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map((item, i) => {
          if ('divider' in item) {
            return <div key={i} className="pt-3 pb-1 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{item.divider}</div>
          }
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-800 truncate">{user?.full_name}</div>
            <div className="text-xs text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</div>
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
