import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settings as settingsApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import Loading from '../../components/ui/Loading'
import { Save, Plus, X, Eye, EyeOff } from 'lucide-react'

interface Setting { id: number; key: string; value: unknown; description: string; is_sensitive: boolean; value_display: string; updated_at: string; updated_by_name: string }

function SettingRow({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [showSensitive, setShowSensitive] = useState(false)

  const save = useMutation({
    mutationFn: () => settingsApi.update(setting.key, { value }),
    onSuccess: () => { toast(`${setting.key} updated`, 'success'); setEditing(false); onSaved() },
    onError: () => toast('Failed to update setting', 'error'),
  })

  const displayVal = setting.is_sensitive && !showSensitive ? '••••••••' : String(setting.value_display || (setting.value ?? ''))

  return (
    <tr>
      <td className="font-mono text-xs">{setting.key}</td>
      <td className="text-sm text-gray-500 max-w-xs truncate">{setting.description || '—'}</td>
      <td>
        {editing ? (
          <input className="input text-sm py-1" value={value} onChange={e => setValue(e.target.value)} autoFocus />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{displayVal}</span>
            {setting.is_sensitive && (
              <button onClick={() => setShowSensitive(p => !p)} className="text-gray-400 hover:text-gray-600">
                {showSensitive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}
      </td>
      <td className="text-xs text-gray-400">{setting.updated_by_name || '—'}</td>
      <td>
        {editing ? (
          <div className="flex gap-1">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="btn btn-primary btn-sm"><Save className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="btn btn-secondary btn-sm"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => { setValue(String(setting.value ?? '')); setEditing(true) }} className="btn btn-secondary btn-sm text-xs">Edit</button>
        )}
      </td>
    </tr>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['settings', search],
    queryFn: () => settingsApi.list({ search }).then(r => r.data),
  })

  const createSetting = useMutation({
    mutationFn: () => settingsApi.create({ key: newKey, value: newValue, description: newDesc }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast('Setting created', 'success')
      setShowNew(false); setNewKey(''); setNewValue(''); setNewDesc('')
    },
    onError: () => toast('Failed to create setting. Key may already exist.', 'error'),
  })

  if (isLoading) return <Loading />

  const settings: Setting[] = data?.results || []

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">System Settings</h1><p className="page-subtitle">Configure application-wide settings</p></div>
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> New Setting</button>
      </div>

      {showNew && (
        <div className="card card-body space-y-3">
          <h3 className="font-semibold text-sm">Add New Setting</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Key *</label><input className="input" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. COMPANY_NAME" /></div>
            <div><label className="label">Value</label><input className="input" value={newValue} onChange={e => setNewValue(e.target.value)} /></div>
            <div><label className="label">Description</label><input className="input" value={newDesc} onChange={e => setNewDesc(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => createSetting.mutate()} disabled={!newKey || createSetting.isPending} className="btn-primary">{createSetting.isPending ? 'Saving...' : 'Create'}</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <input className="input w-64 text-sm" placeholder="Search settings by key..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="table-container">
          <table>
            <thead><tr><th>Key</th><th>Description</th><th>Value</th><th>Last Updated By</th><th>Actions</th></tr></thead>
            <tbody>
              {settings.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">No settings found</td></tr>
              ) : (
                settings.map(s => (
                  <SettingRow key={s.key} setting={s} onSaved={() => qc.invalidateQueries({ queryKey: ['settings'] })} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
