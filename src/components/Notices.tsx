import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useNavigate } from 'react-router'
import { Download, HardDrive, RefreshCw, Share, X } from 'lucide-react'
import { db } from '../lib/db'
import { isIos, usePwa } from '../lib/pwa'
import { useSession, useSettings } from '../lib/store'
import { Button } from './ui'

function Banner({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-sm font-semibold">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
      {onClose && <button aria-label="Dismiss" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full text-muted"><X size={16} /></button>}
    </div>
  )
}

/** Stacked, dismissible notices: resume, update, install, backup reminder, storage. */
export default function Notices() {
  const nav = useNavigate()
  const loc = useLocation()
  const { updateReady, installEvent, installed, apply } = usePwa()
  const phase = useSession((s) => s.phase)
  const sessionName = useSession((s) => s.name)
  const finish = useSession((s) => s.finish)
  const completed = useLiveQuery(() => db.workouts.filter((w) => w.status === 'completed').count().catch(() => 0), []) ?? 0
  const [quota, setQuota] = useState(false)
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => JSON.parse(sessionStorage.getItem('pulse-dismissed') ?? '{}'))
  const dismiss = (k: string) => { const n = { ...dismissed, [k]: true }; setDismissed(n); sessionStorage.setItem('pulse-dismissed', JSON.stringify(n)) }
  const active = phase === 'running' || phase === 'resting'
  const set = useSettings()

  useEffect(() => {
    const h = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; inner?: { name?: string } } | undefined
      if (r?.name === 'QuotaExceededError' || r?.inner?.name === 'QuotaExceededError') setQuota(true)
    }
    addEventListener('unhandledrejection', h)
    return () => removeEventListener('unhandledrejection', h)
  }, [])

  const lastBackup = Number(localStorage.getItem('pulse-last-backup') ?? 0)
  const backupDue = completed > 0 && Date.now() - lastBackup > 30 * 86400000
  const showInstall = completed >= 1 && !installed && !dismissed.install && (installEvent || isIos())
  void set

  const items: ReactNode[] = []
  if (active && loc.pathname !== '/session' && loc.pathname === '/')
    items.push(
      <Banner key="resume">
        <span>"{sessionName}" is still in progress.</span>
        <Button variant="primary" onClick={() => nav('/session')}>Resume</Button>
        <Button onClick={() => { if (confirm('Finish as abandoned? Completed sets are kept.')) void finish(true).then(() => useSession.getState().reset()) }}>Finish as abandoned</Button>
      </Banner>,
    )
  if (updateReady)
    items.push(
      <Banner key="upd">
        <RefreshCw size={16} />
        {active ? <span>Update available. It will install after your workout.</span> : (
          <><span>Update available.</span><Button variant="primary" onClick={apply}>Reload to update</Button></>
        )}
      </Banner>,
    )
  if (showInstall)
    items.push(
      <Banner key="inst" onClose={() => dismiss('install')}>
        {installEvent ? (
          <><Download size={16} /><span>Install Pulse for one-tap access and offline use.</span><Button variant="primary" onClick={async () => { const e = installEvent as Event & { prompt: () => Promise<void> }; await e.prompt(); usePwa.setState({ installEvent: null }) }}>Install</Button></>
        ) : (
          <><Share size={16} /><span>To install on iPhone or iPad: tap Share, then Add to Home Screen.</span></>
        )}
      </Banner>,
    )
  if (backupDue && !dismissed.backup)
    items.push(
      <Banner key="bk" onClose={() => dismiss('backup')}>
        <span>It's been over 30 days since your last backup. Your data only lives on this device.</span>
        <Link to="/settings" className="text-accent-ink">Back up now</Link>
      </Banner>,
    )
  if (quota)
    items.push(
      <Banner key="q" onClose={() => setQuota(false)}>
        <HardDrive size={16} /><span>Storage is full, so a recent change may not have saved. Delete old photos or export your data.</span>
        <Link to="/settings" className="text-accent-ink">Open Settings</Link>
      </Banner>,
    )
  if (!items.length) return null
  return <div className="mb-6 space-y-2" role="region" aria-label="Notices">{items}</div>
}

/** Local reminders: fire while the app (or a service worker registration) can run. */
export function useReminders() {
  const { reminderWorkout, reminderWater } = useSettings()
  useEffect(() => {
    if (!reminderWorkout && !reminderWater) return
    const fire = async (id: string, title: string, body: string) => {
      const day = new Date().toDateString()
      const key = `pulse-rem-${id}`
      if (localStorage.getItem(key) === day + new Date().getHours()) return
      localStorage.setItem(key, day + new Date().getHours())
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) void reg.showNotification(title, { body, icon: '/icon.svg', tag: id })
      else new Notification(title, { body, icon: '/icon.svg' })
    }
    const tick = () => {
      const d = new Date()
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      if (reminderWorkout && hm === reminderWorkout) void fire('workout', 'Time to move', 'Your session is ready when you are.')
      if (reminderWater && d.getMinutes() === 0 && d.getHours() >= 9 && d.getHours() <= 20 && d.getHours() % 3 === 0) void fire('water', 'Water break', 'A glass of water now keeps you on track.')
    }
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [reminderWorkout, reminderWater])
}
