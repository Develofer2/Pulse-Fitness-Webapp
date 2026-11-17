import type { FoodEntry, SetLog, WorkoutLog } from './db'

export const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (k: string, n: number) => {
  const d = parseKey(k)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000)

/** Monday-start week key for local date */
export const weekStart = (k = dateKey()) => {
  const d = parseKey(k)
  const dow = (d.getDay() + 6) % 7
  return addDays(k, -dow)
}

export const setVolume = (s: Pick<SetLog, 'weightKg' | 'reps' | 'status'>) =>
  s.status === 'done' ? s.weightKg * s.reps : 0
export const volume = (sets: Pick<SetLog, 'weightKg' | 'reps' | 'status'>[]) =>
  sets.reduce((a, s) => a + setVolume(s), 0)

/** Epley, only for sets of 12 reps or fewer */
export const est1RM = (w: number, reps: number) => (reps > 0 && reps <= 12 && w > 0 ? w * (1 + reps / 30) : 0)

export const macroTotals = (entries: FoodEntry[]) =>
  entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

export function streak(workouts: WorkoutLog[], entries: FoodEntry[], today = dateKey()) {
  const active = new Set<string>()
  workouts.forEach((w) => w.status === 'completed' && active.add(w.date))
  entries.forEach((e) => active.add(e.date))
  const oldest = [...active].sort()[0]
  let count = 0
  let lastFreeze: string | null = null // a freeze only counts as used once the streak continues past it
  let pending: string | null = null
  let d = active.has(today) ? today : addDays(today, -1)
  while (oldest && d >= oldest) {
    if (active.has(d)) {
      count++
      if (pending) { lastFreeze = pending; pending = null }
    } else if (pending === null && (lastFreeze === null || daysBetween(d, lastFreeze) >= 7)) pending = d
    else break
    d = addDays(d, -1)
  }
  const freezeUsedRecently = lastFreeze !== null && daysBetween(lastFreeze, today) < 7
  return { count, freezesLeft: freezeUsedRecently ? 0 : 1 }
}

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`

export const KG_PER_LB = 0.45359237
export const toDisplay = (kg: number, units: 'kg' | 'lb') => (units === 'kg' ? kg : kg / KG_PER_LB)
export const fromDisplay = (v: number, units: 'kg' | 'lb') => (units === 'kg' ? v : v * KG_PER_LB)
export const round1 = (n: number) => Math.round(n * 10) / 10

/** Rule-based progressive overload: last two sessions hit all reps at the same weight. */
export function overloadSuggestion(history: SetLog[][], targetReps: number, unit: 'kg' | 'lb') {
  if (history.length < 2) return null
  const [a, b] = history
  const ok = (s: SetLog[]) => s.length > 0 && s.every((x) => x.status === 'done' && x.reps >= targetReps)
  const wa = a[0]?.weightKg
  if (ok(a) && ok(b) && wa > 0 && wa === b[0]?.weightKg) {
    return wa + (unit === 'kg' ? 2.5 : 5 * KG_PER_LB)
  }
  return null
}

export interface Achievement { id: string; label: string; hint: string; unlocked: boolean }
export function achievements(o: { sessions: number; streak: number; prs: number; scanned: number; metrics: number }): Achievement[] {
  return [
    { id: 'first', label: 'First session', hint: 'Complete one workout', unlocked: o.sessions >= 1 },
    { id: 's10', label: '10 sessions', hint: 'Complete ten workouts', unlocked: o.sessions >= 10 },
    { id: 's100', label: '100 sessions', hint: 'Complete one hundred workouts', unlocked: o.sessions >= 100 },
    { id: 'st7', label: '7 day streak', hint: 'Be active seven days in a row', unlocked: o.streak >= 7 },
    { id: 'st30', label: '30 day streak', hint: 'Be active thirty days in a row', unlocked: o.streak >= 30 },
    { id: 'pr', label: 'First PR', hint: 'Beat a previous best', unlocked: o.prs >= 1 },
    { id: 'scan', label: 'First scanned food', hint: 'Look up a barcode', unlocked: o.scanned >= 1 },
    { id: 'metric', label: 'First check-in', hint: 'Log your body weight', unlocked: o.metrics >= 1 },
  ]
}
