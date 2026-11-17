import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Send, Sparkles } from 'lucide-react'
import { m } from 'motion/react'
import { db, type AiMessage, type Meal } from '../lib/db'
import { aiMessage, coachAsk, saveConversation, type CoachResult, type Scope } from '../lib/ai'
import { EXERCISE_MAP, estimateMinutes } from '../lib/exercises'
import { useSettings } from '../lib/store'
import { Button, Card } from './ui'

interface Props {
  scope: Exclude<Scope, 'general'>
  title: string
  intro: string
  prompts: string[]
  /** Context passed to the assistant, such as the diary date being viewed. */
  extra?: { date?: string }
  /** Where meal ideas are logged. */
  date?: string
  onToast?: (m: string) => void
}

const mealForNow = (): Meal => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'snacks' }

/** One assistant, three homes: it reads the data of the screen it sits on and can only act within that area. */
export default function AiAssistant({ scope, title, intro, prompts, extra, date, onToast }: Props) {
  const has = useLiveQuery(async () => !!(await db.aiKey.get('key')), [])
  const [msgs, setMsgs] = useState<AiMessage[]>([])
  const [res, setRes] = useState<Record<number, CoachResult>>({})
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const conv = useRef<number | undefined>(undefined)
  const set = useSettings((s) => s.set)

  const ask = async (text: string) => {
    if (!text.trim() || busy) return
    const next = [...msgs, { role: 'user' as const, content: text.trim().slice(0, 800) }]
    setMsgs(next); setQ(''); setBusy(true); setErr('')
    try {
      const r = await coachAsk(next, scope, extra)
      const all = [...next, { role: 'assistant' as const, content: r.answer }]
      setMsgs(all)
      setRes((p) => ({ ...p, [all.length - 1]: r }))
      conv.current = await saveConversation('coach', all, conv.current)
    } catch (e) { setErr(aiMessage(e)) } finally { setBusy(false) }
  }

  if (has === undefined) return null
  return (
    <Card className="!p-4 md:!p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-fg"><Sparkles size={18} /></span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
          <p className="text-sm text-muted">{intro}</p>
        </div>
      </div>

      {!has ? (
        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">
          Connect your own AI key to get answers based on your {scope === 'train' ? 'training' : scope === 'food' ? 'food diary' : 'progress'} data. Everything else keeps working without it.{' '}
          <Link to="/settings#ai-connection" className="font-bold text-accent-ink">Open AI connection</Link>
        </p>
      ) : (
        <>
          {msgs.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {prompts.map((p) => <button key={p} onClick={() => ask(p)} className="min-h-11 rounded-full bg-surface-2 px-4 text-left text-sm font-semibold transition-transform active:scale-[0.97]">{p}</button>)}
            </div>
          )}
          <div className="mt-4 space-y-3" aria-live="polite">
            {msgs.map((mm, i) => (
              <m.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={mm.role === 'user' ? 'ml-8 rounded-3xl bg-accent px-4 py-3 text-sm font-semibold text-accent-fg' : 'rounded-3xl bg-surface-2 p-4'}>
                <p className="whitespace-pre-wrap text-sm font-medium">{mm.content}</p>
                {res[i] && <Actions r={res[i]} scope={scope} date={date} onToast={onToast} onTargets={(t) => { set(t); onToast?.('Targets updated') }} />}
              </m.div>
            ))}
            {busy && <div className="h-12 animate-pulse rounded-3xl bg-surface-2" aria-label="Thinking" />}
          </div>
          {err && <p role="alert" className="mt-3 text-sm font-semibold text-warn">{err} {err.includes('Settings') && <Link className="underline" to="/settings#ai-connection">Open Settings</Link>}</p>}
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q) }}>
            <input aria-label={title} value={q} onChange={(e) => setQ(e.target.value)} maxLength={800} placeholder="Ask something specific" className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 outline-none focus:border-accent-ink" />
            <Button type="submit" variant="primary" disabled={busy || !q.trim()} aria-label="Send"><Send size={18} /></Button>
          </form>
          <p className="mt-2 text-xs text-muted">Uses only your {scope} data. General fitness information, not medical advice.</p>
        </>
      )}
    </Card>
  )
}

function Actions({ r, scope, date, onToast, onTargets }: { r: CoachResult; scope: Scope; date?: string; onToast?: (m: string) => void; onTargets: (t: NonNullable<CoachResult['targets']>) => void }) {
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [meal, setMeal] = useState<Meal>(mealForNow())
  const mark = (k: string) => setDone((d) => ({ ...d, [k]: true }))
  const t = r.targets
  return (
    <div className="mt-3 space-y-3">
      {r.proposal && (
        <div className="rounded-2xl bg-surface p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">Proposed session</p>
          <p className="font-bold">{r.proposal.name} · ~{estimateMinutes(r.proposal.exercises)} min</p>
          <ul className="my-2 text-sm text-muted">{r.proposal.exercises.map((e, i) => <li key={i}>{EXERCISE_MAP[e.exerciseId].name}: {e.sets} × {e.seconds ? `${e.seconds}s` : e.reps}</li>)}</ul>
          <Button variant="primary" disabled={done.p} onClick={async () => { await db.templates.add({ name: r.proposal!.name, type: r.proposal!.type, exercises: r.proposal!.exercises, archived: false, createdAt: Date.now() }); mark('p'); onToast?.('Saved to your templates') }}>{done.p ? 'Saved' : 'Accept as template'}</Button>
        </div>
      )}
      {r.meals.length > 0 && scope !== 'train' && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">Meal ideas · estimates</p>
          {r.meals.map((x, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
              <div className="min-w-0"><p className="truncate font-semibold">{x.name}</p><p className="text-xs text-muted">{Math.round(x.portion_g)}g · {Math.round(x.kcal)} kcal · P{Math.round(x.protein_g)} C{Math.round(x.carbs_g)} F{Math.round(x.fat_g)}</p></div>
              <Button disabled={done[`m${i}`]} onClick={async () => { await db.entries.add({ date: date ?? new Date().toISOString().slice(0, 10), meal, name: x.name, brand: '', servingG: x.portion_g, kcal: x.kcal, protein: x.protein_g, carbs: x.carbs_g, fat: x.fat_g, source: 'ai', isEstimate: true, createdAt: Date.now() }); mark(`m${i}`); onToast?.(`Added ${x.name}`) }}>{done[`m${i}`] ? 'Added' : `Log to ${meal}`}</Button>
            </div>
          ))}
          <select aria-label="Meal to log to" value={meal} onChange={(e) => setMeal(e.target.value as Meal)} className="rounded-xl border border-line bg-surface px-3 text-sm font-semibold">
            {(['breakfast', 'lunch', 'dinner', 'snacks'] as Meal[]).map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </select>
        </div>
      )}
      {t && scope !== 'food' && scope !== 'train' ? (
        <TargetCard t={t} done={!!done.t} onApply={() => { onTargets(t); mark('t') }} />
      ) : t && scope === 'train' && t.weeklyTarget ? (
        <TargetCard t={{ weeklyTarget: t.weeklyTarget }} done={!!done.t} onApply={() => { onTargets({ weeklyTarget: t.weeklyTarget }); mark('t') }} />
      ) : t && scope === 'food' && (t.kcalTarget || t.proteinTarget) ? (
        <TargetCard t={{ kcalTarget: t.kcalTarget, proteinTarget: t.proteinTarget }} done={!!done.t} onApply={() => { onTargets({ kcalTarget: t.kcalTarget, proteinTarget: t.proteinTarget }); mark('t') }} />
      ) : null}
    </div>
  )
}

function TargetCard({ t, done, onApply }: { t: NonNullable<CoachResult['targets']>; done: boolean; onApply: () => void }) {
  const parts = [t.weeklyTarget && `${t.weeklyTarget} sessions per week`, t.kcalTarget && `${t.kcalTarget} kcal`, t.proteinTarget && `${t.proteinTarget}g protein`].filter(Boolean)
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">Suggested target</p>
      <p className="font-semibold">{parts.join(' · ')}</p>
      <Button className="mt-2" variant="primary" disabled={done} onClick={onApply}>{done ? 'Applied' : 'Apply'}</Button>
    </div>
  )
}
