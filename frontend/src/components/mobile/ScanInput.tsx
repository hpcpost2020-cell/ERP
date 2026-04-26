import { useRef, useEffect, useState } from 'react'
import { ScanLine } from 'lucide-react'

interface Props {
  onScan: (value: string) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  label?: string
  // key prop on this component resets state and re-focuses (use step as key)
}

// inputMode="none" prevents the Android soft keyboard from opening on TC57
// while still receiving DataWedge hardware scan keystrokes.
// On desktop, physical keyboard input is unaffected.
export default function ScanInput({ onScan, placeholder = 'Scan barcode…', disabled = false, autoFocus = true, label }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 80)
  }, [autoFocus])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault()
      setFlash(true)
      setTimeout(() => setFlash(false), 250)
      onScan(value.trim())
      setValue('')
    }
  }

  return (
    <div className="space-y-1">
      {label && (
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">{label}</p>
      )}
      <div className="relative">
        <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 w-7 h-7 text-gray-400 pointer-events-none" />
        <input
          ref={ref}
          type="text"
          inputMode="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full pl-14 pr-4 py-5 text-xl font-mono rounded-2xl border-2 bg-white
            focus:outline-none transition-colors duration-100 disabled:bg-gray-100
            ${flash ? 'border-green-500 bg-green-50' : 'border-gray-300 focus:border-blue-500'}`}
        />
      </div>
    </div>
  )
}
