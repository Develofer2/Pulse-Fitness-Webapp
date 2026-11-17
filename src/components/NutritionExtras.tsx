import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Plus, Trash2 } from 'lucide-react'
import { db, type Food, type Meal, type RecipeIngredient } from '../lib/db'
import { Button, Card, Chips, Empty, Field, Sheet } from './ui'
import { DIETS, DIET_NOTE } from '../lib/diet'
import { useSettings } from '../lib/store'
import { compressImage, blobToDataUrl } from '../lib/photo'
import { AiGate } from '../pages/Ai'
import { aiMessage, scanFood, type FoodGuess } from '../lib/ai'

const num = (v: string) => (Number.isFinite(parseFloat(v)) ? Math.min(100000, Math.max(0, parseFloat(v))) : 0)

/* ---------- Diet templates ---------- */
export function DietSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings()
  return (
    <Sheet open={open} onClose={onClose} title="Diet templates">
      <p className="mb-3 text-sm text-muted">{DIET_NOTE}</p>
      <ul className="space-y-2">
        {DIETS.map((d) => (
          <li key={d.id} className={`rounded-2xl border p-4 ${s.diet === d.id ? 'border-accent' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{d.label}</h3>
              <Button variant={s.diet === d.id ? 'primary' : 'soft'} onClick={() => {
                if (d.id === 'custom') s.set({ diet: d.id })
                else s.set({ diet: d.id, proteinTarget: Math.round((s.kcalTarget * d.protein) / 100 / 4) })
                onClose()
              }}>{s.diet === d.id ? 'Active' : 'Use'}</Button>
            </div>
            {d.id !== 'custom' && <p className="text-sm text-muted">Protein {d.protein}% · Carbs {d.carbs}% · Fat {d.fat}%</p>}
            <p className="mt-1 text-sm">{d.foods}</p>
            {d.note && <p className="mt-1 text-xs text-muted">{d.note}</p>}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/* ---------- Recipes ---------- */
export function RecipeSheet({ open, onClose, date, onLogged }: { open: boolean; onClose: () => void; date: string; onLogged: (n: string) => void }) {
  const [meal, setMeal] = useState<Meal>('lunch')
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const [building, setBuilding] = useState(false)
  const [name, setName] = useState('')
  const [servings, setServings] = useState('2')
  const [ings, setIngs] = useState<RecipeIngredient[]>([])
  const [q, setQ] = useState('')
  const per = (r: { ingredients: RecipeIngredient[]; servings: number }) => {
    const t = r.ingredients.reduce((a, i) => ({ kcal: a.kcal + (i.per100.kcal * i.grams) / 100, protein: a.protein + (i.per100.protein * i.grams) / 100, carbs: a.carbs + (i.per100.carbs * i.grams) / 100, fat: a.fat + (i.per100.fat * i.grams) / 100 }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
    const n = Math.max(1, r.servings)
    return { kcal: t.kcal / n, protein: t.protein / n, carbs: t.carbs / n, fat: t.fat / n, grams: r.ingredients.reduce((a, i) => a + i.grams, 0) / n }
  }
  const draft = per({ ingredients: ings, servings: num(servings) || 1 })
  const hits = (foods ?? []).filter((f) => q && f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
  return (
    <Sheet open={open} onClose={onClose} title={building ? 'Recipe builder' : 'Recipes'}>
      {!building ? (
        <div className="space-y-3">
          <Button variant="primary" onClick={() => setBuilding(true)}><Plus size={16} /> New recipe</Button>
          <Chips<Meal> label="Log to meal" options={(['breakfast', 'lunch', 'dinner', 'snacks'] as Meal[]).map((m) => ({ id: m, label: m[0].toUpperCase() + m.slice(1) }))} value={meal} onChange={setMeal} />
          {recipes?.length === 0 && <Empty text="No recipes yet. Combine foods into one loggable meal." />}
          {recipes?.map((r) => {
            const p = per(r)
            return (
              <Card key={r.id} className="!p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-bold">{r.name}</p><p className="text-sm text-muted">{Math.round(p.kcal)} kcal per serving · {r.servings} servings</p></div>
                  <button aria-label={`Delete ${r.name}`} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => db.recipes.delete(r.id!)}><Trash2 size={16} /></button>
                </div>
                <Button className="mt-2" onClick={async () => {
                  await db.entries.add({ date, meal, name: r.name, brand: 'Recipe', servingG: p.grams, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, source: 'recipe', isEstimate: false, createdAt: Date.now(), ingredients: r.ingredients.map((i) => i.name).join(', ') })
                  onLogged(r.name); onClose()
                }}>Log one serving</Button>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <Field id="rn" label="Recipe name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Field id="rs" label="Servings" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
          <Field id="rq" label="Add ingredient" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((f) => <button key={f.id} className="flex min-h-11 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-left font-semibold" onClick={() => { setIngs([...ings, { name: f.name, grams: f.servingG, per100: f.per100 }]); setQ('') }}>{f.name}<Plus size={16} /></button>)}
          <ul className="space-y-2">
            {ings.map((i, k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i.name}</span>
                <input aria-label={`Grams of ${i.name}`} inputMode="decimal" value={i.grams} onChange={(e) => setIngs(ings.map((x, j) => (j === k ? { ...x, grams: num(e.target.value) } : x)))} className="w-20 rounded-xl border border-line bg-surface-2 px-3 text-center" />
                <span className="text-xs text-muted">g</span>
                <button aria-label={`Remove ${i.name}`} className="grid size-11 place-items-center text-muted" onClick={() => setIngs(ings.filter((_, j) => j !== k))}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          <p className="font-num text-lg font-bold">{Math.round(draft.kcal)} kcal · P{Math.round(draft.protein)} C{Math.round(draft.carbs)} F{Math.round(draft.fat)} <span className="text-sm font-medium text-muted">per serving</span></p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={!name.trim() || ings.length === 0} className="flex-1" onClick={async () => { await db.recipes.add({ name: name.trim(), servings: Math.max(1, Math.round(num(servings))), ingredients: ings }); setBuilding(false); setName(''); setIngs([]) }}>Save recipe</Button>
            <Button onClick={() => setBuilding(false)}>Back</Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ---------- Camera barcode scanning (BarcodeDetector where available) ---------- */
type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> }
export const canScan = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

export function BarcodeCamera({ onCode }: { onCode: (c: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const Ctor = (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector
        const det = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
        const loop = async () => {
          if (stop || !video.current) return
          try {
            const r = await det.detect(video.current)
            if (r[0]) return onCode(r[0].rawValue)
          } catch { /* keep trying */ }
          setTimeout(loop, 300)
        }
        void loop()
      } catch { setErr('Camera unavailable. Type the barcode instead.') }
    })()
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [onCode])
  return err ? <p role="alert" className="text-sm font-semibold text-warn">{err}</p> : <video ref={video} muted playsInline className="aspect-video w-full rounded-2xl bg-black object-cover" aria-label="Camera preview" />
}

/* ---------- Photo estimate (BYOK) ---------- */
export function PhotoScan({ onUse }: { onUse: (g: FoodGuess) => void }) {
  return (
    <AiGate feature="Photo food estimates">
      <Scanner onUse={onUse} />
    </AiGate>
  )
}
function Scanner({ onUse }: { onUse: (g: FoodGuess) => void }) {
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [g, setG] = useState<FoodGuess | null>(null)
  const pick = async (f: File | undefined) => {
    if (!f) return
    setBusy(true); setErr(''); setG(null)
    try {
      const small = await compressImage(f, 1024) // resized client-side and stripped of EXIF before sending
      setG(await scanFood(await blobToDataUrl(small), hint))
    } catch (e) { setErr(aiMessage(e)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <Field id="hint" label="Hint (optional)" placeholder="e.g. chicken salad with dressing" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={120} />
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg">
        <Camera size={18} /> {busy ? 'Estimating…' : 'Take or choose a photo'}
        <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <p className="text-xs text-muted">The photo is resized and sent to your AI provider. It is not saved.</p>
      {err && <p role="alert" className="text-sm font-semibold text-warn">{err}</p>}
      {g && <Estimate g={g} onUse={onUse} />}
    </div>
  )
}
function Estimate({ g, onUse }: { g: FoodGuess; onUse: (g: FoodGuess) => void }) {
  const [v, setV] = useState({ name: g.name, portion: String(Math.round(g.portion_g)), kcal: String(Math.round(g.kcal)), p: String(Math.round(g.protein_g)), c: String(Math.round(g.carbs_g)), f: String(Math.round(g.fat_g)) })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">Estimate · confidence {Math.round(g.confidence * 100)}%</p>
      {g.confidence < 0.5 && <p role="alert" className="text-sm font-semibold text-warn">Low confidence. Please check these values.</p>}
      <Field id="en" label="Name" value={v.name} onChange={set('name')} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="ep" label="Portion (g)" inputMode="decimal" value={v.portion} onChange={set('portion')} />
        <Field id="ek" label="Calories" inputMode="decimal" value={v.kcal} onChange={set('kcal')} />
        <Field id="epr" label="Protein (g)" inputMode="decimal" value={v.p} onChange={set('p')} />
        <Field id="ec" label="Carbs (g)" inputMode="decimal" value={v.c} onChange={set('c')} />
        <Field id="ef" label="Fat (g)" inputMode="decimal" value={v.f} onChange={set('f')} />
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={() => onUse({ name: v.name || g.name, portion_g: num(v.portion) || 1, kcal: num(v.kcal), protein_g: num(v.p), carbs_g: num(v.c), fat_g: num(v.f), confidence: g.confidence })}>Confirm and add</Button>
    </div>
  )
}
export type { Food }
