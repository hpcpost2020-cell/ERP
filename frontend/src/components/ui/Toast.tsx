import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface Toast { id: number; message: string; type: ToastType }
interface ToastContextType { toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  let nextId = 0

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])

  const remove = (id: number) => setToasts(p => p.filter(t => t.id !== id))

  const icons = { success: CheckCircle, error: XCircle, info: AlertCircle }
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const iconStyles = {
    success: 'text-green-500',
    error: 'text-red-500',
    info: 'text-blue-500',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map(t => {
          const Icon = icons[t.type]
          return (
            <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg ${styles[t.type]} animate-in slide-in-from-right`}>
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconStyles[t.type]}`} />
              <span className="text-sm flex-1">{t.message}</span>
              <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
