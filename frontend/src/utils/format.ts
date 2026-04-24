export const fmt = {
  currency: (v: number | string, symbol = '£') => `${symbol}${Number(v).toFixed(2)}`,
  number: (v: number | string) => Number(v).toLocaleString('en-GB'),
  pct: (v: number | string) => `${Number(v).toFixed(1)}%`,
  date: (v: string | null) => v ? new Date(v).toLocaleDateString('en-GB') : '—',
  datetime: (v: string | null) => v ? new Date(v).toLocaleString('en-GB') : '—',
  shortDate: (v: string | null) => {
    if (!v) return '—'
    const d = new Date(v)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  },
}

export const statusColors: Record<string, string> = {
  // Order statuses
  pending: 'badge-yellow', confirmed: 'badge-blue', processing: 'badge-blue',
  awaiting_dispatch: 'badge-orange', dispatched: 'badge-purple',
  delivered: 'badge-green', completed: 'badge-green', cancelled: 'badge-red',
  on_hold: 'badge-yellow', refunded: 'badge-red',
  // Payment
  paid: 'badge-green', unpaid: 'badge-red', partial: 'badge-yellow', disputed: 'badge-red',
  // PO statuses
  draft: 'badge-gray', sent: 'badge-blue', acknowledged: 'badge-blue',
  part_received: 'badge-yellow', received: 'badge-green', closed: 'badge-gray',
  // General
  active: 'badge-green', inactive: 'badge-gray', on_hold_status: 'badge-yellow',
  // Invoice
  issued: 'badge-blue', overdue: 'badge-red', void: 'badge-gray', credit: 'badge-purple',
  // Returns
  requested: 'badge-yellow', approved: 'badge-blue', awaiting_return: 'badge-blue',
  inspected: 'badge-purple', refunded_status: 'badge-green', rejected: 'badge-red',
}

export const statusLabel: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', processing: 'Processing',
  awaiting_dispatch: 'Awaiting Dispatch', dispatched: 'Dispatched',
  delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
  on_hold: 'On Hold', refunded: 'Refunded',
  paid: 'Paid', unpaid: 'Unpaid', partial: 'Part Paid', disputed: 'Disputed',
  draft: 'Draft', sent: 'Sent', acknowledged: 'Acknowledged',
  part_received: 'Part Received', received: 'Received', closed: 'Closed',
  active: 'Active', inactive: 'Inactive',
  issued: 'Issued', overdue: 'Overdue', void: 'Void', credit: 'Credit Note',
  requested: 'Requested', approved: 'Approved',
  ebay: 'eBay', amazon: 'Amazon', woocommerce: 'WooCommerce',
  direct: 'Direct', wholesale: 'Wholesale', phone: 'Phone',
}
