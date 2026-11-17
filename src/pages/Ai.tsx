import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { Bot, Send, Trash2, TriangleAlert } from 'lucide-react'
import { db, type AiMessage } from '../lib/db'
import { Button, Card, Chips, Field, PageHeader, useToast } from '../components/ui'
import { aiMessage, coachAsk, generatePlan, saveConversation, type Plan, type PlanInput, type Proposal } from '../lib/ai'
import { EXERCISE_MAP, estimateMinutes } from '../lib/exercises'
import { useSettings } from '../lib/store'

type Tab = 'coach' | 'planner' | 'history'

export function AiGate({ children, feature }: { children: ReactNode; feature: string }) {
  const has = useLiveQuery(async () => !!(await db.aiKey.get('key')), [])
  if (has === undefined) return null
  if (has) return <>{children}</>
  return (
    <Card>
      <Bot className="mb-3 text-accent-ink" />
      <h2 className="font-display text-lg font-bold">{feature} needs an AI key</h2>
      <p className="mt-1 text-sm text-muted">Connect your own provider key to use this. Everything else in Pulse still works, online or offline.</p>
      <Link to="/settings#ai-connection" className="mt-4 inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 text-sm font-bold text-accent-fg">Open AI connection</Link>
    </Card>
  )
}

const Disclaimer = () => <p className="mt-3 flex items-start gap-2 text-xs text-muted"><TriangleAlert size={14} className="mt-0.5 shrink-0" />General fitness information, not medical advice. Check with a professional if you have an injury or condition.</p>

export default function AiPage() {
  const [tab, setTab] = useState<Tab>('coach')
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="AI" sub="General coach and history. Focused help lives inside Train, Food and Progress." />
      <div className="mb-6">
        <Chips<Tab> label="AI feature" options={[{ id: 'coach', label: 'Coach' }, { id: 'planner', label: 'Plan generator' }, { id: 'history', label: 'History' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'history' ? <History /> : (
        <AiGate feature={tab === 'coach' ? 'AI coach' : 'The plan generator'}>
          {tab === 'coach' && <Coach />}
          {tab === 'planner' && <Planner />}
        </AiGate>
      )}
      <Disclaimer />
    </div>
  )
}

function Coach() {
  const [msgs, setMsgs] = useState<AiMessage[]>([])
  const [props, setProps] = useState<Record<number, Proposal>>({})
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const conv = useRef<number | undefined>(undefined)
  const { toast, node } = useToast()
  const send = async () => {
    if (!q.trim() || busy) return
    const next = [...msgs, { role: 'user' as const, content: q.trim().slice(0, 1000) }]
    setMsgs(next); setQ(''); setBusy(true); setErr('')
    try {
      const r = await coachAsk(next)
      const all = [...next, { role: 'assistant' as const, content: r.answer }]
      setMsgs(all)
      if (r.proposal) setProps((p) => ({ ...p, [all.length - 1]: r.proposal! }))
      conv.current = await saveConversation('coach', all, conv.current)
    } catch (e) { setErr(aiMessage(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="space-y-3" aria-live="polite">
        {msgs.length === 0 && <Card><p className="text-sm text-muted">Ask about your last two weeks. For example: "Am I training enough?" or "Make my next session lighter on legs." The coach can propose a session, and nothing changes until you accept it.</p></Card>}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-10 rounded-3xl bg-accent p-4 text-accent-fg' : 'mr-10 rounded-3xl border border-line bg-surface p-4'}>
            <p className="whitespace-pre-wrap text-sm font-medium">{m.content}</p>
            {props[i] && <ProposalCard p={props[i]} onSaved={() => toast('Template saved')} />}
          </div>
        ))}
        {busy && <div className="mr-10 h-14 animate-pulse rounded-3xl bg-surface-2" aria-label="Thinking" />}
      </div>
      {err && <p role="alert" className="mt-3 text-sm font-semibold text-warn">{err} {err.includes('Settings') && <Link className="underline" to="/settings#ai-connection">Open Settings</Link>}</p>}
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <input aria-label="Ask the coach" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your coach" maxLength={1000} className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 outline-none focus:border-accent-ink" />
        <Button type="submit" variant="primary" disabled={busy || !q.trim()} aria-label="Send"><Send size={18} /></Button>
      </form>
      {node}
    </div>
  )
}

function ProposalCard({ p, onSaved }: { p: Proposal; onSaved: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">Proposed session</p>
      <p className="font-bold">{p.name} · ~{estimateMinutes(p.exercises)} min</p>
      <ul className="my-2 text-sm text-muted">{p.exercises.map((e, i) => <li key={i}>{EXERCISE_MAP[e.exerciseId].name}: {e.sets} × {e.seconds ? `${e.seconds}s` : e.reps}</li>)}</ul>
      <Button variant="primary" disabled={done} onClick={async () => { await db.templates.add({ name: p.name, type: p.type, exercises: p.exercises, archived: false, createdAt: Date.now() }); setDone(true); onSaved() }}>{done ? 'Saved to Train' : 'Accept as template'}</Button>
    </div>
  )
}

export function Planner() {
  const s = useSettings()
  const nav = useNavigate()
  const [f, setF] = useState<PlanInput>({ goal: s.goalFocus, days: s.weeklyTarget, equipment: s.equipment.join(', '), experience: 'beginner', injuries: '' })
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async () => {
    setBusy(true); setErr(''); setPlan(null)
    try {
      const p = await generatePlan(f)
      setPlan(p)
      await saveConversation('planner', [{ role: 'user', content: JSON.stringify(f) }, { role: 'assistant', content: JSON.stringify(p) }])
    } catch (e) { setErr(aiMessage(e)) } finally { setBusy(false) }
  }
  const accept = async () => {
    if (!plan) return
    await db.templates.bulkAdd(plan.sessions.map((x) => ({ name: `${plan.name}: ${x.name}`, type: x.type, exercises: x.exercises, archived: false, createdAt: Date.now() })))
    nav('/train')
  }
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Field id="pg" label="Goal" value={f.goal} maxLength={80} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        <div><p className="mb-2 text-sm font-semibold">Training days per week</p><Chips label="Days" options={[2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: String(n) }))} value={String(f.days)} onChange={(v) => setF({ ...f, days: +v })} /></div>
        <Field id="pe" label="Equipment" value={f.equipment} maxLength={120} onChange={(e) => setF({ ...f, equipment: e.target.value })} />
        <div><p className="mb-2 text-sm font-semibold">Experience</p><Chips label="Experience" options={['beginner', 'intermediate', 'advanced'].map((x) => ({ id: x, label: x[0].toUpperCase() + x.slice(1) }))} value={f.experience} onChange={(v) => setF({ ...f, experience: v })} /></div>
        <Field id="pi" label="Injuries or limitations (optional)" value={f.injuries} maxLength={300} onChange={(e) => setF({ ...f, injuries: e.target.value })} />
        {f.injuries.trim() && <p role="note" className="rounded-2xl bg-surface-2 p-3 text-sm"><strong>Safety notice.</strong> The plan will use conservative defaults, but it is not a substitute for advice from a doctor or physiotherapist.</p>}
        <Button variant="primary" size="lg" onClick={run} disabled={busy}>{busy ? 'Building your plan…' : 'Generate plan'}</Button>
        {err && <p role="alert" className="text-sm font-semibold text-warn">{err}</p>}
      </Card>
      {plan && (
        <Card>
          <h2 className="font-display text-xl font-bold">{plan.name}</h2>
          <p className="text-sm text-muted">{plan.weeks} weeks · {plan.sessions.length} sessions per week</p>
          {plan.notes && <p className="mt-2 text-sm">{plan.notes}</p>}
          <ul className="my-3 space-y-2">{plan.sessions.map((x, i) => <li key={i} className="rounded-2xl bg-surface-2 p-3 text-sm"><strong>{x.day}: {x.name}</strong><br /><span className="text-muted">{x.exercises.map((e) => EXERCISE_MAP[e.exerciseId].name).join(', ')}</span></li>)}</ul>
          <Button variant="primary" onClick={accept}>Add sessions as templates</Button>
        </Card>
      )}
    </div>
  )
}

function History() {
  const list = useLiveQuery(() => db.conversations.orderBy('createdAt').reverse().toArray(), [])
  if (list && list.length === 0) return <Card><p className="text-sm text-muted">No saved conversations yet.</p></Card>
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => confirm('Delete all AI history?') && db.conversations.clear()}>Delete all</Button></div>
      {list?.map((c) => (
        <Card key={c.id} className="!p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold capitalize">{c.feature} · <span className="font-medium text-muted">{new Date(c.createdAt).toLocaleString()}</span></p>
            <button aria-label="Delete conversation" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => db.conversations.delete(c.id!)}><Trash2 size={16} /></button>
          </div>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{c.messages.filter((m) => m.role === 'assistant').map((m) => (c.feature === 'planner' ? 'Training plan generated.' : m.content)).join('\n\n') || c.messages[0]?.content}</p>
        </Card>
      ))}
    </div>
  )
}

export function PlannerGated() { return <AiGate feature="The plan generator"><Planner /></AiGate> }
