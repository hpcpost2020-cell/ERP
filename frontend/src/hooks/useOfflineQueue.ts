import { useState, useEffect, useCallback, useRef } from 'react'
import { products as productApi, purchasing } from '../api/endpoints'

const QUEUE_KEY = 'oms_mobile_queue'

export type OpType = 'transfer' | 'adjust' | 'qc_pass' | 'qc_fail' | 'qc_quarantine'

export interface QueuedOp {
  id: string
  type: OpType
  payload: Record<string, unknown>
  ts: number
  retries: number
  error?: string
}

function loadQueue(): QueuedOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function persistQueue(q: QueuedOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

async function runOp(op: QueuedOp): Promise<void> {
  switch (op.type) {
    case 'transfer': await productApi.transfer(op.payload); break
    case 'adjust': await productApi.adjust(op.payload); break
    case 'qc_pass': await purchasing.qcPass(op.payload.id as number, op.payload); break
    case 'qc_fail': await purchasing.qcFail(op.payload.id as number, op.payload); break
    case 'qc_quarantine': await purchasing.qcQuarantine(op.payload.id as number, op.payload); break
  }
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOp[]>(loadQueue)
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const syncingRef = useRef(false)

  useEffect(() => {
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return
    const current = loadQueue()
    if (current.length === 0) return
    syncingRef.current = true
    setSyncing(true)
    const remaining: QueuedOp[] = []
    for (const op of current) {
      try {
        await runOp(op)
      } catch {
        const updated = { ...op, retries: op.retries + 1 }
        if (updated.retries < 5) remaining.push(updated)
      }
    }
    persistQueue(remaining)
    setQueue(remaining)
    setSyncing(false)
    syncingRef.current = false
  }, [])

  useEffect(() => {
    if (isOnline) syncNow()
  }, [isOnline, syncNow])

  const executeOrQueue = useCallback(async (type: OpType, payload: Record<string, unknown>): Promise<'ok' | 'queued'> => {
    if (isOnline) {
      try {
        await runOp({ id: '', type, payload, ts: 0, retries: 0 })
        return 'ok'
      } catch { /* fall through to queue */ }
    }
    const op: QueuedOp = { id: crypto.randomUUID(), type, payload, ts: Date.now(), retries: 0 }
    setQueue(prev => {
      const next = [...prev, op]
      persistQueue(next)
      return next
    })
    return 'queued'
  }, [isOnline])

  return { queue, executeOrQueue, syncNow, syncing, isOnline, pendingCount: queue.length }
}
