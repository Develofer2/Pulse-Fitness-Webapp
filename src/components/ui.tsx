import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { m, animate, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { X } from 'lucide-react'

export function Card({ className = '', children, ...p }: ComponentProps<'div'>) {
  return (
    <div className={`rounded-3xl border border-line bg-surface p-5 ${className}`} {...p}>
      {children}
    </div>
  )
}

type BtnProps = {
  variant?: 'primary' | 'ghost' | 'soft'
  size?: 'md' | 'lg'
} & Omit<ComponentProps<typeof m.button>, 'ref'>

export function Button({ variant = 'soft', size = 'md', className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-accent text-accent-fg font-bold',
    soft: 'bg-surface-2 text-ink font-semibold',
    ghost: 'text-muted font-semibold hover:text-ink',
  }[variant]
  const s = size === 'lg' ? 'min-h-14 px-7 text-lg' : 'min-h-11 px-4 text-sm'
  return (
    <m.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl disabled:opacity-40 ${v} ${s} ${className}`}
      {...p}
    />
  )
}

export function LinkButton({ to, children, variant = 'soft', className = '' }: { to: string; children: ReactNode; variant?: 'primary' | 'soft'; className?: string }) {
  const v = variant === 'primary' ? 'bg-accent text-accent-fg font-bold' : 'bg-surface-2 text-ink font-semibold'
  return (
    <Link to={to} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm transition-transform active:scale-[0.97] ${v} ${className}`}>
      {children}
    </Link>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="max-w-xs text-sm text-muted">{text}</p>
      {action}
    </div>
  )
}

/** Counts up from the previous value (400ms), transform-free text update. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = value.toFixed(decimals)
      prev.current = value
      return
    }
    const c = animate(prev.current, value, {
      duration: 0.4,
      ease: 'easeOut',
      onUpdate: (v) => (el.textContent = v.toFixed(decimals)),
    })
    prev.current = value
    return () => c.stop()
  }, [value, decimals, reduce])
  return <span ref={ref}>{value.toFixed(decimals)}</span>
}

export function Ring({ value, size = 120, stroke = 10, children, tone = 'accent', label }: { value: number; size?: number; stroke?: number; children?: ReactNode; tone?: 'accent' | 'warn'; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(1, Math.max(0, value))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone === 'accent' ? 'var(--accent)' : 'var(--warn)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
      <m.div
        className={`h-full origin-left rounded-full ${over ? 'bg-warn' : 'bg-accent'}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct }}
        style={{ width: '100%' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <m.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <m.div
        className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-line bg-surface p-5 pb-8 md:rounded-[2rem]"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-full bg-surface-2">
            <X size={18} />
          </button>
        </div>
        {children}
      </m.div>
    </div>
  )
}

export function Field({ label, id, ...p }: { label: string; id: string } & ComponentProps<'input'>) {
  return (
    <label htmlFor={id} className="block text-sm font-semibold">
      {label}
      <input id={id} {...p} className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base font-medium outline-none focus:border-accent-ink" />
    </label>
  )
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T | T[]; onChange: (v: T) => void; label: string }) {
  const sel = Array.isArray(value) ? value : [value]
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={sel.includes(o.id)}
          onClick={() => onChange(o.id)}
          className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${sel.includes(o.id) ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  const node = msg ? (
    <m.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} role="status" className="fixed bottom-28 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg shadow-xl md:bottom-8">
      {msg}
    </m.div>
  ) : null
  return { toast: setMsg, node }
}
