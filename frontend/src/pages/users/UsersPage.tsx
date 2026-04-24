import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { users as usersApi } from '../../api/endpoints'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { Plus, UserCheck, UserX } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', warehouse: 'Warehouse', customer_service: 'Customer Service', accounts: 'Accounts', management: 'Management' }

export default function UsersPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', first_name: '', last_name: '', role: 'customer_service', password: '', password2: '' })

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })

  const createMut = useMutation({ mutationFn: (d: unknown) => usersApi.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowNew(false) } })
  const activateMut = useMutation({ mutationFn: (id: number) => usersApi.activate(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })
  const deactivateMut = useMutation({ mutationFn: (id: number) => usersApi.deactivate(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) })

  if (isLoading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Users & Permissions</h1><p className="page-subtitle">Manage staff access</p></div>
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> Add User</button>
      </div>
      <div className="card">
        <div className="table-container">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {data?.results?.map((u: { id: number; full_name: string; username: string; email: string; role: string; is_active: boolean; created_at: string }) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.full_name}</td>
                  <td className="font-mono text-xs">{u.username}</td>
                  <td className="text-gray-500 text-sm">{u.email}</td>
                  <td><span className="badge badge-purple">{ROLE_LABELS[u.role] || u.role}</span></td>
                  <td><StatusBadge status={u.is_active ? 'active' : 'inactive'} /></td>
                  <td className="text-xs text-gray-500">{u.created_at?.split('T')[0]}</td>
                  <td>
                    {u.is_active
                      ? <button onClick={() => deactivateMut.mutate(u.id)} className="btn btn-secondary btn-sm text-red-500"><UserX className="w-3 h-3" /> Deactivate</button>
                      : <button onClick={() => activateMut.mutate(u.id)} className="btn btn-success btn-sm"><UserCheck className="w-3 h-3" /> Activate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal max-w-lg">
            <div className="modal-header"><h2>Add New User</h2><button onClick={() => setShowNew(false)}>✕</button></div>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(newUser) }}>
              <div className="modal-body space-y-4">
                <div className="form-row">
                  <div><label className="label">First Name</label><input className="input" value={newUser.first_name} onChange={e => setNewUser(p=>({...p,first_name:e.target.value}))} required /></div>
                  <div><label className="label">Last Name</label><input className="input" value={newUser.last_name} onChange={e => setNewUser(p=>({...p,last_name:e.target.value}))} /></div>
                </div>
                <div><label className="label">Username</label><input className="input" value={newUser.username} onChange={e => setNewUser(p=>({...p,username:e.target.value}))} required /></div>
                <div><label className="label">Email</label><input className="input" type="email" value={newUser.email} onChange={e => setNewUser(p=>({...p,email:e.target.value}))} required /></div>
                <div><label className="label">Role</label>
                  <select className="select" value={newUser.role} onChange={e => setNewUser(p=>({...p,role:e.target.value}))}>
                    {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div><label className="label">Password</label><input className="input" type="password" value={newUser.password} onChange={e => setNewUser(p=>({...p,password:e.target.value}))} required /></div>
                  <div><label className="label">Confirm Password</label><input className="input" type="password" value={newUser.password2} onChange={e => setNewUser(p=>({...p,password2:e.target.value}))} required /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={createMut.isPending}>Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
