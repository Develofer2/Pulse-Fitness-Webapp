import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router'
import { m } from 'motion/react'
import { Home, Dumbbell, Apple, LineChart, Settings, Sparkles, Activity, WifiOff, Play } from 'lucide-react'
import { useSession } from '../lib/store'
import Notices, { useReminders } from './Notices'

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/nutrition', label: 'Food', icon: Apple },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  const [back, setBack] = useState(false)
  useEffect(() => {
    const up = () => { setOn(true); setBack(true); setTimeout(() => setBack(false), 2500) }
    const down = () => { setOn(false); setBack(false) }
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => { removeEventListener('online', up); removeEventListener('offline', down) }
  }, [])
  return { on, back }
}

export default function Shell() {
  const loc = useLocation()
  const { on, back } = useOnline()
  const phase = useSession((s) => s.phase)
  useReminders()
  const inSession = phase === 'running' || phase === 'resting'

  return (
    <div className="min-h-dvh md:pl-64">
      {(!on || back) && (
        <div role="status" className={`sticky top-0 z-40 px-4 py-2 text-center text-sm font-semibold ${on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-ink'}`}>
          {on ? (
            'Back online.'
          ) : (
            <span className="inline-flex items-center gap-2"><WifiOff size={16} /> You're offline. Logging still works.</span>
          )}
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface/60 p-6 md:flex">
        <Link to="/" className="mb-10 flex items-center gap-3 font-display text-xl font-bold">
          <span className="grid size-10 place-items-center rounded-2xl bg-accent text-accent-fg"><Activity size={22} /></span>
          Pulse
        </Link>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {[...NAV.slice(0, 4), { to: '/ai', label: 'AI', icon: Sparkles }, NAV[4]].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors ${isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
              <Icon size={20} /> {label}
            </NavLink>
          ))}
        </nav>
        {inSession && (
          <Link to="/session" className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg"><Play size={16} /> Resume session</Link>
        )}
      </aside>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-8 sm:px-5 md:px-10 md:pb-16">
        <m.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
          <Notices />
          <Outlet />
        </m.div>
      </main>

      {inSession && (
        <Link to="/session" className="fixed inset-x-4 bottom-24 z-30 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg shadow-lg md:hidden">
          <Play size={16} /> Resume session
        </Link>
      )}

      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-xl md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'} className={({ isActive }) => `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-ink' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    {isActive && <m.span layoutId="nav-dot" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                    <Icon size={22} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
