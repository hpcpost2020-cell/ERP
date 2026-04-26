import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customers as customersApi } from '../../api/endpoints'
import { fmt } from '../../utils/format'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { useToast } from '../../components/ui/Toast'
import CustomerFormModal from './CustomerFormModal'
import { ArrowLeft, Edit, ShoppingCart, MessageSquare, Star, MapPin, Plus, Trash2, X } from 'lucide-react'

type Tab = 'overview' | 'orders' | 'notes' | 'addresses'

interface Address {
  id: number
  address_type: string
  is_default: boolean
  address_line1: string
  address_line2: string
  city: string
  county: string
  postcode: string
  country: string
}

function AddressForm({ custId, addr, onDone }: { custId: number; addr?: Address; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    address_type: addr?.address_type || 'billing',
    is_default: addr?.is_default || false,
    address_line1: addr?.address_line1 || '',
    address_line2: addr?.address_line2 || '',
    city: addr?.city || '',
    county: addr?.county || '',
    postcode: addr?.postcode || '',
    country: addr?.country || 'GB',
  })

  const save = useMutation({
    mutationFn: () => addr
      ? customersApi.updateAddress(addr.id, { ...form, customer: custId })
      : customersApi.addAddress({ ...form, customer: custId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-addresses', custId] })
      toast(addr ? 'Address updated' : 'Address added', 'success')
      onDone()
    },
    onError: () => toast('Failed to save address', 'error'),
  })

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }))
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{addr ? 'Edit Address' : 'New Address'}</h4>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="address_type" value={form.address_type} onChange={set} className="select">
            <option value="billing">Billing</option>
            <option value="shipping">Shipping</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" name="is_default" checked={form.is_default}
              onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} className="rounded" />
            Set as default
          </label>
        </div>
      </div>
      <div><label className="label">Address Line 1</label><input name="address_line1" value={form.address_line1} onChange={set} className="input" /></div>
      <div><label className="label">Address Line 2</label><input name="address_line2" value={form.address_line2} onChange={set} className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">City</label><input name="city" value={form.city} onChange={set} className="input" /></div>
        <div><label className="label">County</label><input name="county" value={form.county} onChange={set} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Postcode</label><input name="postcode" value={form.postcode} onChange={set} className="input" /></div>
        <div><label className="label">Country</label><input name="country" value={form.country} onChange={set} className="input" /></div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
        <button type="button" onClick={() => save.mutate()} className="btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save Address'}
        </button>
      </div>
    </div>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const custId = Number(id)
  const [tab, setTab] = useState<Tab>('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [note, setNote] = useState('')
  const [noteImportant, setNoteImportant] = useState(false)
  const [showAddAddr, setShowAddAddr] = useState(false)
  const [editAddrId, setEditAddrId] = useState<number | null>(null)

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', custId],
    queryFn: () => customersApi.get(custId).then(r => r.data),
  })

  const { data: orders } = useQuery({
    queryKey: ['customer-orders', custId],
    queryFn: () => customersApi.orders(custId).then(r => r.data),
    enabled: tab === 'orders',
  })

  const { data: addresses } = useQuery({
    queryKey: ['customer-addresses', custId],
    queryFn: () => customersApi.addresses(custId).then(r => r.data),
    enabled: tab === 'addresses',
  })

  const addNoteMut = useMutation({
    mutationFn: (content: string) =>
      customersApi.addNote({ customer: custId, content, is_important: noteImportant }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', custId] })
      setNote(''); setNoteImportant(false)
      toast('Note added', 'success')
    },
    onError: () => toast('Failed to add note', 'error'),
  })

  const deleteAddr = useMutation({
    mutationFn: (addrId: number) => customersApi.deleteAddress(addrId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-addresses', custId] })
      toast('Address deleted', 'success')
    },
    onError: () => toast('Failed to delete address', 'error'),
  })

  if (isLoading) return <Loading />
  if (!customer) return <div className="text-red-500 p-8">Customer not found</div>

  const addrList: Address[] = Array.isArray(addresses) ? addresses : addresses?.results || []

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: Edit },
    { key: 'orders', label: 'Orders', icon: ShoppingCart },
    { key: 'addresses', label: 'Addresses', icon: MapPin },
    { key: 'notes', label: `Notes (${customer.customer_notes?.length || 0})`, icon: MessageSquare },
  ]

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/customers')} className="btn btn-secondary btn-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="page-title">{customer.display_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={customer.status} />
              <span className="badge badge-blue capitalize">{customer.customer_type}</span>
              <span className="text-sm text-gray-500 font-mono">{customer.customer_number}</span>
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowEdit(true)}><Edit className="w-4 h-4" /> Edit Customer</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card card-body text-center">
          <div className="text-2xl font-bold text-brand-700">{customer.total_orders || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Total Orders</div>
        </div>
        <div className="card card-body text-center">
          <div className="text-2xl font-bold text-brand-700">{fmt.currency(customer.total_spend || 0)}</div>
          <div className="text-xs text-gray-500 mt-1">Total Spend</div>
        </div>
        <div className="card card-body text-center">
          <div className="text-2xl font-bold text-brand-700">{fmt.currency(customer.avg_order_value || 0)}</div>
          <div className="text-xs text-gray-500 mt-1">Avg Order Value</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Contact Information</h3>
            <div className="text-sm space-y-2">
              {customer.email && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Email</span><span>{customer.email}</span></div>}
              {customer.phone && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Phone</span><span>{customer.phone}</span></div>}
              {customer.mobile && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Mobile</span><span>{customer.mobile}</span></div>}
            </div>
          </div>
          <div className="card card-body space-y-3">
            <h3 className="font-semibold">Account Details</h3>
            <div className="text-sm space-y-2">
              <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Payment Terms</span><span className="capitalize">{customer.payment_terms?.replace(/_/g, ' ')}</span></div>
              {customer.credit_limit && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Credit Limit</span><span>{fmt.currency(customer.credit_limit)}</span></div>}
              {customer.vat_number && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">VAT Number</span><span>{customer.vat_number}</span></div>}
              {customer.source && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Source</span><span className="capitalize">{customer.source}</span></div>}
              <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Created</span><span>{fmt.shortDate(customer.created_at)}</span></div>
            </div>
          </div>
          {customer.notes && (
            <div className="card card-body lg:col-span-2">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{customer.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Order History</span></div>
          {!orders?.length ? (
            <div className="p-8 text-center text-gray-400">No orders yet</div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>Order #</th><th>Date</th><th>Status</th><th>Payment</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {(Array.isArray(orders) ? orders : orders?.results || [])?.map((o: { id: number; order_number: string; created_at: string; status: string; payment_status: string; total_value: number }) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/sales/${o.id}`)}>
                      <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{o.order_number}</span></td>
                      <td className="text-gray-500 text-xs">{fmt.shortDate(o.created_at)}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td><StatusBadge status={o.payment_status} /></td>
                      <td className="font-semibold">{fmt.currency(o.total_value)}</td>
                      <td><button className="btn btn-secondary btn-sm">View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Addresses</h3>
            {!showAddAddr && editAddrId === null && (
              <button className="btn-primary btn-sm" onClick={() => setShowAddAddr(true)}>
                <Plus className="w-4 h-4" /> Add Address
              </button>
            )}
          </div>
          {showAddAddr && (
            <AddressForm custId={custId} onDone={() => setShowAddAddr(false)} />
          )}
          {addrList.length === 0 && !showAddAddr && (
            <div className="card p-8 text-center text-gray-400">No addresses saved</div>
          )}
          {addrList.map((a: Address) => (
            editAddrId === a.id ? (
              <AddressForm key={a.id} custId={custId} addr={a} onDone={() => setEditAddrId(null)} />
            ) : (
              <div key={a.id} className="card card-body">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge badge-blue capitalize">{a.address_type}</span>
                      {a.is_default && <span className="badge badge-green text-xs">Default</span>}
                    </div>
                    <div className="text-sm text-gray-700 space-y-0.5">
                      <div>{a.address_line1}</div>
                      {a.address_line2 && <div>{a.address_line2}</div>}
                      <div>{a.city}{a.county ? `, ${a.county}` : ''}</div>
                      <div>{a.postcode} {a.country}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddAddr(false); setEditAddrId(a.id) }}>
                      <Edit className="w-3 h-3" /> Edit
                    </button>
                    <button className="btn btn-secondary btn-sm text-red-600 hover:bg-red-50"
                      onClick={() => window.confirm('Delete this address?') && deleteAddr.mutate(a.id)}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card">
          <div className="card-header"><span className="font-semibold">Notes</span></div>
          <div className="p-4 space-y-3">
            {customer.customer_notes?.length === 0 && <div className="text-gray-400 text-sm text-center py-4">No notes yet</div>}
            {customer.customer_notes?.map((n: { id: number; content: string; is_important: boolean; created_by_name: string; created_at: string }) => (
              <div key={n.id} className={`p-3 rounded-lg text-sm border ${n.is_important ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1 text-xs text-gray-500">
                  {n.is_important && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  <span>{n.created_by_name}</span>
                  <span>·</span>
                  <span>{fmt.datetime(n.created_at)}</span>
                </div>
                {n.content}
              </div>
            ))}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <textarea className="input w-full text-sm" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note..." />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={noteImportant} onChange={e => setNoteImportant(e.target.checked)} className="rounded" />
                  Mark as important
                </label>
                <button className="btn-primary" onClick={() => note.trim() && addNoteMut.mutate(note)} disabled={!note.trim() || addNoteMut.isPending}>
                  {addNoteMut.isPending ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && <CustomerFormModal id={custId} onClose={() => setShowEdit(false)} />}
    </div>
  )
}
