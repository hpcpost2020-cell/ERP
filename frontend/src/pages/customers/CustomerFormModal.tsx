import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customers as customersApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { X } from 'lucide-react'

interface Props { id?: number; onClose: () => void }

const empty = {
  company_name: '', first_name: '', last_name: '', email: '', phone: '', mobile: '',
  customer_type: 'retail', status: 'active', payment_terms: 'prepay',
  credit_limit: '', vat_number: '', notes: '', source: '',
}

export default function CustomerFormModal({ id, onClose }: Props) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = !!id
  const [form, setForm] = useState<Record<string, string>>({ ...empty })
  const [error, setError] = useState('')

  const { data: existing } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id!).then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) setForm({
      company_name: existing.company_name || '',
      first_name: existing.first_name || '',
      last_name: existing.last_name || '',
      email: existing.email || '',
      phone: existing.phone || '',
      mobile: existing.mobile || '',
      customer_type: existing.customer_type || 'retail',
      status: existing.status || 'active',
      payment_terms: existing.payment_terms || 'prepay',
      credit_limit: String(existing.credit_limit || ''),
      vat_number: existing.vat_number || '',
      notes: existing.notes || '',
      source: existing.source || '',
    })
  }, [existing])

  const save = useMutation({
    mutationFn: (data: Record<string, string>) =>
      isEdit ? customersApi.update(id!, data) : customersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      if (isEdit) qc.invalidateQueries({ queryKey: ['customer', id] })
      toast(isEdit ? 'Customer updated' : 'Customer created', 'success')
      onClose()
    },
    onError: () => { setError('Failed to save. Check required fields.') },
  })

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-2xl">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); setError(''); save.mutate(form) }}>
          <div className="modal-body space-y-4">
            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
            <div className="form-row">
              <div><label className="label">First Name</label><input name="first_name" value={form.first_name} onChange={set} className="input" /></div>
              <div><label className="label">Last Name</label><input name="last_name" value={form.last_name} onChange={set} className="input" /></div>
            </div>
            <div><label className="label">Company Name</label><input name="company_name" value={form.company_name} onChange={set} className="input" /></div>
            <div className="form-row">
              <div><label className="label">Email *</label><input name="email" value={form.email} onChange={set} className="input" type="email" required /></div>
              <div><label className="label">Phone</label><input name="phone" value={form.phone} onChange={set} className="input" /></div>
            </div>
            <div className="form-row">
              <div><label className="label">Mobile</label><input name="mobile" value={form.mobile} onChange={set} className="input" /></div>
              <div><label className="label">Type</label>
                <select name="customer_type" value={form.customer_type} onChange={set} className="select">
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="marketplace">Marketplace</option>
                  <option value="trade">Trade</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div><label className="label">Status</label>
                <select name="status" value={form.status} onChange={set} className="select">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>
              <div><label className="label">Payment Terms</label>
                <select name="payment_terms" value={form.payment_terms} onChange={set} className="select">
                  <option value="prepay">Prepayment</option>
                  <option value="net7">Net 7 Days</option>
                  <option value="net14">Net 14 Days</option>
                  <option value="net30">Net 30 Days</option>
                  <option value="net60">Net 60 Days</option>
                  <option value="eom">End of Month</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div><label className="label">Credit Limit (£)</label><input name="credit_limit" value={form.credit_limit} onChange={set} className="input" type="number" step="0.01" /></div>
              <div><label className="label">VAT Number</label><input name="vat_number" value={form.vat_number} onChange={set} className="input" /></div>
            </div>
            <div><label className="label">Source</label><input name="source" value={form.source} onChange={set} className="input" placeholder="e.g. website, referral, trade show" /></div>
            <div><label className="label">Notes</label><textarea name="notes" value={form.notes} onChange={set} className="input" rows={3} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save Customer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
