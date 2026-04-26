import api from './client'

export const auth = {
  login: (username: string, password: string) =>
    api.post('/auth/login/', { username, password }),
  logout: (refresh: string) =>
    api.post('/auth/logout/', { refresh }),
  me: () => api.get('/users/me/'),
}

export const dashboard = {
  get: () => api.get('/reports/dashboard/'),
}

export const products = {
  list: (params?: Record<string, unknown>) => api.get('/products/', { params }),
  get: (id: number) => api.get(`/products/${id}/`),
  create: (data: unknown) => api.post('/products/', data),
  update: (id: number, data: unknown) => api.patch(`/products/${id}/`, data),
  delete: (id: number) => api.delete(`/products/${id}/`),
  stock: (id: number) => api.get(`/products/${id}/stock/`),
  movements: (id: number) => api.get(`/products/${id}/movements/`),
  lowStock: () => api.get('/products/low-stock/'),
  categories: () => api.get('/products/categories/'),
  locations: () => api.get('/products/locations/'),
  stockMovements: (params?: Record<string, unknown>) => api.get('/products/stock-movements/', { params }),
  adjust: (data: unknown) => api.post('/products/stock-movements/adjust/', data),
}

export const suppliers = {
  list: (params?: Record<string, unknown>) => api.get('/suppliers/', { params }),
  get: (id: number) => api.get(`/suppliers/${id}/`),
  create: (data: unknown) => api.post('/suppliers/', data),
  update: (id: number, data: unknown) => api.patch(`/suppliers/${id}/`, data),
  orders: (id: number) => api.get(`/suppliers/${id}/orders/`),
  issues: (id: number) => api.get(`/suppliers/${id}/issues/`),
}

export const purchasing = {
  list: (params?: Record<string, unknown>) => api.get('/purchasing/', { params }),
  get: (id: number) => api.get(`/purchasing/${id}/`),
  create: (data: unknown) => api.post('/purchasing/', data),
  update: (id: number, data: unknown) => api.patch(`/purchasing/${id}/`, data),
  send: (id: number) => api.post(`/purchasing/${id}/send/`),
  receive: (id: number, data: unknown) => api.post(`/purchasing/${id}/receive/`, data),
  cancel: (id: number) => api.post(`/purchasing/${id}/cancel/`),
  creditNotes: (params?: Record<string, unknown>) => api.get('/purchasing/credit-notes/', { params }),
}

export const customers = {
  list: (params?: Record<string, unknown>) => api.get('/customers/', { params }),
  get: (id: number) => api.get(`/customers/${id}/`),
  create: (data: unknown) => api.post('/customers/', data),
  update: (id: number, data: unknown) => api.patch(`/customers/${id}/`, data),
  orders: (id: number) => api.get(`/customers/${id}/orders/`),
  invoices: (id: number) => api.get(`/customers/${id}/invoices/`),
  notes: (params?: Record<string, unknown>) => api.get('/customers/notes/', { params }),
  addNote: (data: unknown) => api.post('/customers/notes/', data),
  addresses: (customerId: number) => api.get('/customers/addresses/', { params: { customer: customerId } }),
  addAddress: (data: unknown) => api.post('/customers/addresses/', data),
  updateAddress: (id: number, data: unknown) => api.patch(`/customers/addresses/${id}/`, data),
  deleteAddress: (id: number) => api.delete(`/customers/addresses/${id}/`),
}

export const sales = {
  list: (params?: Record<string, unknown>) => api.get('/sales/', { params }),
  get: (id: number) => api.get(`/sales/${id}/`),
  create: (data: unknown) => api.post('/sales/', data),
  update: (id: number, data: unknown) => api.patch(`/sales/${id}/`, data),
  dispatch: (id: number, data: unknown) => api.post(`/sales/${id}/dispatch/`, data),
  cancel: (id: number) => api.post(`/sales/${id}/cancel/`),
  updatePayment: (id: number, data: unknown) => api.post(`/sales/${id}/update-payment/`, data),
  addNote: (id: number, data: unknown) => api.post(`/sales/${id}/add-note/`, data),
}

export const shipping = {
  list: (params?: Record<string, unknown>) => api.get('/shipping/', { params }),
  get: (id: number) => api.get(`/shipping/${id}/`),
  create: (data: unknown) => api.post('/shipping/', data),
  markDelivered: (id: number) => api.post(`/shipping/${id}/mark-delivered/`),
  reportIssue: (id: number, data: unknown) => api.post(`/shipping/${id}/report-issue/`, data),
  issues: (params?: Record<string, unknown>) => api.get('/shipping/issues/', { params }),
}

export const invoicing = {
  list: (params?: Record<string, unknown>) => api.get('/invoicing/', { params }),
  get: (id: number) => api.get(`/invoicing/${id}/`),
  create: (data: unknown) => api.post('/invoicing/', data),
  update: (id: number, data: unknown) => api.patch(`/invoicing/${id}/`, data),
  downloadPdf: (id: number) => api.get(`/invoicing/${id}/pdf/`, { responseType: 'blob' }),
  recordPayment: (id: number, data: unknown) => api.post(`/invoicing/${id}/record-payment/`, data),
  createFromOrder: (orderId: number) => api.post('/invoicing/create-from-order/', { order_id: orderId }),
}

export const returns = {
  list: (params?: Record<string, unknown>) => api.get('/returns/', { params }),
  get: (id: number) => api.get(`/returns/${id}/`),
  create: (data: unknown) => api.post('/returns/', data),
  update: (id: number, data: unknown) => api.patch(`/returns/${id}/`, data),
  approve: (id: number) => api.post(`/returns/${id}/approve/`),
  markReceived: (id: number) => api.post(`/returns/${id}/mark-received/`),
  processRefund: (id: number, data: unknown) => api.post(`/returns/${id}/process-refund/`, data),
}

export const reports = {
  dailySales: (days?: number) => api.get('/reports/daily-sales/', { params: { days } }),
  channelPerformance: (days?: number) => api.get('/reports/channel-performance/', { params: { days } }),
  productPerformance: (days?: number) => api.get('/reports/product-performance/', { params: { days } }),
  customerSpend: () => api.get('/reports/customer-spend/'),
  profit: (days?: number) => api.get('/reports/profit/', { params: { days } }),
  lowStock: () => api.get('/reports/low-stock/'),
  openPos: () => api.get('/reports/open-pos/'),
  returnsReport: (days?: number) => api.get('/reports/returns/', { params: { days } }),
}

export const auditLog = {
  list: (params?: Record<string, unknown>) => api.get('/audit/', { params }),
}

export const channels = {
  list: () => api.get('/channels/'),
  create: (data: unknown) => api.post('/channels/', data),
  update: (id: number, data: unknown) => api.patch(`/channels/${id}/`, data),
  sync: (id: number) => api.post(`/channels/${id}/sync/`),
}

export const users = {
  list: (params?: Record<string, unknown>) => api.get('/users/', { params }),
  get: (id: number) => api.get(`/users/${id}/`),
  create: (data: unknown) => api.post('/users/', data),
  update: (id: number, data: unknown) => api.patch(`/users/${id}/`, data),
  changePassword: (id: number, data: unknown) => api.post(`/users/${id}/change-password/`, data),
  activate: (id: number) => api.post(`/users/${id}/activate/`),
  deactivate: (id: number) => api.post(`/users/${id}/deactivate/`),
}

export const settings = {
  list: (params?: Record<string, unknown>) => api.get('/settings/', { params }),
  get: (key: string) => api.get(`/settings/${key}/`),
  create: (data: unknown) => api.post('/settings/', data),
  update: (key: string, data: unknown) => api.patch(`/settings/${key}/`, data),
  bulk: (data: Record<string, unknown>) => api.post('/settings/bulk/', { settings: data }),
  byPrefix: (prefix: string) => api.get('/settings/by-prefix/', { params: { prefix } }),
}

export const tasks = {
  list: (params?: Record<string, unknown>) => api.get('/tasks/', { params }),
  get: (id: number) => api.get(`/tasks/${id}/`),
  create: (data: unknown) => api.post('/tasks/', data),
  update: (id: number, data: unknown) => api.patch(`/tasks/${id}/`, data),
  delete: (id: number) => api.delete(`/tasks/${id}/`),
  complete: (id: number) => api.post(`/tasks/${id}/complete/`),
  assign: (id: number, data: unknown) => api.post(`/tasks/${id}/assign/`, data),
  myTasks: () => api.get('/tasks/my-tasks/'),
  overdue: () => api.get('/tasks/overdue/'),
}

export const globalSearch = {
  search: (q: string, types?: string) => api.get('/settings/search/', { params: { q, types } }),
}
