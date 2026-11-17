import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { m } from 'motion/react'
import { Flame, Play, Snowflake, Sparkles, Target } from 'lucide-react'
import { db } from '../lib/db'
import { useEffect } from 'react'
import { Button, Card, CountUp, Ring, useToast } from '../components/ui'
import { dateKey, macroTotals, streak, weekStart, addDays } from '../lib/domain'
import { useSession, useSettings } from '../lib/store'
import { estimateMinutes } from '../lib/exercises'

export default function HomePage() {
  const nav = useNavigate()
  const s = useSettings()
  const prepare = useSession((x) => x.prepare)
  const { toast, node } = useToast()
  const data = useLiveQuery(async () => {
    const [workouts, entries, templates] = await Promise.all([
      db.workouts.orderBy('startedAt').reverse().toArray(),
      db.entries.toArray(),
      db.templates.filter((t) => !t.archived).toArray(),
    ])
    return { workouts, entries, templates }
  }, [])
  const weekDone = data ? data.workouts.filter((w) => w.status === 'completed' && w.date >= weekStart() && w.date <= addDays(weekStart(), 6)).length : 0
  const reached = !!data && weekDone >= s.weeklyTarget
  useEffect(() => {
    const k = `pulse-celebrated-${weekStart()}`
    if (reached && !localStorage.getItem(k)) { localStorage.setItem(k, '1'); toast(`Nice work. ${weekDone} sessions this week.`) }
  }, [reached, weekDone, toast])
  if (!data) return <div className="h-64" aria-busy />
  const { workouts, entries, templates } = data
  const today = dateKey()
  const last = workouts.find((w) => w.status === 'completed')
  const suggested = templates.find((t) => t.id === last?.templateId) ?? templates[0]
  const wk = weekStart()
  const weekSessions = workouts.filter((w) => w.status === 'completed' && w.date >= wk && w.date <= addDays(wk, 6)).length
  const st = streak(workouts, entries)
  const t = macroTotals(entries.filter((e) => e.date === today))
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const insight =
    weekSessions >= s.weeklyTarget
      ? `Nice work. ${weekSessions} sessions this week.`
      : weekSessions === 0
        ? 'A short session today sets the tone for the week.'
        : `${s.weeklyTarget - weekSessions} more ${s.weeklyTarget - weekSessions === 1 ? 'session' : 'sessions'} to reach your weekly goal.`

  const start = async () => {
    if (!suggested) return nav('/train')
    await prepare(suggested)
    nav('/session')
  }
  const stagger = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.05, duration: 0.3 } })

  return (
    <div>
      <p className="text-sm font-semibold text-muted">{greet}</p>
      <h1 className="font-display mb-6 text-3xl font-bold tracking-tight md:text-4xl">Ready to move?</h1>
      <div className="grid gap-4 md:grid-cols-2 min-[1440px]:grid-cols-3">
        <m.div {...stagger(0)} className="md:col-span-2 min-[1440px]:col-span-2">
          <div className="relative overflow-hidden rounded-[2rem] bg-accent p-6 text-accent-fg md:p-8">
            <div aria-hidden className="absolute -right-10 -top-10 size-56 rounded-full bg-black/10 blur-2xl" />
            <p className="text-sm font-bold uppercase tracking-wider opacity-70">Today's session</p>
            <h2 className="font-display mt-2 text-3xl font-bold md:text-4xl">{suggested?.name ?? 'Build your first session'}</h2>
            {suggested && (
              <p className="mt-1 text-sm font-semibold opacity-70">
                {suggested.exercises.length} exercises · about {estimateMinutes(suggested.exercises)} min
              </p>
            )}
            <button onClick={start} className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-black px-7 text-lg font-bold text-white transition-transform active:scale-[0.97]">
              <Play size={18} fill="currentColor" /> Start session
            </button>
          </div>
        </m.div>

        <m.div {...stagger(1)}>
          <Card className="flex h-full items-center gap-5">
            <Ring value={weekSessions / s.weeklyTarget} size={104} label={`${weekSessions} of ${s.weeklyTarget} sessions this week`}>
              <div className="font-num text-2xl font-bold"><CountUp value={weekSessions} />/{s.weeklyTarget}</div>
            </Ring>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-muted"><Target size={16} /> Weekly goal</p>
              <p className="mt-1 font-semibold">{weekSessions} of {s.weeklyTarget} sessions</p>
              <Link to="/settings" className="text-sm font-semibold text-accent-ink">Edit goal</Link>
            </div>
          </Card>
        </m.div>

        <m.div {...stagger(2)}>
          <Card className="h-full">
            <p className="flex items-center gap-2 text-sm font-semibold text-muted"><Flame size={16} /> Streak</p>
            <p className="font-num mt-2 text-5xl font-bold"><CountUp value={st.count} /><span className="ml-2 text-base font-semibold text-muted">days</span></p>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Snowflake size={15} /> {st.freezesLeft} freeze available</p>
          </Card>
        </m.div>

        <m.div {...stagger(3)}>
          <Card className="h-full">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted">Today's nutrition</p>
              <Link to="/nutrition" className="text-sm font-semibold text-accent-ink">Log food</Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="font-num text-3xl font-bold"><CountUp value={t.kcal} /></p>
                <p className="text-xs text-muted">of {s.kcalTarget} kcal</p>
              </div>
              <div>
                <p className="font-num text-3xl font-bold"><CountUp value={t.protein} />g</p>
                <p className="text-xs text-muted">of {s.proteinTarget}g protein</p>
              </div>
            </div>
          </Card>
        </m.div>

        <m.div {...stagger(4)} className="md:col-span-2 min-[1440px]:col-span-3">
          <Card className="flex items-center gap-3 !p-4">
            <Sparkles size={18} className="shrink-0 text-accent-ink" />
            <p className="text-sm font-semibold">{insight}</p>
            <Button variant="ghost" className="ml-auto" onClick={() => nav('/ai')}>Ask AI</Button>
            <Button variant="ghost" onClick={() => nav('/train/build')}>Build</Button>
          </Card>
        </m.div>
      </div>
      {node}
    </div>
  )
}
