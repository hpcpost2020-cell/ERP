import { useState, useEffect, useCallback, useRef } from 'react'
import { products as productApi, purchasing, sales } from '../api/endpoints'

const QUEUE_KEY = 'oms_mobile_queue'
const CONFLICTS_KEY = 'oms_stock_conflicts'

export type OpType =
  | 'transfer' | 'adjust' | 'qc_pass' | 'qc_fail' | 'qc_quarantine'
  | 'order_mark_processing' | 'order_mark_ready' | 'order_dispatch'

export interface QueuedOp {
  id: string
  type: OpType
  payload: Record<string, unknown>
  ts: number
  retries: number
}

export interface StockConflict {
  op_id: string
  product_sku: string
  location_code: string
  original_system_qty: number
  counted_qty: number
  current_system_qty: number
  product_id: number
  location_id: number
}

function loadQueue(): QueuedOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function persistQueue(q: QueuedOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}
function loadConflicts(): StockConflict[] {
  try { return JSON.parse(localStorage.getItem(CONFLICTS_KEY) || '[]') } catch { return [] }
}
function persistConflicts(c: StockConflict[]) {
  localStorage.setItem(CONFLICTS_KEY, JSON.stringify(c))
}

// Strip _prefixed metadata fields before sending payload to the API
function stripMeta(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !k.startsWith('_')))
}

async function runOp(op: QueuedOp): Promise<void> {
  const p = stripMeta(op.payload)
  switch (op.type) {
    case 'transfer': await productApi.transfer(p); break
    case 'adjust': await productApi.adjust(p); break
    case 'qc_pass': await purchasing.qcPass(p.id as number, p); break
    case 'qc_fail': await purchasing.qcFail(p.id as number, p); break
    case 'qc_quarantine': await purchasing.qcQuarantine(p.id as number, p); break
    case 'order_mark_processing': await sales.markProcessing(p.order_id as number); break
    case 'order_mark_ready': await sales.markReady(p.order_id as number); break
    case 'order_dispatch':
      await sales.dispatch(p.order_id as number, {
        tracking_number: p.tracking_number,
        courier: p.courier,
        cost: p.cost ?? 0,
      })
      break
  }
}

async function checkStockConflict(op: QueuedOp): Promise<StockConflict | null> {
  const meta = op.payload._stock_count_meta as {
    product_sku: string; location_code: string
    original_system_qty: number; counted_qty: number
  } | undefined
  if (!meta) return null
  try {
    const res = await productApi.stockLevels({ product: op.payload.product, location: op.payload.location, page_size: 1 })
    const levels: Array<{ qty_on_hand: number }> = Array.isArray(res.data) ? res.data : res.data?.results || []
    const currentQty = levels[0]?.qty_on_hand ?? null
    if (currentQty === null || currentQty === meta.original_system_qty) return null
    return {
      op_id: op.id,
      product_sku: meta.product_sku,
      location_code: meta.location_code,
      original_system_qty: meta.original_system_qty,
      counted_qty: meta.counted_qty,
      current_system_qty: currentQty,
      product_id: op.payload.product as number,
      location_id: op.payload.location as number,
    }
  } catch { return null }
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOp[]>(loadQueue)
  const [conflicts, setConflicts] = useState<StockConflict[]>(loadConflicts)
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
    const newConflicts: StockConflict[] = []

    for (const op of current) {
      // For queued stock count adjustments, check if stock changed since the count was taken
      if (op.type === 'adjust' && op.payload._stock_count_meta) {
        const conflict = await checkStockConflict(op)
        if (conflict) {
          newConflicts.push(conflict)
          continue // hold this op — user must resolve
        }
      }
      try {
        await runOp(op)
      } catch {
        const updated = { ...op, retries: op.retries + 1 }
        if (updated.retries < 5) remaining.push(updated)
      }
    }

    if (newConflicts.length > 0) {
      setConflicts(prev => {
        const merged = [...prev]
        for (const c of newConflicts) {
          if (!merged.find(x => x.op_id === c.op_id)) merged.push(c)
        }
        persistConflicts(merged)
        return merged
      })
    }

    persistQueue(remaining)
    setQueue(remaining)
    setSyncing(false)
    syncingRef.current = false
  }, [])

  useEffect(() => {
    if (isOnline) syncNow()
  }, [isOnline, syncNow])

  const executeOrQueue = useCallback(async (
    type: OpType,
    payload: Record<string, unknown>
  ): Promise<'ok' | 'queued'> => {
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

  // Resolve a stock count conflict: apply recalculated delta, or skip
  const resolveConflict = useCallback(async (opId: string, action: 'apply' | 'skip') => {
    const conflict = loadConflicts().find(c => c.op_id === opId)
    if (!conflict) return

    if (action === 'apply') {
      // Recalculate delta from the current system qty to the physically-counted qty
      const correctedDelta = conflict.counted_qty - conflict.current_system_qty
      try {
        await productApi.adjust({
          product: conflict.product_id,
          location: conflict.location_id,
          quantity: correctedDelta,
          notes: `Stock count (conflict resolved): counted ${conflict.counted_qty}, system was ${conflict.current_system_qty}`,
        })
      } catch { return } // let user retry if it fails
    }

    setConflicts(prev => {
      const updated = prev.filter(c => c.op_id !== opId)
      persistConflicts(updated)
      return updated
    })
  }, [])

  return {
    queue, executeOrQueue, syncNow, syncing, isOnline,
    pendingCount: queue.length,
    conflicts, resolveConflict, conflictCount: conflicts.length,
  }
}
