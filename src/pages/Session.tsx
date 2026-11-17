import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { Check, Pause, Play, SkipForward, Trophy, Undo2, X } from 'lucide-react'
import { Button, Card, CountUp, LinkButton } from '../components/ui'
import { useSession, useSettings, feedback, LEAD_MS } from '../lib/store'
import { EXERCISE_MAP } from '../lib/exercises'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { aiMessage, workoutSummary } from '../lib/ai'
import { fmtDuration, fromDisplay, round1, toDisplay, volume } from '../lib/domain'

/** Timestamp-based countdown: source of truth is wall-clock, rAF only repaints on whole seconds. */
function useRemaining(start: number, total: number, pausedAt: number | null, active: boolean) {
  const calc = () => Math.max(0, total - ((pausedAt ?? Date.now()) - start))
  const [ms, setMs] = useState(calc)
  useEffect(() => {
    if (!active) return
    let raf = 0
    let lastSec = -1
    const tick = () => {
      const r = calc()
      const sec = Math.ceil(r / 1000)
      if (sec !== lastSec) { lastSec = sec; setMs(r) }
      if (r > 0) raf = requestAnimationFrame(tick)
    }
    tick()
    const vis = () => tick()
    document.addEventListener('visibilitychange', vis)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, total, pausedAt, active])
  return ms
}

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => { lock?.release().catch(() => {}) }
  }, [on])
}

function Stepper({ label, value, onChange, step, unit, decimals = 0 }: { label: string; value: number; onChange: (n: number) => void; step: number; unit?: string; decimals?: number }) {
  return (
    <div className="rounded-3xl bg-surface-2 p-3 text-center">
      <p className="mb-1 text-xs font-semibold text-muted">{label}</p>
      <div className="flex items-center justify-between gap-1">
        <button aria-label={`Decrease ${label}`} onClick={() => { feedback(); onChange(Math.max(0, round1(value - step))) }} className="grid size-12 place-items-center rounded-2xl bg-surface text-2xl font-bold active:scale-95">−</button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <input
            inputMode="decimal"
            value={Number(value.toFixed(decimals))}
            onChange={(e) => { const n = parseFloat(e.target.value); onChange(Number.isFinite(n) ? n : 0) }}
            className="font-num w-full bg-transparent text-center text-3xl font-bold outline-none"
          />
        </label>
        <button aria-label={`Increase ${label}`} onClick={() => { feedback(); onChange(round1(value + step)) }} className="grid size-12 place-items-center rounded-2xl bg-surface text-2xl font-bold active:scale-95">+</button>
      </div>
      {unit && <p className="text-xs text-muted">{unit}</p>}
    </div>
  )
}

export default function SessionPage() {
  const nav = useNavigate()
  const s = useSession()
  const units = useSettings((x) => x.units)
  const autoFlow = useSettings((x) => x.autoFlow)
  useWakeLock(s.phase === 'running' || s.phase === 'resting')

  if (s.phase === 'idle') return <Navigate to="/train" replace />
  if (s.phase === 'preview') return <Preview />
  if (s.phase === 'finished') return <Summary />

  const it = s.items[s.exIdx]
  const ex = EXERCISE_MAP[it.exerciseId]
  const upcoming = s.setIdx + 1 < it.sets ? `${it.name} · set ${s.setIdx + 2}` : s.items[s.exIdx + 1]?.name
  const totalSets = s.items.reduce((a, i) => a + i.sets, 0)
  const progress = s.logged.length / totalSets

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-3">
        <button aria-label="End session" onClick={() => { if (confirm('End this session? Completed sets are saved.')) { void s.finish(true).then(() => nav('/')) } }} className="grid size-11 place-items-center rounded-full bg-surface-2"><X size={18} /></button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <m.div className="h-full origin-left rounded-full bg-accent" style={{ width: '100%' }} animate={{ scaleX: progress }} transition={{ duration: 0.4 }} />
        </div>
        <span className="font-num text-sm font-bold text-muted">{s.logged.length}/{totalSets}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {s.phase === 'resting' ? (
          <m.div key="rest" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Rest upcoming={upcoming} />
          </m.div>
        ) : (
          <m.div key={`set-${s.exIdx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <p className="text-sm font-semibold capitalize text-muted">{s.type} · Exercise {s.exIdx + 1} of {s.items.length}</p>
            <h1 className="font-display mt-1 text-4xl font-bold leading-tight">{it.name}</h1>
            <p className="mt-2 text-lg font-semibold text-accent-ink">
              Set {s.setIdx + 1} of {it.sets} · {it.seconds > 0 ? `${it.seconds} sec` : `${it.reps} reps`}
            </p>
            {it.suggested && <p className="mt-2 inline-block rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-fg">Try {round1(toDisplay(it.suggested, units))} {units} today</p>}

            {autoFlow ? (
              <Work key={`${s.exIdx}-${s.setIdx}`} />
            ) : (
              <>
                <ul className="mt-4 flex flex-wrap gap-2">{ex?.cues.map((c) => <li key={c} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">{c}</li>)}</ul>
                {it.seconds === 0 && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <Stepper label="Weight" unit={units} value={toDisplay(s.weightKg, units)} step={units === 'kg' ? 2.5 : 5} decimals={1} onChange={(v) => s.adjust({ weightKg: fromDisplay(v, units) })} />
                    <Stepper label="Reps" value={s.reps} step={1} onChange={(v) => s.adjust({ reps: Math.round(v) })} />
                  </div>
                )}
                <m.button whileTap={{ scale: 0.97 }} transition={{ duration: 0.12 }} onClick={() => s.completeSet()} className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-3xl bg-accent text-xl font-bold text-accent-fg">
                  <Check size={24} strokeWidth={3} /> Complete set
                </m.button>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button onClick={s.undoLast} disabled={s.logged.length === 0}><Undo2 size={16} /> Undo</Button>
                  <Button onClick={s.skipExercise}><SkipForward size={16} /> Skip</Button>
                  <Button onClick={s.togglePause}>{s.pausedAt ? <Play size={16} /> : <Pause size={16} />} {s.pausedAt ? 'Resume' : 'Pause'}</Button>
                </div>
              </>
            )}
          </m.div>
        )}
      </AnimatePresence>
      <p className="mt-6 text-center text-xs text-muted">Last session's values are pre-filled. Everything is saved on this device.</p>
    </div>
  )
}

/** Auto-run set: lead-in countdown, then a work timer (timed moves) or a paced rep counter, then it completes itself. */
function Work() {
  const s = useSession()
  const tempo = useSettings((x) => x.tempo)
  const units = useSettings((x) => x.units)
  const it = s.items[s.exIdx]
  const timed = it.seconds > 0
  const totalMs = (timed ? it.seconds : s.reps * tempo) * 1000
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (s.pausedAt) { setNow(s.pausedAt); return }
    const t = setInterval(() => setNow(Date.now()), 100)
    const vis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [s.pausedAt])

  const lead = s.workStart - now
  const elapsed = Math.max(0, now - s.workStart)
  const working = lead <= 0
  const left = Math.max(0, totalMs - elapsed)
  const rep = timed ? 0 : Math.min(s.reps, Math.floor(elapsed / (tempo * 1000)) + 1)
  const repProgress = timed ? 0 : (elapsed % (tempo * 1000)) / (tempo * 1000)
  const doneRef = useRef(false)
  // after a reload or long background, restart this set's lead-in instead of auto-logging a stale set
  useEffect(() => {
    const st = useSession.getState()
    if (!st.pausedAt && st.workStart + totalMs + 5000 < Date.now()) useSession.setState({ workStart: Date.now() + LEAD_MS })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const lastTick = useRef(-1)

  // finish automatically at zero
  useEffect(() => {
    if (working && left <= 0 && totalMs > 0 && !doneRef.current && !s.pausedAt) {
      doneRef.current = true
      s.completeSet()
    }
  }, [working, left, totalMs, s])
  // light feedback on each rep, each lead-in second and the last 3 seconds of a timed hold
  const marker = !working ? -Math.ceil(lead / 1000) : timed ? Math.ceil(left / 1000) : rep
  useEffect(() => {
    if (lastTick.current === marker || s.pausedAt) return
    lastTick.current = marker
    if (!working || !timed || left <= 3000) feedback()
  }, [marker, working, timed, left, s.pausedAt])

  const R = 120
  const C = 2 * Math.PI * R
  const frac = !working ? Math.max(0, lead / 3000) : timed ? left / totalMs : (rep - 1 + repProgress) / s.reps
  const accent = !working ? 'var(--muted)' : timed && left <= 3000 ? 'var(--warn)' : 'var(--accent)'
  const label = !working ? `Get ready, ${Math.ceil(lead / 1000)}` : timed ? `${Math.ceil(left / 1000)} seconds left` : `Rep ${rep} of ${s.reps}`

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative my-5 grid place-items-center" role="timer" aria-label={label}>
        <svg width="280" height="280" className="-rotate-90">
          <circle cx="140" cy="140" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
          <circle cx="140" cy="140" r={R} fill="none" stroke={accent} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, frac))} style={{ transition: !working ? 'stroke 0.3s' : timed ? 'stroke-dashoffset 0.1s linear, stroke .3s' : 'stroke 0.3s' }} />
        </svg>
        <div className="absolute grid place-items-center">
          {!working ? (
            <>
              <span className="text-sm font-semibold text-muted">Get ready</span>
              <span className="font-num text-8xl font-bold">{Math.max(1, Math.ceil(lead / 1000))}</span>
            </>
          ) : timed ? (
            <span className={`font-num text-7xl font-bold ${left <= 3000 ? 'text-warn' : ''}`}>{fmtDuration(Math.ceil(left / 1000))}</span>
          ) : (
            <>
              <span className="text-sm font-semibold text-muted">Rep</span>
              <m.span key={rep} initial={{ scale: 1.25, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }} className="font-num text-8xl font-bold">{rep}</m.span>
              <span className="text-sm font-semibold text-muted">of {s.reps}</span>
            </>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{working && left <= 0 ? 'Set complete' : ''}</p>

      {!timed && (
        <div className="mb-4 grid w-full grid-cols-2 gap-3">
          <Stepper label="Weight" unit={units} value={toDisplay(s.weightKg, units)} step={units === 'kg' ? 2.5 : 5} decimals={1} onChange={(v) => s.adjust({ weightKg: fromDisplay(v, units) })} />
          <Stepper label="Reps" value={s.reps} step={1} onChange={(v) => !working && s.adjust({ reps: Math.max(1, Math.round(v)) })} />
        </div>
      )}
      <ul className="mb-4 flex flex-wrap justify-center gap-2">{EXERCISE_MAP[it.exerciseId]?.cues.map((c) => <li key={c} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">{c}</li>)}</ul>

      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        <Button onClick={s.togglePause}>{s.pausedAt ? <Play size={16} /> : <Pause size={16} />} {s.pausedAt ? 'Resume' : 'Pause'}</Button>
        <Button onClick={() => s.completeSet(timed ? 0 : Math.max(0, working ? rep - (left > 0 ? 1 : 0) : 0))} disabled={!working || (!timed && rep <= 1 && elapsed < tempo * 1000)}>Finish set</Button>
        <Button onClick={s.skipExercise}><SkipForward size={16} /> Skip</Button>
        <Button onClick={s.undoLast} disabled={s.logged.length === 0}><Undo2 size={16} /> Undo</Button>
      </div>
      <p className="mt-3 text-xs text-muted">Sets start and rest automatically. Use Finish set if you stop early.</p>
    </div>
  )
}

function Rest({ upcoming }: { upcoming?: string }) {
  const s = useSession()
  const ms = useRemaining(s.restStart, s.restTotal, s.pausedAt, true)
  const secs = Math.ceil(ms / 1000)
  const [announce, setAnnounce] = useState('')
  const done = useRef(false)
  useEffect(() => {
    if (ms <= 0 && !done.current && !s.pausedAt) {
      done.current = true
      feedback('done')
      setAnnounce('Rest complete')
      useSession.getState().skipRest()
    }
  }, [ms, s.pausedAt])
  const R = 120
  const C = 2 * Math.PI * R
  const frac = s.restTotal > 0 ? ms / s.restTotal : 0
  const urgent = secs <= 5
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm font-semibold text-muted">Rest</p>
      <div className="relative my-6 grid place-items-center" role="timer" aria-label={`${secs} seconds of rest left`}>
        <svg width="280" height="280" className="-rotate-90">
          <circle cx="140" cy="140" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
          <circle cx="140" cy="140" r={R} fill="none" stroke={urgent ? 'var(--warn)' : 'var(--accent)'} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }} />
        </svg>
        <div className="absolute grid place-items-center">
          <span className={`font-num text-7xl font-bold ${urgent ? 'text-warn' : ''}`}>{fmtDuration(secs)}</span>
        </div>
      </div>
      <p aria-live="polite" className="sr-only">{announce}</p>
      <div className="mb-6 w-full rounded-3xl bg-surface-2 px-5 py-4 text-left">
        <p className="text-xs font-semibold text-muted">Up next</p>
        <p className="font-bold">{upcoming ?? 'Finish'}</p>
      </div>
      <div className="grid w-full grid-cols-2 gap-3">
        <Button onClick={s.togglePause}>{s.pausedAt ? <Play size={16} /> : <Pause size={16} />} {s.pausedAt ? 'Resume' : 'Pause'}</Button>
        <Button variant="primary" onClick={s.skipRest}>Skip rest</Button>
      </div>
    </div>
  )
}

function Preview() {
  const s = useSession()
  const nav = useNavigate()
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold capitalize text-muted">{s.type} session</p>
      <h1 className="font-display mb-6 text-4xl font-bold">{s.name}</h1>
      <div className="space-y-2">
        {s.items.map((i, k) => (
          <m.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }}>
            <Card className="flex items-center justify-between !p-4">
              <span className="font-semibold">{i.name}</span>
              <span className="text-sm text-muted">{i.sets} × {i.seconds ? `${i.seconds}s` : i.reps}</span>
            </Card>
          </m.div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <Button size="lg" variant="primary" className="flex-1" onClick={s.begin}><Play size={18} fill="currentColor" /> Begin</Button>
        <Button size="lg" onClick={() => { s.reset(); nav(-1) }}>Cancel</Button>
      </div>
    </div>
  )
}

function Summary() {
  const s = useSession()
  const units = useSettings((x) => x.units)
  const nav = useNavigate()
  const done = s.logged.filter((l) => l.status === 'done')
  const vol = volume(done)
  const secs = Math.round((Date.now() - s.startedAt) / 1000)
  const dur = Math.max(1, Math.round(((s.logged[s.logged.length - 1]?.completedAt ?? Date.now()) - s.startedAt) / 60000))
  void secs
  return (
    <div className="mx-auto max-w-xl text-center">
      <m.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto mb-5 grid size-24 place-items-center rounded-full bg-accent text-accent-fg">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><m.path d="M5 12.5l4.5 4.5L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.25 }} /></svg>
      </m.div>
      <h1 className="font-display text-4xl font-bold">Nice work.</h1>
      <p className="mt-1 text-muted">{s.name} is saved on this device.</p>
      <div className="my-8 grid grid-cols-3 gap-3">
        <Card className="!p-4"><p className="font-num text-3xl font-bold"><CountUp value={dur} /></p><p className="text-xs text-muted">minutes</p></Card>
        <Card className="!p-4"><p className="font-num text-3xl font-bold"><CountUp value={done.length} /></p><p className="text-xs text-muted">sets done</p></Card>
        <Card className="!p-4"><p className="font-num text-3xl font-bold"><CountUp value={Math.round(toDisplay(vol, units))} /></p><p className="text-xs text-muted">{units} volume</p></Card>
      </div>
      {s.prs.map((p) => (
        <div key={p.exerciseId} className="shimmer mb-3 flex items-center gap-3 rounded-3xl border border-accent bg-surface p-4 text-left">
          <Trophy className="text-accent-ink" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">New PR</p>
            <p className="font-semibold">{EXERCISE_MAP[p.exerciseId]?.name} · est. 1RM {round1(toDisplay(p.value, units))} {units}</p>
          </div>
        </div>
      ))}
      <SummaryAi />
      <div className="flex gap-3">
        <Button size="lg" variant="primary" className="flex-1" onClick={() => { s.reset(); nav('/') }}>Done</Button>
        <LinkButton to="/progress" className="!min-h-14">Progress</LinkButton>
      </div>
    </div>
  )
}

function SummaryAi() {
  const s = useSession()
  const has = useLiveQuery(async () => !!(await db.aiKey.get('key')), [])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!has) return null
  const run = async () => {
    setBusy(true); setErr('')
    try {
      const done = s.logged.filter((l) => l.status === 'done')
      setText(await workoutSummary({ name: s.name, type: s.type, minutes: Math.max(1, Math.round((Date.now() - s.startedAt) / 60000)), sets: done.map((d) => ({ exercise: EXERCISE_MAP[d.exerciseId]?.name ?? d.exerciseId, reps: d.reps, kg: d.weightKg })) }))
    } catch (e) { setErr(aiMessage(e)) } finally { setBusy(false) }
  }
  return (
    <div className="mb-4 rounded-3xl border border-line bg-surface p-4 text-left">
      {text ? <p className="text-sm font-medium">{text}</p> : <Button onClick={run} disabled={busy}>{busy ? 'Summarising…' : 'Summarise with AI'}</Button>}
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-warn">{err}</p>}
    </div>
  )
}
