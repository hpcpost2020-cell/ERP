import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number; pageSize: number; total: number
  onPage: (n: number) => void
}
export default function Pagination({ page, pageSize, total, onPage }: Props) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-sm text-gray-500">Showing {start}–{end} of {total}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className="btn btn-secondary btn-sm">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const n = i + 1; return (
            <button key={n} onClick={() => onPage(n)} className={`btn btn-sm ${n === page ? 'btn-primary' : 'btn-secondary'}`}>{n}</button>
          )
        })}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} className="btn btn-secondary btn-sm">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
