import { useEffect, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useSettings } from '../lib/store'
import { hashPin } from '../lib/lock'
import { Button, Field } from './ui'

/** Gates the app behind a PIN when enabled, and re-locks after inactivity. */
export default function LockGate({ children }: { children: ReactNode }) {
  const { lockHash, lockSalt, lockMinutes } = useSettings()
  const enabled = !!lockHash
  const [locked, setLocked] = useState(enabled)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (!enabled) setLocked(false) }, [enabled])
  useEffect(() => {
    if (!enabled || locked) return
    let t = setTimeout(() => setLocked(true), lockMinutes * 60000)
    const reset = () => { clearTimeout(t); t = setTimeout(() => setLocked(true), lockMinutes * 60000) }
    const ev = ['pointerdown', 'keydown', 'touchstart']
    ev.forEach((e) => addEventListener(e, reset, { passive: true }))
    return () => { clearTimeout(t); ev.forEach((e) => removeEventListener(e, reset)) }
  }, [enabled, locked, lockMinutes])

  if (!locked) return <>{children}</>
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <form className="w-full max-w-xs space-y-4 text-center" onSubmit={async (e) => {
        e.preventDefault()
        if ((await hashPin(pin, lockSalt)) === lockHash) { setLocked(false); setPin(''); setErr('') } else setErr("That PIN doesn't match.")
      }}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent text-accent-fg"><Lock /></span>
        <h1 className="font-display text-2xl font-bold">Pulse is locked</h1>
        <Field id="pin" label="PIN" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} aria-describedby={err ? 'pin-err' : undefined} />
        {err && <p id="pin-err" role="alert" className="text-sm font-semibold text-warn">{err}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pin.length < 4}>Unlock</Button>
      </form>
    </div>
  )
}
