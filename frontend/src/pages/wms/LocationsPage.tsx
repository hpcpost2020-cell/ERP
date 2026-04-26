import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { products as productApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import Loading from '../../components/ui/Loading'
import SearchBar from '../../components/ui/SearchBar'
import { Plus, Edit2, ToggleLeft, ToggleRight, X, MapPin, Inbox } from 'lucide-react'

interface Location {
  id: number
  code: string
  name: string
  description: string
  is_active: boolean
  is_receiving_bay: boolean
}

const emptyLoc = { code: '', name: '', description: '', is_active: true, is_receiving_bay: false }

function LocationModal({ loc, onClose }: { loc?: Location; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(loc
    ? { code: loc.code, name: loc.name, description: loc.description, is_active: loc.is_active, is_receiving_bay: loc.is_receiving_bay }
    : { ...emptyLoc })
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => loc ? productApi.updateLocation(loc.id, form) : productApi.createLocation(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      toast(loc ? 'Location updated' : 'Location created', 'success')
      onClose()
    },
    onError: () => setError('Failed to save. Code must be unique.'),
  })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-md">
        <div className="modal-header">
          <h2>{loc ? 'Edit Location' : 'New Location'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); setError(''); save.mutate() }}>
          <div className="modal-body space-y-4">
            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
            <div>
              <label className="label">Location Code *</label>
              <input className="input font-mono uppercase" value={form.code} required
                onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. A-01-01, RECV, QUAR" />
              <p className="text-xs text-gray-400 mt-1">Unique identifier, used for barcode scanning</p>
            </div>
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} required
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Aisle A, Shelf 1, Receiving Bay" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional notes about this location" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
              <span className="text-sm font-medium text-gray-700">Active (available for stock)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.is_receiving_bay} onChange={e => setForm(p => ({ ...p, is_receiving_bay: e.target.checked }))} className="rounded" />
              <div>
                <span className="text-sm font-medium text-gray-700">Receiving Bay</span>
                <p className="text-xs text-gray-400">Incoming goods land here; put-away transfers stock from this location to bins</p>
              </div>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save Location'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LocationsPage() {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editLoc, setEditLoc] = useState<Location | undefined>()
  const [showCreate, setShowCreate] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['locations', search, showInactive],
    queryFn: () => productApi.locations({ search: search || undefined, is_active: showInactive ? undefined : true }).then(r => r.data),
  })

  const toggle = useMutation({
    mutationFn: (loc: Location) => productApi.updateLocation(loc.id, { is_active: !loc.is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); toast('Location updated', 'success') },
    onError: () => toast('Failed to update', 'error'),
  })

  const toggleBay = useMutation({
    mutationFn: (loc: Location) => productApi.updateLocation(loc.id, { is_receiving_bay: !loc.is_receiving_bay }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); toast('Receiving bay updated', 'success') },
    onError: () => toast('Failed to update', 'error'),
  })

  const locs: Location[] = Array.isArray(data) ? data : data?.results || []

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Locations</h1>
          <p className="page-subtitle">{locs.length} location{locs.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> New Location</button>
      </div>

      <div className="card">
        <div className="card-header">
          <SearchBar value={search} onChange={v => setSearch(v)} placeholder="Search code or name..." />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Show inactive
          </label>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locs.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">No locations found. Create your first warehouse location.</td></tr>
              )}
              {locs.map(loc => (
                <tr key={loc.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {loc.is_receiving_bay
                        ? <Inbox className="w-4 h-4 text-blue-500 shrink-0" />
                        : <MapPin className="w-4 h-4 text-gray-400 shrink-0" />}
                      <span className="font-mono font-semibold text-sm">{loc.code}</span>
                      {loc.is_receiving_bay && (
                        <span className="badge badge-blue text-xs">Receiving Bay</span>
                      )}
                    </div>
                  </td>
                  <td className="font-medium">{loc.name}</td>
                  <td className="text-sm text-gray-500 max-w-xs truncate">{loc.description || '—'}</td>
                  <td>
                    <span className={`badge ${loc.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {loc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditLoc(loc)}>
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggle.mutate(loc)}
                        title={loc.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {loc.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                      </button>
                      <button
                        className={`btn btn-sm ${loc.is_receiving_bay ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleBay.mutate(loc)}
                        title={loc.is_receiving_bay ? 'Remove receiving bay flag' : 'Mark as receiving bay'}
                      >
                        <Inbox className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <LocationModal onClose={() => setShowCreate(false)} />}
      {editLoc && <LocationModal loc={editLoc} onClose={() => setEditLoc(undefined)} />}
    </div>
  )
}
