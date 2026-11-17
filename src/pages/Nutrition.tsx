import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { m } from 'motion/react'
import { ChefHat, ChevronLeft, ChevronRight, Copy, Droplets, Leaf, Plus, ScanBarcode, Trash2, TriangleAlert } from 'lucide-react'
import { db, type FoodEntry, type Food, type Meal } from '../lib/db'
import { Bar, Button, Card, Chips, CountUp, Empty, Field, PageHeader, Sheet, useToast } from '../components/ui'
import { addDays, dateKey, macroTotals, parseKey } from '../lib/domain'
import { useSettings } from '../lib/store'
import { BarcodeCamera, canScan, DietSheet, PhotoScan, RecipeSheet } from '../components/NutritionExtras'
import AiAssistant from '../components/AiAssistant'
import { DIETS, DIET_NOTE, allergenHits } from '../lib/diet'
import type { FoodGuess } from '../lib/ai'

const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
]

export default function Nutrition() {
  const s = useSettings()
  const [date, setDate] = useState(dateKey())
  const [adding, setAdding] = useState<Meal | null>(null)
  const [recipes, setRecipes] = useState(false)
  const [diets, setDiets] = useState(false)
  const diet = DIETS.find((d) => d.id === s.diet)
  const { toast, node } = useToast()
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).toArray(), [date])
  const water = useLiveQuery(() => db.water.get(date), [date])
  const yesterday = useLiveQuery(() => db.entries.where('date').equals(addDays(date, -1)).toArray(), [date])
  const t = useMemo(() => macroTotals(entries ?? []), [entries])
  const ml = water?.ml ?? 0
  const addWater = (n: number) => db.water.put({ date, ml: Math.max(0, ml + n) })
  const label = date === dateKey() ? 'Today' : parseKey(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  const repeat = async (meal: Meal) => {
    const src = (yesterday ?? []).filter((e) => e.meal === meal)
    await db.entries.bulkAdd(src.map((e) => ({ ...e, id: undefined, date, createdAt: Date.now() })))
    toast(src.length ? `Added ${src.length} items from yesterday` : 'Nothing logged for this meal yesterday')
  }

  return (
    <div>
      <PageHeader
        title="Food"
        sub="Estimates are always editable."
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <button aria-label="Previous day" className="grid size-11 place-items-center rounded-full" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={18} /></button>
            <span className="min-w-20 text-center text-sm font-bold">{label}</span>
            <button aria-label="Next day" disabled={date >= dateKey()} className="grid size-11 place-items-center rounded-full disabled:opacity-30" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={18} /></button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-end justify-between">
              <div>
                <p className="font-num text-5xl font-bold"><CountUp value={t.kcal} /></p>
                <p className="text-sm text-muted">of {s.kcalTarget} kcal{t.kcal > s.kcalTarget && ` · ${t.kcal - s.kcalTarget} over`}</p>
              </div>
              <div className="text-right text-sm font-semibold">
                <p>P <CountUp value={t.protein} />g</p><p>C <CountUp value={t.carbs} />g</p><p>F <CountUp value={t.fat} />g</p>
              </div>
            </div>
            <div className="mt-4"><Bar value={t.kcal} max={s.kcalTarget} over={t.kcal > s.kcalTarget} /></div>
            <div className="mt-3"><Bar value={t.protein} max={s.proteinTarget} /></div>
            <p className="mt-2 text-xs text-muted">Top bar calories, lower bar protein ({s.proteinTarget}g goal).</p>
          </Card>

          <AiAssistant scope="food" title="Nutrition coach" intro={`Reads ${date === dateKey() ? "today's" : 'this day\'s'} diary, your targets, diet and allergens.`} extra={{ date }} date={date} onToast={toast}
            prompts={['What should I eat for the rest of today?', 'Review my day so far', 'How do I hit my protein target?', 'Suggest a snack that fits my calories left']} />

          {MEALS.map((meal) => {
            const list = (entries ?? []).filter((e) => e.meal === meal.id)
            return (
              <Card key={meal.id} className="!p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">{meal.label}</h2>
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => repeat(meal.id)} aria-label={`Repeat yesterday's ${meal.label}`}><Copy size={15} /> Repeat</Button>
                    <Button variant="soft" onClick={() => setAdding(meal.id)} aria-label={`Add to ${meal.label}`}><Plus size={16} /> Add</Button>
                  </div>
                </div>
                {list.length === 0 ? (
                  <p className="py-2 text-sm text-muted">Nothing logged yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((e) => (
                      <m.li key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{e.name}{e.isEstimate && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase">Estimate</span>}{allergenHits(`${e.name} ${e.ingredients ?? ''}`, s.allergens).length > 0 && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-bold uppercase text-warn"><TriangleAlert size={10} />Allergen: {allergenHits(`${e.name} ${e.ingredients ?? ''}`, s.allergens).join(', ')}</span>}</p>
                          <p className="text-xs text-muted">{Math.round(e.servingG)}g · P{Math.round(e.protein)} C{Math.round(e.carbs)} F{Math.round(e.fat)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-num font-bold">{Math.round(e.kcal)}</span>
                          <button aria-label={`Delete ${e.name}`} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => db.entries.delete(e.id!)}><Trash2 size={16} /></button>
                        </div>
                      </m.li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>

        <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <p className="flex items-center gap-2 text-sm font-semibold text-muted"><Droplets size={16} /> Water</p>
            <p className="font-num mt-2 text-4xl font-bold"><CountUp value={ml} /><span className="ml-1 text-base font-semibold text-muted">/ {s.waterGoal} ml</span></p>
            <div className="mt-3"><Bar value={ml} max={s.waterGoal} /></div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[250, 500].map((n) => <Button key={n} onClick={() => addWater(n)}>+{n}</Button>)}
              <Button variant="ghost" onClick={() => addWater(-250)} disabled={ml === 0}>−250</Button>
            </div>
          </Card>
          <Card>
            <p className="flex items-center gap-2 text-sm font-semibold text-muted"><Leaf size={16} /> Diet template</p>
            <p className="mt-1 font-bold">{diet?.label ?? 'None selected'}</p>
            {diet && diet.id !== 'custom' && <p className="text-sm text-muted">Carbs about {Math.round((s.kcalTarget * diet.carbs) / 100 / 4)}g · Fat about {Math.round((s.kcalTarget * diet.fat) / 100 / 9)}g</p>}
            <p className="mt-1 text-xs text-muted">{DIET_NOTE}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => setDiets(true)}>Templates</Button><Button onClick={() => setRecipes(true)}><ChefHat size={16} /> Recipes</Button></div>
          </Card>
        </div>
      </div>

      <DietSheet open={diets} onClose={() => setDiets(false)} />
      <RecipeSheet open={recipes} onClose={() => setRecipes(false)} date={date} onLogged={(n) => toast(`Added ${n}`)} />
      <AddFood meal={adding} date={date} onClose={() => setAdding(null)} onAdded={(n) => toast(`Added ${n}`)} />
      {node}
    </div>
  )
}

const num = (v: string) => (Number.isFinite(parseFloat(v)) ? Math.min(100000, Math.max(0, parseFloat(v))) : 0)

function AddFood({ meal, date, onClose, onAdded }: { meal: Meal | null; date: string; onClose: () => void; onAdded: (n: string) => void }) {
  const [tab, setTab] = useState<'search' | 'barcode' | 'photo' | 'manual'>('search')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => { const t = setTimeout(() => setDq(q), 200); return () => clearTimeout(t) }, [q])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const results = useMemo(() => (foods ?? []).filter((f) => f.name.toLowerCase().includes(dq.toLowerCase())).slice(0, 30), [foods, dq])
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState('100')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'missing'>('idle')
  const allergens = useSettings((x) => x.allergens)
  const [man, setMan] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', serving: '100', save: false })

  useEffect(() => { if (meal) { setPicked(null); setQ(''); setCode(''); setStatus('idle'); setTab('search') } }, [meal])
  const pick = (f: Food) => { setPicked(f); setGrams(String(f.servingG)) }

  const log = async (f: { name: string; brand?: string; ingredients?: string; per100: Food['per100'] }, g: number, source: FoodEntry['source']) => {
    const k = g / 100
    await db.entries.add({
      date, meal: meal!, name: f.name, brand: f.brand ?? '', servingG: g,
      kcal: f.per100.kcal * k, protein: f.per100.protein * k, carbs: f.per100.carbs * k, fat: f.per100.fat * k,
      source, isEstimate: false, createdAt: Date.now(), ingredients: f.ingredients ?? '',
    })
    onAdded(f.name)
    onClose()
  }

  const lookupCode = (raw: string) => lookup(raw)
  const lookup = async (raw = code) => {
    const c = raw.replace(/\D/g, '')
    if (c.length < 6) return
    setStatus('loading')
    const cached = await db.foods.where('barcode').equals(c).first()
    if (cached) { setStatus('idle'); setTab('search'); pick(cached); return }
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,brands,nutriments,serving_quantity,ingredients_text`)
      const j = await r.json()
      const p = j.product
      if (j.status !== 1 || !p?.nutriments) throw new Error('missing')
      const n = p.nutriments
      const food: Food = {
        barcode: c, name: p.product_name || 'Unnamed product', brand: p.brands ?? '',
        per100: { kcal: n['energy-kcal_100g'] ?? 0, protein: n.proteins_100g ?? 0, carbs: n.carbohydrates_100g ?? 0, fat: n.fat_100g ?? 0 },
        servingG: Number(p.serving_quantity) || 100, custom: false, cachedAt: Date.now(), ingredients: p.ingredients_text ?? '',
      }
      food.id = await db.foods.add(food)
      setStatus('idle'); setTab('search'); pick(food)
    } catch {
      setStatus('missing')
    }
  }

  return (
    <Sheet open={!!meal} onClose={onClose} title={`Add to ${meal ?? ''}`}>
      <Chips<'search' | 'barcode' | 'photo' | 'manual'> label="Method" options={[{ id: 'search', label: 'Search' }, { id: 'barcode', label: 'Barcode' }, { id: 'photo', label: 'Photo' }, { id: 'manual', label: 'Manual' }]} value={tab} onChange={(v) => { setTab(v); setPicked(null) }} />
      <div className="mt-4">
        {tab === 'search' && !picked && (
          <div className="space-y-3">
            <input aria-label="Search foods" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-2xl border border-line bg-surface-2 px-4" />
            {results.length === 0 && <Empty text="No match. Add it manually and save it as a custom food." action={<Button onClick={() => { setTab('manual'); setMan({ ...man, name: q }) }}>Add manually</Button>} />}
            <ul className="space-y-2">
              {results.map((f) => (
                <li key={f.id}>
                  <button onClick={() => pick(f)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 text-left">
                    <span className="min-w-0"><span className="block truncate font-semibold">{f.name}</span>{f.brand && <span className="block truncate text-xs text-muted">{f.brand}</span>}</span>
                    <span className="shrink-0 text-xs font-semibold text-muted">{Math.round(f.per100.kcal)} kcal/100g</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'search' && picked && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold">{picked.name}</h3>
              <p className="text-sm text-muted">{picked.brand || 'Per 100g'} · {Math.round(picked.per100.kcal)} kcal · P{picked.per100.protein} C{picked.per100.carbs} F{picked.per100.fat}</p>
            </div>
            {allergenHits(`${picked.name} ${picked.ingredients ?? ''}`, allergens).length > 0 && <p role="alert" className="flex items-center gap-2 rounded-2xl bg-warn/15 p-3 text-sm font-semibold text-warn"><TriangleAlert size={16} /> May contain: {allergenHits(`${picked.name} ${picked.ingredients ?? ''}`, allergens).join(', ')}. Keyword match, for information only.</p>}
            {picked.ingredients && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Ingredients</summary><p className="text-muted">{picked.ingredients}</p></details>}
            <Field id="grams" label="Amount (grams)" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
            <p className="font-num text-2xl font-bold">{Math.round((picked.per100.kcal * num(grams)) / 100)} kcal</p>
            <div className="flex gap-2">
              <Button variant="primary" size="lg" className="flex-1" onClick={() => log(picked, num(grams), picked.barcode ? 'barcode' : 'search')}>Add to log</Button>
              <Button size="lg" onClick={() => setPicked(null)}>Back</Button>
            </div>
          </div>
        )}
        {tab === 'barcode' && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-muted"><ScanBarcode size={18} /> Type the barcode number. Lookups use Open Food Facts and are cached for offline use.</p>
            {canScan() && <BarcodeCamera onCode={(c) => { setCode(c); setTimeout(() => void lookupCode(c), 0) }} />}
            <Field id="code" label="Barcode" inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setStatus('idle') }} />
            <Button variant="primary" size="lg" className="w-full" onClick={() => lookup()} disabled={status === 'loading'}>{status === 'loading' ? 'Looking up…' : 'Look up'}</Button>
            {status === 'missing' && <p role="alert" className="text-sm font-semibold text-warn">We couldn't find that product, or you're offline. You can add it manually.</p>}
            {status === 'missing' && <Button onClick={() => setTab('manual')}>Add manually</Button>}
          </div>
        )}
        {tab === 'photo' && (
          <PhotoScan onUse={async (g: FoodGuess) => {
            await db.entries.add({ date, meal: meal!, name: g.name, brand: '', servingG: g.portion_g, kcal: g.kcal, protein: g.protein_g, carbs: g.carbs_g, fat: g.fat_g, source: 'photo', isEstimate: true, createdAt: Date.now() })
            onAdded(g.name); onClose()
          }} />
        )}
        {tab === 'manual' && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            const g = num(man.serving) || 100
            const per100 = { kcal: (num(man.kcal) / g) * 100, protein: (num(man.protein) / g) * 100, carbs: (num(man.carbs) / g) * 100, fat: (num(man.fat) / g) * 100 }
            const name = man.name.trim() || 'Custom food'
            if (man.save) await db.foods.add({ barcode: null, name, brand: '', per100, servingG: g, custom: true, cachedAt: Date.now() })
            await log({ name, per100 }, g, 'manual')
            setMan({ name: '', kcal: '', protein: '', carbs: '', fat: '', serving: '100', save: false })
          }}>
            <Field id="mname" label="Name" value={man.name} maxLength={80} onChange={(e) => setMan({ ...man, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <Field id="mserv" label="Serving (g)" inputMode="decimal" value={man.serving} onChange={(e) => setMan({ ...man, serving: e.target.value })} />
              <Field id="mkcal" label="Calories" inputMode="decimal" value={man.kcal} onChange={(e) => setMan({ ...man, kcal: e.target.value })} required />
              <Field id="mp" label="Protein (g)" inputMode="decimal" value={man.protein} onChange={(e) => setMan({ ...man, protein: e.target.value })} />
              <Field id="mc" label="Carbs (g)" inputMode="decimal" value={man.carbs} onChange={(e) => setMan({ ...man, carbs: e.target.value })} />
              <Field id="mf" label="Fat (g)" inputMode="decimal" value={man.fat} onChange={(e) => setMan({ ...man, fat: e.target.value })} />
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="!min-h-0 size-5 accent-[var(--accent-ink)]" checked={man.save} onChange={(e) => setMan({ ...man, save: e.target.checked })} /> Save as custom food</label>
            <Button type="submit" variant="primary" size="lg" className="w-full">Add to log</Button>
          </form>
        )}
      </div>
    </Sheet>
  )
}
