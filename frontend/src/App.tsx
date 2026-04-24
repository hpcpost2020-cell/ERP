import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ProductsPage from './pages/products/ProductsPage'
import InventoryPage from './pages/products/InventoryPage'
import SuppliersPage from './pages/suppliers/SuppliersPage'
import PurchasingPage from './pages/purchasing/PurchasingPage'
import PurchaseOrderDetailPage from './pages/purchasing/PurchaseOrderDetailPage'
import CustomersPage from './pages/customers/CustomersPage'
import SalesOrdersPage from './pages/sales/SalesOrdersPage'
import SalesOrderDetailPage from './pages/sales/SalesOrderDetailPage'
import ShippingPage from './pages/shipping/ShippingPage'
import InvoicingPage from './pages/invoicing/InvoicingPage'
import ReturnsPage from './pages/returns/ReturnsPage'
import ReportsPage from './pages/reports/ReportsPage'
import UsersPage from './pages/users/UsersPage'
import AuditPage from './pages/audit/AuditPage'
import Loading from './components/ui/Loading'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1 } } })

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading text="Authenticating..." />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <Loading text="Loading..." />
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="purchasing" element={<PurchasingPage />} />
        <Route path="purchasing/:id" element={<PurchaseOrderDetailPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="sales" element={<SalesOrdersPage />} />
        <Route path="sales/:id" element={<SalesOrderDetailPage />} />
        <Route path="shipping" element={<ShippingPage />} />
        <Route path="invoicing" element={<InvoicingPage />} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
