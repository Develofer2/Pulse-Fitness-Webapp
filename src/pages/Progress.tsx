import { lazy, Suspense, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Lock, Trophy } from 'lucide-react'
import { db } from '../lib/db'
import { Button, Card, CountUp, Empty, Field, PageHeader, useToast } from '../components/ui'
import { achievements, addDays, dateKey, est1RM, fromDisplay, parseKey, round1, streak, toDisplay, weekStart } from '../lib/domain'
import { useSettings } from '../lib/store'
import { EXERCISE_MAP } from '../lib/exercises'
import Photos from '../components/Photos'
import AiAssistant from '../components/AiAssistant'

const Charts = lazy(() => import('./Charts'))

export default function Progress() {
  const units = useSettings((s) => s.units)
  const { toast, node } = useToast()
  const [shown, setShown] = useState(10)
  const [f, setF] = useState({ weight: '', waist: '', chest: '', hip: '', arm: '', thigh: '' })
  const data = useLiveQuery(async () => {
    const [workouts, sets, metrics, entries, unlocked] = await Promise.all([db.workouts.toArray(), db.sets.toArray(), db.metrics.orderBy('date').toArray(), db.entries.toArray(), db.achievements.toArray()])
    return { workouts, sets, metrics, entries, unlocked }
  }, [])
  if (!data) return <div className="h-64" aria-busy />
  const { workouts, sets, metrics, entries } = data
  const completed = workouts.filter((w) => w.status === 'completed')

  // weight trend + 7 entry moving average
  const weighted = metrics.filter((m) => m.weightKg)
  const weight = weighted.map((m, i) => {
    const win = weighted.slice(Math.max(0, i - 6), i + 1)
    const avg = win.reduce((a, x) => a + x.weightKg!, 0) / win.length
    return { d: m.date.slice(5), w: round1(toDisplay(m.weightKg!, units)), avg: round1(toDisplay(avg, units)) }
  })
  // weekly volume, last 8 weeks
  const thisWeek = weekStart()
  const volume = Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(thisWeek, (i - 7) * 7)
    const v = completed.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)).reduce((a, w) => a + w.volume, 0)
    return { d: ws.slice(5), v: Math.round(toDisplay(v, units)) }
  })
  // PRs
  const bestBy = new Map<string, { v: number; at: number }>()
  sets.forEach((s) => {
    if (s.status !== 'done') return
    const v = est1RM(s.weightKg, s.reps)
    if (v > (bestBy.get(s.exerciseId)?.v ?? 0)) bestBy.set(s.exerciseId, { v, at: s.completedAt })
  })
  const prs = [...bestBy.entries()].sort((a, b) => b[1].at - a[1].at)
  const st = streak(workouts, entries)
  const ach = achievements({ sessions: completed.length, streak: st.count, prs: prs.length > 0 && completed.length > 1 ? 1 : 0, scanned: entries.filter((e) => e.source === 'barcode').length, metrics: weighted.length })
  const unlockedRows = data.unlocked
  const totalVol = completed.reduce((a, w) => a + w.volume, 0)

  // persist unlock dates the first time an achievement is earned
  const stored = new Set(unlockedRows.map((r) => r.id))
  ach.filter((a) => a.unlocked && !stored.has(a.id)).forEach((a) => void db.achievements.put({ id: a.id, unlockedAt: Date.now() }))
  const dateOf = (id: string) => unlockedRows.find((r) => r.id === id)?.unlockedAt
  const recent = [...completed].sort((a, b) => b.startedAt - a.startedAt)

  const save = async () => {
    const n = (v: string) => (v && Number.isFinite(parseFloat(v)) ? parseFloat(v) : undefined)
    const w = n(f.weight)
    if (w !== undefined && (w <= 0 || fromDisplay(w, units) > 1000)) return toast('Enter a weight between 0 and 1000')
    const date = dateKey()
    const prev = await db.metrics.where('date').equals(date).first()
    const row = { date, weightKg: w !== undefined ? fromDisplay(w, units) : prev?.weightKg, waist: n(f.waist) ?? prev?.waist, chest: n(f.chest) ?? prev?.chest, hip: n(f.hip) ?? prev?.hip, arm: n(f.arm) ?? prev?.arm, thigh: n(f.thigh) ?? prev?.thigh }
    if (prev) await db.metrics.update(prev.id!, row)
    else await db.metrics.add(row)
    setF({ weight: '', waist: '', chest: '', hip: '', arm: '', thigh: '' })
    toast('Check-in saved')
  }

  return (
    <div>
      <PageHeader title="Progress" sub="Everything here is calculated from your logs." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: 'Sessions', v: completed.length, d: 0 },
          { l: 'Day streak', v: st.count, d: 0 },
          { l: `Total volume (${units})`, v: Math.round(toDisplay(totalVol, units)), d: 0 },
          { l: 'Personal records', v: prs.length, d: 0 },
        ].map((x) => (
          <Card key={x.l} className="!p-4"><p className="font-num text-3xl font-bold"><CountUp value={x.v} decimals={x.d} /></p><p className="text-xs text-muted">{x.l}</p></Card>
        ))}
      </div>

      <div className="mb-4"><AiAssistant scope="progress" title="Progress insights" intro="Reads your weight trend, measurements, weekly volume, consistency and records." onToast={toast}
        prompts={['What do my trends say?', 'Why might my weight have stalled?', 'Is my training volume going up?', 'Which lifts are improving fastest?']} /></div>

      <Card className="mb-4">
        <h2 className="font-display mb-4 text-lg font-bold">Trends</h2>
        {weight.length === 0 && completed.length === 0 ? (
          <Empty text="No data yet. Log a check-in or finish a session to see charts." />
        ) : (
          <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-surface-2" />}>
            <Charts weight={weight.length ? weight : [{ d: '–', w: 0, avg: 0 }]} volume={volume} />
          </Suspense>
        )}
        <details className="mt-4 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">Data table</summary>
          <p className="mb-2 text-muted">
            {weight.length ? `Latest weight ${weight[weight.length - 1].w} ${units}, 7-entry average ${weight[weight.length - 1].avg} ${units}.` : 'No weight entries yet.'} Weekly volume for the last 8 weeks:
          </p>
          <table className="w-full text-left"><thead><tr className="text-muted"><th className="py-1">Week of</th><th>Volume ({units})</th></tr></thead>
            <tbody>{volume.map((v) => <tr key={v.d} className="border-t border-line"><td className="py-1.5">{parseKey(`${new Date().getFullYear()}-${v.d}`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td>{v.v}</td></tr>)}</tbody></table>
        </details>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display mb-3 text-lg font-bold">Body check-in</h2>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <Field id="bw" label={`Weight (${units})`} inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              {(['waist', 'chest', 'hip', 'arm', 'thigh'] as const).map((k) => (
                <Field key={k} id={`m-${k}`} label={`${k[0].toUpperCase() + k.slice(1)} (cm)`} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              ))}
            </div>
            <Button type="submit" variant="primary" className="w-full">Save today's check-in</Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><Trophy size={18} /> Personal records</h2>
          {prs.length === 0 ? <Empty text="No records yet. Complete a weighted set to start." /> : (
            <ul className="divide-y divide-line">
              {prs.slice(0, 8).map(([id, p]) => (
                <li key={id} className="flex items-center justify-between gap-3 py-2.5"><span className="truncate font-semibold">{EXERCISE_MAP[id]?.name}</span><span className="font-num shrink-0 font-bold">{round1(toDisplay(p.v, units))} {units}</span></li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Estimated 1RM, Epley formula, sets up to 12 reps.</p>
        </Card>
      </div>

      <div className="mt-4"><Photos onError={toast} /></div>

      <Card className="mt-4">
        <h2 className="font-display mb-3 text-lg font-bold">History</h2>
        {recent.length === 0 ? <Empty text="No workouts yet. Start a 20-minute full body session." /> : (
          <ul className="divide-y divide-line">
            {recent.slice(0, shown).map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><p className="truncate font-semibold">{w.name}</p><p className="text-xs capitalize text-muted">{w.date} · {w.type} · {Math.max(1, Math.round((w.endedAt - w.startedAt) / 60000))} min</p></div>
                <span className="font-num shrink-0 font-bold">{Math.round(toDisplay(w.volume, units))} {units}</span>
              </li>
            ))}
          </ul>
        )}
        {recent.length > shown && <Button className="mt-3 w-full" onClick={() => setShown(shown + 20)}>Load more</Button>}
      </Card>

      <h2 className="font-display mb-3 mt-8 text-xl font-bold">Achievements</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ach.map((a) => (
          <Card key={a.id} className={`!p-4 ${a.unlocked ? '' : 'border-dashed'}`}>
            <span className={`mb-3 grid size-9 place-items-center rounded-full ${a.unlocked ? 'bg-accent text-accent-fg' : 'bg-surface-2'}`}>{a.unlocked ? <Check size={18} /> : <Lock size={16} />}</span>
            <p className="font-bold">{a.label}</p><p className="text-xs text-muted">{a.unlocked ? `Unlocked${dateOf(a.id) ? ' ' + new Date(dateOf(a.id)!).toLocaleDateString() : ''}` : a.hint}</p>
          </Card>
        ))}
      </div>
      {node}
    </div>
  )
}
