import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { m } from 'motion/react'
import { Sparkles, Archive, Copy, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react'
import { db, type Template } from '../lib/db'
import { Button, Card, Chips, Empty, Field, LinkButton, PageHeader, Sheet, useToast } from '../components/ui'
import { registerCustom, defaultsFor, estimateMinutes, EQUIPMENT, EXERCISES, EXERCISE_MAP, MUSCLES, SESSION_TYPES, type Difficulty, type SessionType, type TemplateExercise } from '../lib/exercises'
import { useSession, useSettings } from '../lib/store'
import AiAssistant from '../components/AiAssistant'
import { aiMessage, suggestSession } from '../lib/ai'
import { useLiveQuery as useLQ } from 'dexie-react-hooks'

const AiGateLazy = lazy(() => import('./Ai').then((m) => ({ default: m.PlannerGated })))

export function TrainHome() {
  const nav = useNavigate()
  const prepare = useSession((s) => s.prepare)
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.archived).toArray(), [])
  const start = async (t: Template) => { await prepare(t); nav('/session') }
  const [plan, setPlan] = useState(false)
  const { toast, node } = useToast()
  return (
    <div>
      <PageHeader title="Train" sub="Pick a template or build something new." action={<LinkButton to="/train/build" variant="primary"><Plus size={16} /> Build</LinkButton>} />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        <LinkButton to="/train/build" className="!min-h-20 !justify-start !rounded-3xl !px-5 !text-base">Session builder</LinkButton>
        <LinkButton to="/train/library" className="!min-h-20 !justify-start !rounded-3xl !px-5 !text-base">Exercise library</LinkButton>
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto]">
        <AiAssistant scope="train" title="Training coach" intro="Reads your last 8 weeks of sessions, sets and weights." prompts={["How is my training going?", "What should I lift next session?", "Am I recovering enough between sessions?", "Build me a session for today"]} onToast={toast} />
        <Card className="flex flex-col justify-between gap-3 lg:w-72">
          <div><p className="flex items-center gap-2 font-display text-lg font-bold"><Sparkles size={18} className="text-accent-ink" /> Plan generator</p><p className="mt-1 text-sm text-muted">A multi-week plan built from your goal, equipment and schedule, saved as templates.</p></div>
          <Button variant="primary" onClick={() => setPlan(true)}>Generate a plan</Button>
        </Card>
      </div>
      <Sheet open={plan} onClose={() => setPlan(false)} title="Plan generator"><Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}><AiGateLazy /></Suspense></Sheet>
      {node}
      <h2 className="mb-3 font-display text-xl font-bold">Templates</h2>
      {templates && templates.length === 0 && <Empty text="No templates yet. Build a 20-minute full body session." action={<LinkButton to="/train/build" variant="primary">Build session</LinkButton>} />}
      <div className="grid gap-3 md:grid-cols-2">
        {templates?.map((t, i) => (
          <m.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold">{t.name}</h3>
                  <p className="text-sm capitalize text-muted">{t.type} · {t.exercises.length} exercises · ~{estimateMinutes(t.exercises)} min</p>
                </div>
                <div className="flex gap-1">
                  <Link aria-label={`Edit ${t.name}`} to={`/train/build?edit=${t.id}`} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2"><Pencil size={17} /></Link>
                  <button aria-label={`Duplicate ${t.name}`} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => db.templates.add({ ...t, id: undefined, name: `${t.name} copy`, createdAt: Date.now() })}><Copy size={17} /></button>
                  <button aria-label={`Archive ${t.name}`} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => db.templates.update(t.id!, { archived: true })}><Archive size={17} /></button>
                </div>
              </div>
              <p className="truncate text-sm text-muted">{t.exercises.map((e) => EXERCISE_MAP[e.exerciseId]?.name).join(', ')}</p>
              <Button variant="primary" onClick={() => start(t)}><Play size={15} fill="currentColor" /> Start</Button>
            </Card>
          </m.div>
        ))}
      </div>
    </div>
  )
}

export function Library() {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<string>('')
  const [equip, setEquip] = useState<string>('')
  const [diff, setDiff] = useState<Difficulty | ''>('')
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [tick, setTick] = useState(0)
  const list = useMemo(
    () => EXERCISES.filter((e) => (!q || e.name.toLowerCase().includes(q.toLowerCase())) && (!muscle || e.muscles.includes(muscle)) && (!equip || (equip === 'none' ? e.equipment.length === 0 : e.equipment.includes(equip))) && (!diff || e.difficulty === diff)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, muscle, equip, diff, tick],
  )
  const toggle = <T extends string>(cur: T, v: T, set: (x: T) => void) => set(cur === v ? ('' as T) : v)
  const ex = open ? EXERCISE_MAP[open] : null
  return (
    <div>
      <PageHeader title="Library" sub={`${list.length} exercises`} action={<Button onClick={() => setCreating(true)}><Plus size={16} /> Create</Button>} />
      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-2xl border border-line bg-surface pl-11 pr-4 outline-none focus:border-accent-ink" />
      </div>
      <div className="mb-6 space-y-3">
        <Chips label="Muscle" options={MUSCLES.map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={muscle} onChange={(v) => toggle(muscle, v, setMuscle)} />
        <Chips label="Equipment" options={[{ id: 'none', label: 'No equipment' }, ...EQUIPMENT.map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))]} value={equip} onChange={(v) => toggle(equip, v, setEquip)} />
        <Chips<Difficulty> label="Difficulty" options={(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={diff as Difficulty} onChange={(v) => setDiff(diff === v ? '' : v)} />
      </div>
      {list.length === 0 && <Empty text="No exercises match those filters." action={<Button onClick={() => { setQ(''); setMuscle(''); setEquip(''); setDiff('') }}>Clear filters</Button>} />}
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((e) => (
          <button key={e.id} onClick={() => setOpen(e.id)} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 text-left transition-colors [contain-intrinsic-size:auto_64px] [content-visibility:auto] hover:bg-surface-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{e.name}</span>
              <span className="block truncate text-xs capitalize text-muted">{e.muscles.join(', ')} · {e.equipment.join(', ') || 'no equipment'}</span>
            </span>
            <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold capitalize">{e.difficulty}</span>
          </button>
        ))}
      </div>
      <CreateExercise open={creating} onClose={() => setCreating(false)} onCreated={() => setTick((t) => t + 1)} />
      <Sheet open={!!ex} onClose={() => setOpen(null)} title={ex?.name ?? ''}>
        {ex && (
          <div className="space-y-4">
            <p className="text-sm capitalize text-muted">{ex.muscles.join(', ')} · {ex.difficulty} · {ex.equipment.join(', ') || 'no equipment'}</p>
            <ul className="space-y-2">{ex.cues.map((c) => <li key={c} className="rounded-2xl bg-surface-2 px-4 py-3 text-sm font-medium">{c}</li>)}</ul>
          </div>
        )}
      </Sheet>
    </div>
  )
}

export function Builder() {
  const nav = useNavigate()
  const equipment = useSettings((s) => s.equipment)
  const prepare = useSession((s) => s.prepare)
  const [type, setType] = useState<SessionType>('strength')
  const [len, setLen] = useState(30)
  const [muscle, setMuscle] = useState('')
  const [name, setName] = useState('')
  const [items, setItems] = useState<TemplateExercise[]>([])
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const hasKey = useLQ(async () => !!(await db.aiKey.get('key')), [])
  const [params] = useSearchParams()
  const editId = params.get('edit') ? Number(params.get('edit')) : null
  useEffect(() => {
    if (!editId) return
    void db.templates.get(editId).then((t) => { if (t) { setType(t.type); setName(t.name); setItems(t.exercises) } })
  }, [editId])

  const suggest = (t = type, minutes = len, mu = muscle) => {
    const pool = EXERCISES.filter((e) => (t === 'custom' || e.types.includes(t)) && (!mu || e.muscles.includes(mu)) && (equipment.length === 0 || e.equipment.length === 0 || e.equipment.some((q) => equipment.includes(q))))
    const shuffled = [...pool].sort((a, b) => (a.id > b.id ? 1 : -1))
    const out: TemplateExercise[] = []
    for (const ex of shuffled) {
      if (estimateMinutes(out) >= minutes) break
      out.push(defaultsFor(t, ex))
    }
    setItems(out)
  }
  const mins = estimateMinutes(items)
  const patch = (i: number, p: Partial<TemplateExercise>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const label = name || `${SESSION_TYPES.find((s) => s.id === type)!.label} ${len} min`
  const save = async () => {
    if (editId) { await db.templates.update(editId, { name: label, type, exercises: items }); return editId }
    const id = await db.templates.add({ name: label, type, exercises: items, archived: false, createdAt: Date.now() })
    return id
  }
  const filtered = EXERCISES.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div>
      <PageHeader title={editId ? 'Edit template' : 'Build session'} sub="Choose a type and length, then fine-tune." />
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Type</h2>
          <Chips<SessionType> label="Session type" options={SESSION_TYPES} value={type} onChange={(v) => { setType(v); suggest(v) }} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Length</h2>
          <Chips label="Length" options={[15, 30, 45, 60].map((n) => ({ id: String(n), label: `${n} min` }))} value={String(len)} onChange={(v) => { setLen(+v); suggest(type, +v) }} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">Target muscle (optional)</h2>
          <Chips label="Muscle" options={MUSCLES.map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={muscle} onChange={(v) => { const n = muscle === v ? '' : v; setMuscle(n); suggest(type, len, n) }} />
        </section>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => suggest()}>Suggest exercises</Button>
          <Button disabled={aiBusy} onClick={async () => {
            setAiBusy(true); setAiErr('')
            try { const p = await suggestSession({ type, minutes: len, muscle }); setItems(p.exercises); if (!name) setName(p.name) } catch (e) { setAiErr(aiMessage(e)) } finally { setAiBusy(false) }
          }}><Sparkles size={16} /> {aiBusy ? 'Building from your history…' : 'Suggest with AI'}</Button>
          <Button onClick={() => setAdding(true)}><Plus size={16} /> Add exercise</Button>
        </div>

        {aiErr && <p role="alert" className="text-sm font-semibold text-warn">{aiErr}</p>}
        {hasKey === false && <p className="text-sm text-muted">Tip: connect an AI key in Settings to build sessions from your own training history.</p>}
        {items.length === 0 ? (
          <Empty text="No exercises yet. Tap Suggest exercises to fill this session." />
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted">About {mins} min · {items.length} exercises</p>
            {items.map((it, i) => (
              <m.div layout key={`${it.exerciseId}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="!p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-bold">{EXERCISE_MAP[it.exerciseId].name}</h3>
                    <button aria-label="Remove exercise" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={17} /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <Num label="Sets" value={it.sets} min={1} onChange={(v) => patch(i, { sets: v })} />
                    {it.seconds > 0 ? <Num label="Seconds" value={it.seconds} min={5} step={5} onChange={(v) => patch(i, { seconds: v })} /> : <Num label="Reps" value={it.reps} min={1} onChange={(v) => patch(i, { reps: v })} />}
                    <Num label="Rest (s)" value={it.rest} min={0} step={5} onChange={(v) => patch(i, { rest: v })} />
                  </div>
                </Card>
              </m.div>
            ))}
            <Field id="tname" label="Name" placeholder={label} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <div className="flex flex-wrap gap-2">
              <Button size="lg" variant="primary" onClick={async () => { const id = await save(); await prepare({ id, name: label, type, exercises: items }); nav('/session') }}>Save and start</Button>
              <Button size="lg" onClick={async () => { await save(); nav('/train') }}>Save template</Button>
            </div>
          </div>
        )}
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add exercise">
        <input aria-label="Search" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-3 w-full rounded-2xl border border-line bg-surface-2 px-4" />
        <div className="space-y-2">
          {filtered.map((e) => (
            <button key={e.id} className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-left font-semibold" onClick={() => { setItems([...items, defaultsFor(type, e)]); setAdding(false) }}>
              <span className="truncate">{e.name}</span><Plus size={16} />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function Num({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; step?: number }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted">{label}</p>
      <div className="flex items-center rounded-xl bg-surface-2">
        <button aria-label={`Decrease ${label}`} className="size-11 text-lg font-bold" onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <span className="font-num flex-1 text-center font-bold">{value}</span>
        <button aria-label={`Increase ${label}`} className="size-11 text-lg font-bold" onClick={() => onChange(value + step)}>+</button>
      </div>
    </div>
  )
}

function CreateExercise({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [muscles, setMuscles] = useState<string[]>([])
  const [equipment, setEquipment] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')
  const [timed, setTimed] = useState(false)
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  return (
    <Sheet open={open} onClose={onClose} title="Create exercise">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault()
        const c = { id: `custom-${Date.now()}`, name: name.trim().slice(0, 60), muscles: muscles.length ? muscles : ['core'], equipment, difficulty, cues: [], timed }
        await db.customExercises.add(c)
        registerCustom(c)
        setName(''); setMuscles([]); setEquipment([]); onCreated(); onClose()
      }}>
        <Field id="cn" label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
        <div><p className="mb-2 text-sm font-semibold">Muscles</p><Chips label="Muscles" options={MUSCLES.map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={muscles} onChange={(v) => setMuscles(toggle(muscles, v))} /></div>
        <div><p className="mb-2 text-sm font-semibold">Equipment</p><Chips label="Equipment" options={EQUIPMENT.map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={equipment} onChange={(v) => setEquipment(toggle(equipment, v))} /></div>
        <div><p className="mb-2 text-sm font-semibold">Difficulty</p><Chips<Difficulty> label="Difficulty" options={(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={difficulty} onChange={setDifficulty} /></div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="!min-h-0 size-5" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Timed hold or interval</label>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!name.trim()}>Save exercise</Button>
      </form>
    </Sheet>
  )
}
