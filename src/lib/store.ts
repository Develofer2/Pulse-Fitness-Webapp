import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db, type SetLog } from './db'
import { EXERCISE_MAP, type SessionType, type TemplateExercise } from './exercises'
import { dateKey, est1RM, overloadSuggestion, volume } from './domain'

/* ---------------- Settings ---------------- */
export type Theme = 'system' | 'light' | 'dark'
interface SettingsState {
  theme: Theme
  units: 'kg' | 'lb'
  onboarded: boolean
  goalFocus: string
  equipment: string[]
  weeklyTarget: number
  kcalTarget: number
  proteinTarget: number
  waterGoal: number
  haptics: boolean
  sound: boolean
  allergens: string[]
  diet: string
  reminderWorkout: string
  reminderWater: boolean
  lockHash: string
  lockSalt: string
  lockMinutes: number
  autoFlow: boolean
  tempo: number
  set: (p: Partial<Omit<SettingsState, 'set'>>) => void
}
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      units: 'kg',
      onboarded: false,
      goalFocus: 'strength',
      equipment: [],
      weeklyTarget: 3,
      kcalTarget: 2200,
      proteinTarget: 140,
      waterGoal: 2500,
      haptics: true,
      sound: true,
      allergens: [],
      diet: '',
      reminderWorkout: '',
      reminderWater: false,
      lockHash: '',
      lockSalt: '',
      lockMinutes: 5,
      autoFlow: true,
      tempo: 3,
      set: (p) => set(p),
    }),
    { name: 'pulse-settings' },
  ),
)

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0b09' : '#f4f4ef')
}

export function feedback(kind: 'tap' | 'done' = 'tap') {
  const s = useSettings.getState()
  if (s.haptics && 'vibrate' in navigator) navigator.vibrate(kind === 'done' ? [30, 40, 30] : 12)
  if (s.sound && kind === 'done') {
    try {
      const Ctx = window.AudioContext
      const ctx = new Ctx()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.value = 0.06
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.18)
      o.onended = () => ctx.close()
    } catch { /* unsupported */ }
  }
}

/* ---------------- Active session ---------------- */
/** Seconds of lead-in before each set starts when auto flow is on. */
export const LEAD_MS = 3000
const workAt = () => Date.now() + LEAD_MS

export type Phase = 'idle' | 'preview' | 'running' | 'resting' | 'finished'

export interface SessionExercise extends TemplateExercise {
  name: string
  suggested: number | null
}
export interface LoggedSet {
  exerciseId: string
  setIndex: number
  reps: number
  weightKg: number
  seconds: number
  status: 'done' | 'skipped'
  completedAt: number
}
export interface PR { exerciseId: string; value: number }

interface SessionState {
  phase: Phase
  templateId: number | null
  name: string
  type: SessionType
  items: SessionExercise[]
  exIdx: number
  setIdx: number
  weightKg: number
  reps: number
  logged: LoggedSet[]
  startedAt: number
  // timestamp timer
  restStart: number
  restTotal: number
  workStart: number
  pausedAt: number | null
  prs: PR[]
  savedId: number | null
  prepare: (t: { id?: number | null; name: string; type: SessionType; exercises: TemplateExercise[] }) => Promise<void>
  begin: () => void
  completeSet: (repsDone?: number) => void
  skipExercise: () => void
  skipRest: () => void
  adjust: (p: { weightKg?: number; reps?: number }) => void
  togglePause: () => void
  undoLast: () => void
  finish: (abandon?: boolean) => Promise<void>
  reset: () => void
}

const blank = {
  phase: 'idle' as Phase,
  templateId: null,
  name: '',
  type: 'strength' as SessionType,
  items: [],
  exIdx: 0,
  setIdx: 0,
  weightKg: 0,
  reps: 0,
  logged: [],
  startedAt: 0,
  restStart: 0,
  restTotal: 0,
  workStart: 0,
  pausedAt: null,
  prs: [],
  savedId: null,
}

async function lastValues(exerciseId: string, targetReps: number) {
  const unit = useSettings.getState().units
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  const byWorkout = new Map<number, SetLog[]>()
  sets.sort((a, b) => b.completedAt - a.completedAt).forEach((s) => {
    byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s])
  })
  const history = [...byWorkout.values()].slice(0, 2)
  const last = history[0]?.find((s) => s.status === 'done')
  return { weightKg: last?.weightKg ?? 0, suggested: overloadSuggestion(history, targetReps, unit) }
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      ...blank,
      prepare: async (t) => {
        const items: SessionExercise[] = []
        for (const x of t.exercises) {
          const lv = await lastValues(x.exerciseId, x.reps)
          items.push({ ...x, name: EXERCISE_MAP[x.exerciseId]?.name ?? x.exerciseId, suggested: lv.suggested })
        }
        const first = items[0]
        const lv = first ? await lastValues(first.exerciseId, first.reps) : { weightKg: 0, suggested: null }
        set({
          ...blank,
          phase: 'preview',
          templateId: t.id ?? null,
          name: t.name,
          type: t.type,
          items,
          weightKg: first?.suggested ?? lv.weightKg,
          reps: first?.reps ?? 0,
        })
      },
      begin: () => set({ phase: 'running', startedAt: Date.now(), workStart: workAt(), pausedAt: null }),
      completeSet: (repsDone) => {
        const s = get()
        const it = s.items[s.exIdx]
        if (!it || s.phase !== 'running') return
        feedback('done')
        const log: LoggedSet = {
          exerciseId: it.exerciseId,
          setIndex: s.setIdx,
          reps: it.seconds > 0 ? 0 : Math.max(0, repsDone ?? s.reps),
          weightKg: s.weightKg,
          seconds: it.seconds,
          status: 'done',
          completedAt: Date.now(),
        }
        const logged = [...s.logged, log]
        const lastSet = s.setIdx + 1 >= it.sets
        const lastEx = s.exIdx + 1 >= s.items.length
        if (lastSet && lastEx) {
          set({ logged })
          void get().finish()
          return
        }
        const nextEx = lastSet ? s.items[s.exIdx + 1] : it
        set({
          logged,
          phase: 'resting',
          restStart: Date.now(),
          restTotal: it.rest * 1000,
          pausedAt: null,
          exIdx: lastSet ? s.exIdx + 1 : s.exIdx,
          setIdx: lastSet ? 0 : s.setIdx + 1,
          reps: nextEx.reps,
          weightKg: lastSet ? nextEx.suggested ?? 0 : nextEx.suggested ?? s.weightKg,
        })
        if (lastSet) {
          void lastValues(nextEx.exerciseId, nextEx.reps).then((lv) => {
            if (get().items[get().exIdx]?.exerciseId === nextEx.exerciseId)
              set({ weightKg: nextEx.suggested ?? lv.weightKg })
          })
        }
      },
      skipExercise: () => {
        const s = get()
        const it = s.items[s.exIdx]
        if (!it) return
        const skipped: LoggedSet[] = Array.from({ length: it.sets - s.setIdx }, (_, i) => ({
          exerciseId: it.exerciseId, setIndex: s.setIdx + i, reps: 0, weightKg: 0, seconds: 0, status: 'skipped', completedAt: Date.now(),
        }))
        const logged = [...s.logged, ...skipped]
        if (s.exIdx + 1 >= s.items.length) {
          set({ logged })
          void get().finish()
          return
        }
        const next = s.items[s.exIdx + 1]
        set({ logged, exIdx: s.exIdx + 1, setIdx: 0, phase: 'running', workStart: workAt(), pausedAt: null, reps: next.reps, weightKg: next.suggested ?? 0 })
        void lastValues(next.exerciseId, next.reps).then((lv) => {
          if (get().items[get().exIdx]?.exerciseId === next.exerciseId) set({ weightKg: next.suggested ?? lv.weightKg })
        })
      },
      skipRest: () => set({ phase: 'running', pausedAt: null, workStart: workAt() }),
      adjust: (p) => set(p),
      togglePause: () => {
        const s = get()
        if (s.pausedAt) {
          // shift the rest timer forward by the paused span
          const gap = Date.now() - s.pausedAt
          set({ restStart: s.restStart + gap, workStart: s.workStart + gap, pausedAt: null })
        } else set({ pausedAt: Date.now() })
      },
      undoLast: () => {
        const s = get()
        const last = s.logged[s.logged.length - 1]
        if (!last) return
        const idx = s.items.findIndex((i) => i.exerciseId === last.exerciseId)
        set({ logged: s.logged.slice(0, -1), exIdx: idx, setIdx: last.setIndex, phase: 'running', workStart: workAt(), pausedAt: null, reps: last.reps, weightKg: last.weightKg })
      },
      finish: async (abandon = false) => {
        const s = get()
        const done = s.logged.filter((l) => l.status === 'done')
        if (abandon && done.length === 0) {
          set({ ...blank })
          return
        }
        const endedAt = Date.now()
        const prs: PR[] = []
        // personal records: est 1RM vs stored best
        for (const id of new Set(done.map((d) => d.exerciseId))) {
          const prev = await db.sets.where('exerciseId').equals(id).toArray()
          const best = Math.max(0, ...prev.map((p) => (p.status === 'done' ? est1RM(p.weightKg, p.reps) : 0)))
          const now = Math.max(0, ...done.filter((d) => d.exerciseId === id).map((d) => est1RM(d.weightKg, d.reps)))
          if (now > best && now > 0 && prev.length > 0) prs.push({ exerciseId: id, value: now })
        }
        const savedId = await db.transaction('rw', db.workouts, db.sets, async () => {
          const wid = await db.workouts.add({
            templateId: s.templateId,
            name: s.name,
            type: s.type,
            startedAt: s.startedAt,
            endedAt,
            status: abandon ? 'abandoned' : 'completed',
            date: dateKey(new Date(s.startedAt)),
            volume: volume(done.map((d) => ({ ...d, status: 'done' as const }))),
          })
          await db.sets.bulkAdd(s.logged.map((l) => ({ ...l, workoutId: wid })))
          return wid
        })
        if (!abandon && navigator.storage?.persist) void navigator.storage.persist()
        set({ phase: 'finished', prs, savedId, pausedAt: null })
      },
      reset: () => set({ ...blank }),
    }),
    { name: 'pulse-session', partialize: (s) => ({ ...s, prepare: undefined } as never) },
  ),
)
