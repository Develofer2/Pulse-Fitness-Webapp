import Dexie, { type Table } from 'dexie'
import type { SessionType, TemplateExercise } from './exercises'

export interface Template {
  id?: number
  name: string
  type: SessionType
  exercises: TemplateExercise[]
  archived: boolean
  createdAt: number
}
export interface WorkoutLog {
  id?: number
  templateId: number | null
  name: string
  type: SessionType
  startedAt: number
  endedAt: number
  status: 'completed' | 'abandoned'
  date: string
  volume: number
}
export interface SetLog {
  id?: number
  workoutId: number
  exerciseId: string
  setIndex: number
  reps: number
  weightKg: number
  seconds: number
  status: 'done' | 'skipped'
  completedAt: number
}
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
export interface FoodEntry {
  id?: number
  date: string
  meal: Meal
  name: string
  brand: string
  servingG: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  source: 'barcode' | 'manual' | 'search' | 'photo' | 'recipe' | 'ai'
  isEstimate: boolean
  ingredients?: string
  createdAt: number
}
export interface Food {
  id?: number
  barcode: string | null
  name: string
  brand: string
  per100: { kcal: number; protein: number; carbs: number; fat: number }
  servingG: number
  custom: boolean
  cachedAt: number
  ingredients?: string
}
export interface Metric {
  id?: number
  date: string
  weightKg?: number
  waist?: number
  chest?: number
  hip?: number
  arm?: number
  thigh?: number
}
export interface RecipeIngredient { name: string; grams: number; per100: { kcal: number; protein: number; carbs: number; fat: number } }
export interface Recipe { id?: number; name: string; servings: number; ingredients: RecipeIngredient[] }
export interface Media { id?: number; date: string; blob: Blob; createdAt: number }
export interface AiMessage { role: 'user' | 'assistant'; content: string }
export interface AiConversation { id?: number; feature: 'coach' | 'advisor' | 'planner' | 'food_scan' | 'summary'; createdAt: number; messages: AiMessage[]; saved: boolean }
export interface AiKeyRecord {
  id: 'key'
  provider: 'openai' | 'anthropic' | 'gemini'
  cryptoKey: CryptoKey
  encrypted: ArrayBuffer
  iv: Uint8Array
  last4: string
  model: string
  monthlyCapUsd: number | null
  usageMonth: string
  usageEstimateUsd: number
}
export interface AchievementRow { id: string; unlockedAt: number }
export interface CustomExercise { id: string; name: string; muscles: string[]; equipment: string[]; difficulty: 'beginner' | 'intermediate' | 'advanced'; cues: string[]; timed: boolean }
export interface Water {
  date: string
  ml: number
}

class PulseDB extends Dexie {
  templates!: Table<Template, number>
  workouts!: Table<WorkoutLog, number>
  sets!: Table<SetLog, number>
  entries!: Table<FoodEntry, number>
  foods!: Table<Food, number>
  metrics!: Table<Metric, number>
  water!: Table<Water, string>
  recipes!: Table<Recipe, number>
  media!: Table<Media, number>
  conversations!: Table<AiConversation, number>
  aiKey!: Table<AiKeyRecord, string>
  achievements!: Table<AchievementRow, string>
  customExercises!: Table<CustomExercise, string>

  constructor() {
    super('pulse-fitness')
    this.version(1).stores({
      templates: '++id, archived',
      workouts: '++id, startedAt, templateId, date',
      sets: '++id, workoutId, exerciseId, completedAt',
      entries: '++id, date, meal',
      foods: '++id, &barcode, name',
      metrics: '++id, &date',
      water: 'date',
    })
    // v2 adds recipes, photos, AI data, achievements and custom exercises. Existing tables are untouched.
    this.version(2).stores({
      recipes: '++id, name',
      media: '++id, date',
      conversations: '++id, feature, createdAt',
      aiKey: 'id',
      achievements: 'id',
      customExercises: 'id',
    })
  }
}

export const db = new PulseDB()

export async function seedIfEmpty() {
  if ((await db.templates.count()) > 0) return
  await db.templates.bulkAdd([
    {
      name: 'Full body strength',
      type: 'strength',
      archived: false,
      createdAt: Date.now(),
      exercises: [
        { exerciseId: 'goblet', sets: 3, reps: 10, seconds: 0, rest: 75 },
        { exerciseId: 'db-press', sets: 3, reps: 8, seconds: 0, rest: 90 },
        { exerciseId: 'db-row', sets: 3, reps: 10, seconds: 0, rest: 75 },
        { exerciseId: 'db-rdl', sets: 3, reps: 10, seconds: 0, rest: 75 },
        { exerciseId: 'plank', sets: 2, reps: 0, seconds: 40, rest: 45 },
      ],
    },
    {
      name: '20-minute HIIT',
      type: 'hiit',
      archived: false,
      createdAt: Date.now() + 1,
      exercises: [
        { exerciseId: 'jump-squat', sets: 4, reps: 0, seconds: 40, rest: 20 },
        { exerciseId: 'mtn-climber', sets: 4, reps: 0, seconds: 40, rest: 20 },
        { exerciseId: 'burpee', sets: 4, reps: 0, seconds: 40, rest: 20 },
      ],
    },
    {
      name: 'Morning mobility',
      type: 'mobility',
      archived: false,
      createdAt: Date.now() + 2,
      exercises: ['cat-cow', 'worlds-greatest', 'hip-flexor', 'child-pose'].map((exerciseId) => ({
        exerciseId, sets: 2, reps: 0, seconds: 45, rest: 10,
      })),
    },
  ])
  if ((await db.foods.count()) === 0) {
    const f = (name: string, kcal: number, protein: number, carbs: number, fat: number, servingG = 100) => ({
      barcode: null, name, brand: '', per100: { kcal, protein, carbs, fat }, servingG, custom: false, cachedAt: Date.now(),
    })
    await db.foods.bulkAdd([
      f('Chicken breast, cooked', 165, 31, 0, 3.6, 120),
      f('Egg, whole', 143, 12.6, 0.7, 9.5, 50),
      f('Greek yogurt, plain', 59, 10, 3.6, 0.4, 170),
      f('Oats, dry', 379, 13, 67, 6.5, 40),
      f('Banana', 89, 1.1, 23, 0.3, 118),
      f('Brown rice, cooked', 123, 2.7, 26, 1, 160),
      f('Salmon, baked', 206, 22, 0, 12, 140),
      f('Avocado', 160, 2, 8.5, 15, 100),
      f('Whole milk', 61, 3.2, 4.8, 3.3, 240),
      f('Almonds', 579, 21, 22, 50, 28),
      f('Sweet potato, baked', 90, 2, 21, 0.2, 130),
      f('Whole wheat bread', 247, 13, 41, 3.4, 40),
      f('Broccoli, steamed', 35, 2.4, 7.2, 0.4, 90),
      f('Peanut butter', 588, 25, 20, 50, 32),
      f('Cottage cheese', 98, 11, 3.4, 4.3, 110),
      f('Apple', 52, 0.3, 14, 0.2, 180),
      f('Tuna, canned in water', 116, 26, 0, 0.8, 100),
      f('Lentils, cooked', 116, 9, 20, 0.4, 150),
    ])
  }
}
