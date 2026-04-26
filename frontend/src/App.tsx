import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ProductsPage from './pages/products/ProductsPage'
import ProductDetailPage from './pages/products/ProductDetailPage'
import InventoryPage from './pages/products/InventoryPage'
import SuppliersPage from './pages/suppliers/SuppliersPage'
import SupplierDetailPage from './pages/suppliers/SupplierDetailPage'
import PurchasingPage from './pages/purchasing/PurchasingPage'
import PurchaseOrderDetailPage from './pages/purchasing/PurchaseOrderDetailPage'
import PurchaseOrderFormPage from './pages/purchasing/PurchaseOrderFormPage'
import CustomersPage from './pages/customers/CustomersPage'
import CustomerDetailPage from './pages/customers/CustomerDetailPage'
import SalesOrdersPage from './pages/sales/SalesOrdersPage'
import SalesOrderDetailPage from './pages/sales/SalesOrderDetailPage'
import SalesOrderFormPage from './pages/sales/SalesOrderFormPage'
import ShippingPage from './pages/shipping/ShippingPage'
import InvoicingPage from './pages/invoicing/InvoicingPage'
import InvoiceDetailPage from './pages/invoicing/InvoiceDetailPage'
import ReturnsPage from './pages/returns/ReturnsPage'
import ReportsPage from './pages/reports/ReportsPage'
import UsersPage from './pages/users/UsersPage'
import AuditPage from './pages/audit/AuditPage'
import SettingsPage from './pages/settings/SettingsPage'
import TasksPage from './pages/tasks/TasksPage'
import LocationsPage from './pages/wms/LocationsPage'
import StockByLocationPage from './pages/wms/StockByLocationPage'
import StockTransferPage from './pages/wms/StockTransferPage'
import GoodsInPage from './pages/wms/GoodsInPage'
import GoodsReceiptDetailPage from './pages/wms/GoodsReceiptDetailPage'
import QcItemPage from './pages/wms/QcItemPage'
import PutAwayPage from './pages/wms/PutAwayPage'
import PickingPage from './pages/wms/PickingPage'
import Loading from './components/ui/Loading'
import MobileHome from './pages/mobile/wms/MobileHome'
import MobileScanProduct from './pages/mobile/wms/MobileScanProduct'
import MobilePutAway from './pages/mobile/wms/MobilePutAway'
import MobilePicking from './pages/mobile/wms/MobilePicking'
import MobileStockCount from './pages/mobile/wms/MobileStockCount'
import MobileTransfer from './pages/mobile/wms/MobileTransfer'
import MobileQC from './pages/mobile/wms/MobileQC'
import MobileDispatch from './pages/mobile/wms/MobileDispatch'

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
      {/* Mobile scanner routes — no sidebar layout */}
      <Route path="/mobile" element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
        <Route path="wms" element={<MobileHome />} />
        <Route path="wms/scan" element={<MobileScanProduct />} />
        <Route path="wms/putaway" element={<MobilePutAway />} />
        <Route path="wms/picking" element={<MobilePicking />} />
        <Route path="wms/count" element={<MobileStockCount />} />
        <Route path="wms/transfer" element={<MobileTransfer />} />
        <Route path="wms/qc" element={<MobileQC />} />
        <Route path="wms/dispatch" element={<MobileDispatch />} />
      </Route>
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/:id" element={<SupplierDetailPage />} />
        <Route path="purchasing" element={<PurchasingPage />} />
        <Route path="purchasing/new" element={<PurchaseOrderFormPage />} />
        <Route path="purchasing/:id" element={<PurchaseOrderDetailPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="sales" element={<SalesOrdersPage />} />
        <Route path="sales/new" element={<SalesOrderFormPage />} />
        <Route path="sales/:id" element={<SalesOrderDetailPage />} />
        <Route path="shipping" element={<ShippingPage />} />
        <Route path="invoicing" element={<InvoicingPage />} />
        <Route path="invoicing/:id" element={<InvoiceDetailPage />} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="wms/locations" element={<LocationsPage />} />
        <Route path="wms/stock" element={<StockByLocationPage />} />
        <Route path="wms/transfer" element={<StockTransferPage />} />
        <Route path="wms/goods-in" element={<GoodsInPage />} />
        <Route path="wms/goods-in/:id" element={<QcItemPage />} />
        <Route path="wms/receipts/:id" element={<GoodsReceiptDetailPage />} />
        <Route path="wms/putaway" element={<PutAwayPage />} />
        <Route path="wms/picking" element={<PickingPage />} />
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
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
