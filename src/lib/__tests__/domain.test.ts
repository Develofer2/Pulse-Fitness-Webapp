import { describe, expect, it } from 'vitest'
import { achievements, addDays, est1RM, fromDisplay, macroTotals, overloadSuggestion, streak, toDisplay, volume, weekStart } from '../domain'
import { estimateMinutes } from '../exercises'
import { allergenHits } from '../diet'
import { validFormat } from '../vault'
import type { FoodEntry, SetLog, WorkoutLog } from '../db'

const w = (date: string): WorkoutLog => ({ templateId: null, name: 'x', type: 'strength', startedAt: 0, endedAt: 0, status: 'completed', date, volume: 0 })
const set = (reps: number, weightKg: number, status: 'done' | 'skipped' = 'done'): SetLog => ({ workoutId: 1, exerciseId: 'a', setIndex: 0, reps, weightKg, seconds: 0, status, completedAt: 0 })

describe('volume and 1RM', () => {
  it('sums weight x reps for done sets only', () => {
    expect(volume([{ weightKg: 50, reps: 10, status: 'done' }, { weightKg: 100, reps: 5, status: 'skipped' }])).toBe(500)
  })
  it('uses Epley and ignores sets above 12 reps', () => {
    expect(est1RM(100, 5)).toBeCloseTo(116.67, 1)
    expect(est1RM(40, 15)).toBe(0)
  })
})

describe('streak', () => {
  it('counts consecutive active days', () => {
    expect(streak([w('2025-03-10'), w('2025-03-09'), w('2025-03-08')], [], '2025-03-10').count).toBe(3)
  })
  it('does not break when today is empty', () => {
    expect(streak([w('2025-03-09'), w('2025-03-08')], [], '2025-03-10').count).toBe(2)
  })
  it('uses one freeze per rolling 7 days', () => {
    const r = streak([w('2025-03-10'), w('2025-03-08'), w('2025-03-07')], [], '2025-03-10')
    expect(r.count).toBe(3)
    expect(r.freezesLeft).toBe(0)
  })
  it('breaks on a second miss inside 7 days', () => {
    expect(streak([w('2025-03-10'), w('2025-03-07')], [], '2025-03-10').count).toBe(1)
  })
  it('counts logged food days', () => {
    const e = { date: '2025-03-10' } as FoodEntry
    expect(streak([], [e], '2025-03-10').count).toBe(1)
  })
})

describe('misc domain rules', () => {
  it('totals macros', () => {
    const t = macroTotals([{ kcal: 100, protein: 10, carbs: 5, fat: 2 } as FoodEntry, { kcal: 50, protein: 1, carbs: 1, fat: 1 } as FoodEntry])
    expect(t).toEqual({ kcal: 150, protein: 11, carbs: 6, fat: 3 })
  })
  it('weeks start on Monday', () => {
    expect(weekStart('2025-03-12')).toBe('2025-03-10')
    expect(weekStart('2025-03-16')).toBe('2025-03-10')
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28')
  })
  it('converts units both ways', () => {
    expect(fromDisplay(toDisplay(80, 'lb'), 'lb')).toBeCloseTo(80)
  })
  it('suggests an increase after two clean sessions', () => {
    const a = [set(8, 50), set(8, 50)]
    expect(overloadSuggestion([a, a], 8, 'kg')).toBe(52.5)
    expect(overloadSuggestion([a, [set(6, 50)]], 8, 'kg')).toBeNull()
  })
  it('unlocks achievements', () => {
    const a = achievements({ sessions: 10, streak: 7, prs: 0, scanned: 0, metrics: 0 })
    expect(a.filter((x) => x.unlocked).map((x) => x.id)).toEqual(['first', 's10', 'st7'])
  })
  it('estimates session length', () => {
    expect(estimateMinutes([{ exerciseId: 'a', sets: 3, reps: 8, seconds: 0, rest: 80 }])).toBe(6)
  })
  it('matches allergen keywords', () => {
    expect(allergenHits('Greek yogurt, plain', ['milk', 'egg'])).toEqual(['milk'])
  })
  it('validates key formats', () => {
    expect(validFormat('openai', 'sk-abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(validFormat('anthropic', 'sk-abc')).toBe(false)
  })
})
