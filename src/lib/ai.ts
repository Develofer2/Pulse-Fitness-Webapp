import { db, type AiMessage } from './db'
import { ADAPTERS, HttpError, PRICES } from './providers'
import { monthKey, readKey } from './vault'
import { EXERCISES, EXERCISE_MAP, type SessionType, type TemplateExercise } from './exercises'
import { addDays, dateKey, macroTotals, volume, weekStart } from './domain'
import { useSettings } from './store'

export type AiErrorKind = 'nokey' | 'rejected' | 'ratelimit' | 'network' | 'cap' | 'malformed' | 'other'
export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message)
  }
}
export const aiMessage = (e: unknown) => (e instanceof AiError ? e.message : 'Something went wrong with the AI request. Try again.')

/* ---- System prompts (kept in code, never user-editable) ---- */
const BASE = 'You are a supportive fitness assistant inside a fitness app. Give general fitness and nutrition information only. Never diagnose, never give medical advice, and tell users with injuries or conditions to consult a professional. Use short, positive sentences.'
const EX_LIST = () => EXERCISES.map((e) => `${e.id} (${e.name})`).join('; ')
export type Scope = 'train' | 'food' | 'progress' | 'general'
const SCOPE_RULES: Record<Scope, string> = {
  train: 'Training scope: use "proposal" when the user wants a session or change; base weights on their recent sets and recovery from their logged days. Leave "meals" empty and "targets" null unless suggesting a weeklyTarget.',
  food: 'Food scope: use "meals" (max 3) when suggesting what to eat; each must fit the remaining calories and protein for the day, respect the diet template, and avoid the user\'s allergens. Leave "proposal" null. Meal values are estimates.',
  progress: 'Progress scope: explain trends in weight, measurements, volume, consistency and records. Use "targets" only when a change is clearly justified by the data. Leave "proposal" null and "meals" empty.',
  general: 'General scope: you may use proposal, meals or targets when relevant.',
}
const PROMPTS = {
  coach: (scope: Scope) => `${BASE} You are embedded in the "${scope}" area of the app and must answer ONLY from that area's data provided below. Always quote the user's actual numbers (dates, weights, kcal, grams) and never give generic advice. If the data is too thin to answer, say exactly what to log first. Reply ONLY with JSON: {"answer": string, "proposal": null | {"name": string, "type": "strength"|"cardio"|"hiit"|"mobility"|"bodyweight"|"custom", "exercises": [{"exerciseId": string, "sets": number, "reps": number, "seconds": number, "rest": number}]}, "meals": [{"name": string, "portion_g": number, "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number}], "targets": null | {"weeklyTarget"?: number, "kcalTarget"?: number, "proteinTarget"?: number}}. ${SCOPE_RULES[scope]} exerciseId must come from: ${EX_LIST()}. Use reps=0 with seconds>0 for timed work. Keep "answer" under 120 words.`,
  planner: () => `${BASE} Reply ONLY with JSON: {"name": string, "weeks": number (4-12), "notes": string, "sessions": [{"day": string, "name": string, "type": "strength"|"cardio"|"hiit"|"mobility"|"bodyweight"|"custom", "exercises": [{"exerciseId": string, "sets": number, "reps": number, "seconds": number, "rest": number}]}]}. One entry in "sessions" per weekly training day, repeated each week with progression described in notes. exerciseId must come from: ${EX_LIST()}. If injuries are mentioned use conservative volume and intensity and add a safety note.`,
  food: () => `${BASE} Estimate the food in the photo. Reply ONLY with JSON: {"name": string, "portion_g": number, "kcal": number, "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": number between 0 and 1}.`,
  summary: () => `${BASE} Summarize the completed workout in at most 80 words and finish with one tip. No diagnosis.`,
}

/* ---- Core runner with usage cap and error mapping ---- */
interface CallOpts { feature: keyof typeof PROMPTS; chars: number; run: (adapter: (typeof ADAPTERS)[keyof typeof ADAPTERS], key: string, model: string) => Promise<string> }

async function call({ chars, run }: CallOpts): Promise<string> {
  if (!navigator.onLine) throw new AiError('network', "You're offline. Try again when you're back online.")
  const k = await readKey()
  if (!k) throw new AiError('nokey', 'No AI key is connected.')
  const { rec, apiKey } = k
  const adapter = ADAPTERS[rec.provider]
  const price = PRICES[rec.provider]
  const tin = adapter.estimateTokens(chars)
  const cost = (tin * price.in + 600 * price.out) / 1e6
  const month = monthKey()
  const used = rec.usageMonth === month ? rec.usageEstimateUsd : 0
  if (rec.monthlyCapUsd != null && used + cost > rec.monthlyCapUsd)
    throw new AiError('cap', `This request would pass your monthly cap of $${rec.monthlyCapUsd.toFixed(2)} (about $${used.toFixed(2)} used, an estimate). Raise the cap in Settings to continue.`)
  const attempt = () => run(adapter, apiKey, rec.model)
  let out: string
  try {
    try {
      out = await attempt()
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) {
        await new Promise((r) => setTimeout(r, Math.min(10, e.retryAfter || 2) * 1000))
        out = await attempt()
      } else throw e
    }
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401 || e.status === 403) throw new AiError('rejected', 'Your key was rejected. Check it in Settings.')
      if (e.status === 429) throw new AiError('ratelimit', 'The provider is rate limiting requests. Wait a moment and try again.')
      throw new AiError('other', `The provider returned an error (${e.status}). Try again.`)
    }
    throw new AiError('network', "Couldn't reach the AI provider. Check your connection and try again.")
  }
  await db.aiKey.update('key', { usageMonth: month, usageEstimateUsd: used + cost })
  return out
}

const parseJson = (s: string): unknown => JSON.parse(s.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim())

/** Runs a JSON request, validates, and does one repair retry. */
async function jsonCall<T>(feature: keyof typeof PROMPTS, send: (extra?: string) => Promise<string>, validate: (v: unknown) => T): Promise<T> {
  void feature
  const first = await send()
  try { return validate(parseJson(first)) } catch { /* fall through to repair */ }
  const second = await send('Your previous reply was not valid JSON for the required schema. Reply again with ONLY the valid JSON.')
  try { return validate(parseJson(second)) } catch {
    throw new AiError('malformed', "The AI reply wasn't in a usable format. You can enter the values manually.")
  }
}

/* ---- Validators ---- */
const TYPES: SessionType[] = ['strength', 'cardio', 'hiit', 'mobility', 'bodyweight', 'custom']
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo))
function exercises(v: unknown): TemplateExercise[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error('exercises')
  const out = v.filter((x) => x && EXERCISE_MAP[x.exerciseId]).map((x) => ({
    exerciseId: String(x.exerciseId), sets: Math.round(clamp(x.sets, 1, 10)), reps: Math.round(clamp(x.reps, 0, 100)),
    seconds: Math.round(clamp(x.seconds, 0, 3600)), rest: Math.round(clamp(x.rest, 0, 600)),
  })).map((x) => (x.reps === 0 && x.seconds === 0 ? { ...x, reps: 10 } : x))
  if (!out.length) throw new Error('exercises')
  return out
}
export interface Proposal { name: string; type: SessionType; exercises: TemplateExercise[] }
const proposal = (p: { name?: unknown; type?: unknown; exercises?: unknown }): Proposal => ({
  name: String(p.name ?? 'AI session').slice(0, 60),
  type: TYPES.includes(p.type as SessionType) ? (p.type as SessionType) : 'custom',
  exercises: exercises(p.exercises),
})
export interface Plan { name: string; weeks: number; notes: string; sessions: (Proposal & { day: string })[] }
export interface FoodGuess { name: string; portion_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; confidence: number }

/* ---- Context builders: minimum data only, no personal identifiers ---- */
export async function recentContext(days: number) {
  const since = addDays(dateKey(), -days)
  const [w, ent, mets] = await Promise.all([
    db.workouts.where('date').aboveOrEqual(since).toArray(),
    db.entries.where('date').aboveOrEqual(since).toArray(),
    db.metrics.where('date').aboveOrEqual(since).toArray(),
  ])
  const s = useSettings.getState()
  const byDay: Record<string, { kcal: number; protein: number }> = {}
  for (const d of new Set(ent.map((e) => e.date))) byDay[d] = macroTotals(ent.filter((e) => e.date === d))
  return {
    goal: s.goalFocus, weeklyTarget: s.weeklyTarget, units: s.units, kcalTarget: s.kcalTarget, proteinTarget: s.proteinTarget,
    workouts: w.filter((x) => x.status === 'completed').map((x) => ({ date: x.date, name: x.name, type: x.type, volumeKg: Math.round(x.volume), minutes: Math.round((x.endedAt - x.startedAt) / 60000) })),
    nutritionByDay: Object.fromEntries(Object.entries(byDay).map(([d, t]) => [d, { kcal: Math.round(t.kcal), protein: Math.round(t.protein) }])),
    weights: mets.filter((m) => m.weightKg).map((m) => ({ date: m.date, kg: m.weightKg })),
  }
}

/* ---- Per-area context: each assistant only sees the data that fits where it lives ---- */
const r1 = (n: number) => Math.round(n * 10) / 10
async function trainContext() {
  const since = Date.now() - 56 * 86400000
  const [workouts, sets, templates] = await Promise.all([
    db.workouts.where('startedAt').above(since).toArray(),
    db.sets.where('completedAt').above(since).toArray(),
    db.templates.filter((t) => !t.archived).toArray(),
  ])
  const per: Record<string, { reps: number; kg: number; date: string }[]> = {}
  sets.filter((x) => x.status === 'done').sort((a, b) => b.completedAt - a.completedAt).forEach((x) => {
    const k = EXERCISE_MAP[x.exerciseId]?.name ?? x.exerciseId
    ;(per[k] ??= []).length < 6 && per[k].push({ reps: x.reps, kg: x.weightKg, date: dateKey(new Date(x.completedAt)) })
  })
  const s = useSettings.getState()
  return {
    goal: s.goalFocus, weeklyTarget: s.weeklyTarget, units: s.units, equipment: s.equipment,
    sessionsLast8Weeks: workouts.filter((w) => w.status === 'completed').map((w) => ({ date: w.date, name: w.name, type: w.type, minutes: Math.round((w.endedAt - w.startedAt) / 60000), volumeKg: Math.round(w.volume) })),
    abandoned: workouts.filter((w) => w.status === 'abandoned').length,
    recentSetsByExercise: per,
    savedTemplates: templates.map((t) => ({ name: t.name, type: t.type, exercises: t.exercises.map((e) => EXERCISE_MAP[e.exerciseId]?.name) })),
  }
}
async function foodContext(date: string) {
  const [today, week, water] = await Promise.all([
    db.entries.where('date').equals(date).toArray(),
    db.entries.where('date').between(addDays(date, -7), date, true, false).toArray(),
    db.water.get(date),
  ])
  const s = useSettings.getState()
  const t = macroTotals(today)
  const days: Record<string, { kcal: number; protein: number }> = {}
  for (const d of new Set(week.map((e) => e.date))) { const m = macroTotals(week.filter((e) => e.date === d)); days[d] = { kcal: Math.round(m.kcal), protein: Math.round(m.protein) } }
  return {
    date, diet: s.diet || 'none', allergens: s.allergens,
    targets: { kcal: s.kcalTarget, proteinG: s.proteinTarget, waterMl: s.waterGoal },
    loggedToday: today.map((e) => ({ meal: e.meal, name: e.name, grams: Math.round(e.servingG), kcal: Math.round(e.kcal), proteinG: Math.round(e.protein), carbsG: Math.round(e.carbs), fatG: Math.round(e.fat), estimate: e.isEstimate })),
    totalsToday: { kcal: Math.round(t.kcal), proteinG: Math.round(t.protein), carbsG: Math.round(t.carbs), fatG: Math.round(t.fat) },
    remainingToday: { kcal: Math.round(s.kcalTarget - t.kcal), proteinG: Math.round(s.proteinTarget - t.protein) },
    waterMlToday: water?.ml ?? 0,
    previous7Days: days,
    trainedToday: (await db.workouts.where('date').equals(date).count()) > 0,
  }
}
async function progressContext() {
  const [metrics, workouts, sets] = await Promise.all([db.metrics.orderBy('date').toArray(), db.workouts.toArray(), db.sets.toArray()])
  const s = useSettings.getState()
  const done = workouts.filter((w) => w.status === 'completed')
  const wk = weekStart()
  const weekly = Array.from({ length: 8 }, (_, i) => { const ws = addDays(wk, (i - 7) * 7); const inW = done.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)); return { weekOf: ws, sessions: inW.length, volumeKg: Math.round(inW.reduce((a, w) => a + w.volume, 0)) } })
  const best: Record<string, number> = {}
  sets.forEach((x) => { if (x.status === 'done') { const v = r1(x.weightKg * (1 + x.reps / 30)); const k = EXERCISE_MAP[x.exerciseId]?.name ?? x.exerciseId; if (x.reps <= 12 && v > (best[k] ?? 0)) best[k] = v } })
  return {
    goal: s.goalFocus, weeklyTarget: s.weeklyTarget, units: s.units, totalSessions: done.length,
    weightsKg: metrics.filter((m) => m.weightKg).slice(-40).map((m) => ({ date: m.date, kg: m.weightKg })),
    measurementsCm: metrics.filter((m) => m.waist || m.chest || m.hip || m.arm || m.thigh).slice(-10).map((m) => ({ date: m.date, waist: m.waist, chest: m.chest, hip: m.hip, arm: m.arm, thigh: m.thigh })),
    weeklyConsistency: weekly, estimated1RMKg: best,
    targets: { kcal: s.kcalTarget, proteinG: s.proteinTarget },
  }
}
export async function scopeContext(scope: Scope, extra?: { date?: string }) {
  if (scope === 'train') return trainContext()
  if (scope === 'food') return foodContext(extra?.date ?? dateKey())
  if (scope === 'progress') return progressContext()
  return recentContext(14)
}

/* ---- Features ---- */
export interface MealIdea { name: string; portion_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }
export interface Targets { weeklyTarget?: number; kcalTarget?: number; proteinTarget?: number }
export interface CoachResult { answer: string; proposal: Proposal | null; meals: MealIdea[]; targets: Targets | null }

export async function coachAsk(history: AiMessage[], scope: Scope = 'general', extra?: { date?: string }): Promise<CoachResult> {
  const ctx = JSON.stringify(await scopeContext(scope, extra))
  const system = `${PROMPTS.coach(scope)}\nUser data for the ${scope} area: ${ctx}`
  return jsonCall('coach', (more) => {
    const messages = more ? [...history, { role: 'user' as const, content: more }] : history
    return call({ feature: 'coach', chars: system.length + messages.reduce((a, m) => a + m.content.length, 0), run: (a, k, m) => a.sendText(k, m, { system, messages, json: true }) })
  }, (v) => {
    const o = v as { answer?: string; proposal?: { name?: unknown; type?: unknown; exercises?: unknown } | null; meals?: Record<string, unknown>[]; targets?: Record<string, unknown> | null }
    if (typeof o.answer !== 'string') throw new Error('answer')
    let p: Proposal | null = null
    if (o.proposal && scope !== 'food' && scope !== 'progress') { try { p = proposal(o.proposal) } catch { p = null } }
    const meals = (scope === 'food' || scope === 'general') && Array.isArray(o.meals)
      ? o.meals.filter((m) => typeof m?.name === 'string').slice(0, 3).map((m) => ({ name: String(m.name).slice(0, 80), portion_g: clamp(m.portion_g, 1, 5000), kcal: clamp(m.kcal, 0, 5000), protein_g: clamp(m.protein_g, 0, 500), carbs_g: clamp(m.carbs_g, 0, 500), fat_g: clamp(m.fat_g, 0, 500) }))
      : []
    let targets: Targets | null = null
    if (o.targets && typeof o.targets === 'object') {
      const t = o.targets
      targets = {}
      if (t.weeklyTarget != null) targets.weeklyTarget = Math.round(clamp(t.weeklyTarget, 1, 7))
      if (t.kcalTarget != null) targets.kcalTarget = Math.round(clamp(t.kcalTarget, 1000, 6000))
      if (t.proteinTarget != null) targets.proteinTarget = Math.round(clamp(t.proteinTarget, 30, 400))
      if (!Object.keys(targets).length) targets = null
    }
    return { answer: o.answer, proposal: p, meals, targets }
  })
}

/** Builder: ask for a session that fits the type, length, muscle and the user's own history. */
export async function suggestSession(o: { type: SessionType; minutes: number; muscle: string }): Promise<Proposal> {
  const r = await coachAsk([{ role: 'user', content: `Build one ${o.type} session of about ${o.minutes} minutes${o.muscle ? ` focused on ${o.muscle}` : ''}. Respect my equipment and recent training. Always return a proposal.` }], 'train')
  if (!r.proposal) throw new AiError('malformed', "The AI didn't return a session. Try again.")
  return r.proposal
}

export interface PlanInput { goal: string; days: number; equipment: string; experience: string; injuries: string }
export async function generatePlan(i: PlanInput): Promise<Plan> {
  const system = PROMPTS.planner()
  const content = `Goal: ${i.goal}. Training days per week: ${i.days}. Equipment: ${i.equipment || 'none'}. Experience: ${i.experience}. Injuries or limitations: ${i.injuries || 'none'}.`
  return jsonCall('planner', (extra) => {
    const messages = [{ role: 'user' as const, content: extra ? `${content}\n${extra}` : content }]
    return call({ feature: 'planner', chars: system.length + content.length, run: (a, k, m) => a.sendText(k, m, { system, messages, json: true, maxTokens: 2500 }) })
  }, (v) => {
    const o = v as { name?: string; weeks?: number; notes?: string; sessions?: { day?: string }[] & { name?: unknown; type?: unknown; exercises?: unknown }[] }
    if (!Array.isArray(o.sessions) || o.sessions.length === 0) throw new Error('sessions')
    return {
      name: String(o.name ?? 'AI plan').slice(0, 60), weeks: Math.round(clamp(o.weeks, 4, 12)), notes: String(o.notes ?? ''),
      sessions: o.sessions.map((s) => ({ ...proposal(s as never), day: String((s as { day?: string }).day ?? '') })),
    }
  })
}

export async function scanFood(imageDataUrl: string, hint: string): Promise<FoodGuess> {
  const system = PROMPTS.food()
  const text = hint ? `Hint from user: ${hint}` : 'Estimate this meal.'
  return jsonCall('food', (extra) =>
    call({ feature: 'food', chars: system.length + text.length + 1500, run: (a, k, m) => a.sendImageWithText(k, m, { system, text: extra ? `${text}\n${extra}` : text, imageDataUrl, json: true }) }),
  (v) => {
    const o = v as Record<string, unknown>
    if (typeof o.name !== 'string') throw new Error('name')
    return { name: o.name.slice(0, 80), portion_g: clamp(o.portion_g, 1, 5000), kcal: clamp(o.kcal, 0, 10000), protein_g: clamp(o.protein_g, 0, 1000), carbs_g: clamp(o.carbs_g, 0, 1000), fat_g: clamp(o.fat_g, 0, 1000), confidence: clamp(o.confidence, 0, 1) }
  })
}

export async function workoutSummary(w: { name: string; type: string; minutes: number; sets: { exercise: string; reps: number; kg: number }[] }): Promise<string> {
  const system = PROMPTS.summary()
  const vol = volume(w.sets.map((s) => ({ weightKg: s.kg, reps: s.reps, status: 'done' as const })))
  const content = JSON.stringify({ ...w, volumeKg: Math.round(vol) })
  return call({ feature: 'summary', chars: system.length + content.length, run: (a, k, m) => a.sendText(k, m, { system, messages: [{ role: 'user', content }], maxTokens: 200 }) })
}

/** One minimal request to confirm the key works. Surfaces the provider's own reason on failure. */
export async function testKey(provider: keyof typeof ADAPTERS, key: string, model: string) {
  try {
    await ADAPTERS[provider].sendText(key, model, { system: 'Reply with OK.', messages: [{ role: 'user', content: 'ping' }], maxTokens: 16 })
  } catch (e) {
    if (e instanceof HttpError) {
      const why = e.detail ? ` Provider said: "${e.detail}"` : ''
      if (e.status === 401 || e.status === 403) throw new AiError('rejected', `The provider rejected this key (${e.status}). Check you copied the whole key and picked the matching provider.${why}`)
      if (e.status === 404 || e.status === 400) throw new AiError('other', `The provider doesn't accept the model "${model}" (${e.status}). Try another model name.${why}`)
      if (e.status === 429) throw new AiError('ratelimit', `The key works but the account is rate limited or out of credit (429).${why}`)
      throw new AiError('other', `The provider returned an error (${e.status}).${why}`)
    }
    throw new AiError('network', "Couldn't reach the provider. This can be a network block, an ad blocker or a browser extension. Check your connection, or use Save without testing.")
  }
}

export async function saveConversation(feature: 'coach' | 'advisor' | 'planner' | 'food_scan' | 'summary', messages: AiMessage[], id?: number) {
  if (localStorage.getItem('pulse-ai-history') === 'off') return id
  if (id) { await db.conversations.update(id, { messages }); return id }
  return db.conversations.add({ feature, createdAt: Date.now(), messages, saved: true })
}
