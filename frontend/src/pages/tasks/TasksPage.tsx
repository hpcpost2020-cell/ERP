import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasks as tasksApi } from '../../api/endpoints'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../context/AuthContext'
import Loading from '../../components/ui/Loading'
import StatusBadge from '../../components/ui/StatusBadge'
import { fmt } from '../../utils/format'
import { Plus, CheckCircle, X, AlertTriangle } from 'lucide-react'

interface Task { id: number; title: string; description: string; status: string; priority: string; assigned_to: number | null; assigned_to_name: string; due_date: string; is_overdue: boolean; related_label: string; created_at: string }

const PRIORITY_BADGE: Record<string, string> = { low: 'badge-gray', normal: 'badge-blue', high: 'badge-orange', urgent: 'badge-red' }

function TaskFormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal', due_date: '', status: 'open', related_label: '' })
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: () => tasksApi.create({ ...form, assigned_to: user?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast('Task created', 'success'); onClose() },
    onError: () => setError('Failed to create task.'),
  })

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal max-w-lg">
        <div className="modal-header">
          <h2>New Task</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); setError(''); create.mutate() }}>
          <div className="modal-body space-y-4">
            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
            <div><label className="label">Title *</label><input name="title" value={form.title} onChange={set} className="input" required autoFocus /></div>
            <div><label className="label">Description</label><textarea name="description" value={form.description} onChange={set} className="input" rows={3} /></div>
            <div className="form-row">
              <div><label className="label">Priority</label>
                <select name="priority" value={form.priority} onChange={set} className="select">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div><label className="label">Due Date</label><input name="due_date" type="datetime-local" value={form.due_date} onChange={set} className="input" /></div>
            </div>
            <div><label className="label">Related To (label)</label><input name="related_label" value={form.related_label} onChange={set} className="input" placeholder="e.g. PO2026040001, Customer XYZ" /></div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating...' : 'Create Task'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TasksPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | 'my' | 'overdue'>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)

  const { data: allTasks, isLoading } = useQuery({
    queryKey: ['tasks', filter, statusFilter],
    queryFn: () => {
      if (filter === 'my') return tasksApi.myTasks().then(r => r.data)
      if (filter === 'overdue') return tasksApi.overdue().then(r => r.data)
      return tasksApi.list({ status: statusFilter || undefined, ordering: 'due_date,-priority' }).then(r => r.data.results || r.data)
    },
  })

  const completeMut = useMutation({
    mutationFn: (id: number) => tasksApi.complete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast('Task marked complete', 'success') },
    onError: () => toast('Failed to complete task', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast('Task deleted', 'info') },
  })

  if (isLoading) return <Loading />

  const tasks: Task[] = Array.isArray(allTasks) ? allTasks : (allTasks?.results || [])

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div><h1 className="page-title">Tasks</h1><p className="page-subtitle">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p></div>
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> New Task</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex gap-3 flex-wrap">
            {(['all', 'my', 'overdue'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f === 'my' ? 'My Tasks' : f === 'overdue' ? 'Overdue' : 'All Tasks'}
              </button>
            ))}
            {filter === 'all' && (
              <select className="select w-36 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <div>No tasks found</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tasks.map((task: Task) => (
              <div key={task.id} className={`p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors ${task.status === 'done' ? 'opacity-60' : ''}`}>
                <button
                  onClick={() => task.status !== 'done' && completeMut.mutate(task.id)}
                  disabled={task.status === 'done' || completeMut.isPending}
                  className={`mt-0.5 shrink-0 rounded-full border-2 w-5 h-5 flex items-center justify-center transition-colors ${task.status === 'done' ? 'border-green-400 bg-green-400' : 'border-gray-300 hover:border-green-400'}`}>
                  {task.status === 'done' && <CheckCircle className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`font-medium text-sm ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>{task.title}</p>
                      {task.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>}
                      {task.related_label && <p className="text-xs text-brand-600 mt-0.5">↗ {task.related_label}</p>}
                    </div>
                    <button onClick={() => { if (confirm('Delete task?')) deleteMut.mutate(task.id) }} className="btn btn-secondary btn-sm text-red-400 shrink-0"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className={`badge ${PRIORITY_BADGE[task.priority] || 'badge-gray'} capitalize`}>{task.priority}</span>
                    <StatusBadge status={task.status} />
                    {task.assigned_to_name && <span className="text-xs text-gray-400">→ {task.assigned_to_name}</span>}
                    {task.due_date && (
                      <span className={`flex items-center gap-1 text-xs ${task.is_overdue && task.status !== 'done' ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                        {task.is_overdue && task.status !== 'done' && <AlertTriangle className="w-3 h-3" />}
                        Due {fmt.shortDate(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && <TaskFormModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
