import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { suppliers as suppliersApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { X } from 'lucide-react'

interface Props { id?: number; onClose: () => void }

const empty = {
  code: '', name: '', contact_name: '', email: '', phone: '', website: '',
  address_line1: '', address_line2: '', city: '', county: '', postcode: '', country: 'GB',
  payment_terms: 'net30', lead_time_days: '7', credit_limit: '', currency: 'GBP',
  notes: '', status: 'active',
}

export default function SupplierFormModal({ id, onClose }: Props) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = !!id
  const [form, setForm] = useState<Record<string, string>>({ ...empty })
  const [error, setError] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => suppliersApi.get(id!).then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) setForm({
      code: existing.code || '',
      name: existing.name || '',
      contact_name: existing.contact_name || '',
      email: existing.email || '',
      phone: existing.phone || '',
      website: existing.website || '',
      address_line1: existing.address_line1 || '',
      address_line2: existing.address_line2 || '',
      city: existing.city || '',
      county: existing.county || '',
      postcode: existing.postcode || '',
      country: existing.country || 'GB',
      payment_terms: existing.payment_terms || 'net_30',
      lead_time_days: String(existing.lead_time_days || '7'),
      credit_limit: String(existing.credit_limit || ''),
      currency: existing.currency || 'GBP',
      notes: existing.notes || '',
      status: existing.status || 'active',
    })
  }, [existing])

  const save = useMutation({
    mutationFn: (data: Record<string, string>) =>
      isEdit ? suppliersApi.update(id!, data) : suppliersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['supplier', id] })
      toast(isEdit ? 'Supplier updated' : 'Supplier created', 'success')
      onClose()
    },
    onError: () => setError('Failed to save. Check required fields.'),
  })

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-2xl">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Supplier' : 'New Supplier'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); setError(''); save.mutate(form) }}>
          <div className="modal-body space-y-4">
            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
            <div className="form-row">
              <div><label className="label">Supplier Code *</label><input name="code" value={form.code} onChange={set} className="input" required /></div>
              <div><label className="label">Status</label>
                <select name="status" value={form.status} onChange={set} className="select">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>
            </div>
            <div><label className="label">Company Name *</label><input name="name" value={form.name} onChange={set} className="input" required /></div>
            <div className="form-row">
              <div><label className="label">Contact Name</label><input name="contact_name" value={form.contact_name} onChange={set} className="input" /></div>
              <div><label className="label">Email</label><input name="email" value={form.email} onChange={set} className="input" type="email" /></div>
            </div>
            <div className="form-row">
              <div><label className="label">Phone</label><input name="phone" value={form.phone} onChange={set} className="input" /></div>
              <div><label className="label">Website</label><input name="website" value={form.website} onChange={set} className="input" type="url" /></div>
            </div>
            <div><label className="label">Address Line 1</label><input name="address_line1" value={form.address_line1} onChange={set} className="input" /></div>
            <div><label className="label">Address Line 2</label><input name="address_line2" value={form.address_line2} onChange={set} className="input" /></div>
            <div className="form-row">
              <div><label className="label">City</label><input name="city" value={form.city} onChange={set} className="input" /></div>
              <div><label className="label">Postcode</label><input name="postcode" value={form.postcode} onChange={set} className="input" /></div>
            </div>
            <div className="form-row">
              <div><label className="label">Payment Terms</label>
                <select name="payment_terms" value={form.payment_terms} onChange={set} className="select">
                  <option value="immediate">Immediate / Proforma</option>
                  <option value="net7">Net 7 Days</option>
                  <option value="net14">Net 14 Days</option>
                  <option value="net30">Net 30 Days</option>
                  <option value="net60">Net 60 Days</option>
                  <option value="net90">Net 90 Days</option>
                  <option value="eom">End of Month</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div><label className="label">Lead Time (days)</label><input name="lead_time_days" value={form.lead_time_days} onChange={set} className="input" type="number" min="0" /></div>
            </div>
            <div className="form-row">
              <div><label className="label">Credit Limit (£)</label><input name="credit_limit" value={form.credit_limit} onChange={set} className="input" type="number" step="0.01" /></div>
              <div><label className="label">Currency</label>
                <select name="currency" value={form.currency} onChange={set} className="select">
                  <option value="GBP">GBP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div><label className="label">Notes</label><textarea name="notes" value={form.notes} onChange={set} className="input" rows={3} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save Supplier'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
