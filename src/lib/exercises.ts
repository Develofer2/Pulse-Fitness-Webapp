export type Difficulty = 'beginner' | 'intermediate' | 'advanced'
export type SessionType = 'strength' | 'cardio' | 'hiit' | 'mobility' | 'bodyweight' | 'custom'

export interface Exercise {
  id: string
  name: string
  muscles: string[]
  equipment: string[]
  difficulty: Difficulty
  types: SessionType[]
  cues: string[]
  timed?: boolean
}

const e = (
  id: string,
  name: string,
  muscles: string[],
  equipment: string[],
  difficulty: Difficulty,
  types: SessionType[],
  cues: string[],
  timed = false,
): Exercise => ({ id, name, muscles, equipment, difficulty, types, cues, timed })

export const EXERCISES: Exercise[] = [
  e('bb-squat', 'Barbell back squat', ['legs', 'glutes'], ['barbell'], 'intermediate', ['strength'], ['Brace your core', 'Knees track over toes', 'Drive through mid-foot']),
  e('bb-bench', 'Barbell bench press', ['chest', 'arms'], ['barbell'], 'intermediate', ['strength'], ['Shoulder blades pinched', 'Lower to mid-chest', 'Press in a slight arc']),
  e('deadlift', 'Conventional deadlift', ['back', 'legs', 'glutes'], ['barbell'], 'advanced', ['strength'], ['Bar over mid-foot', 'Flat back', 'Push the floor away']),
  e('ohp', 'Overhead press', ['shoulders', 'arms'], ['barbell'], 'intermediate', ['strength'], ['Squeeze glutes', 'Head through at the top']),
  e('bb-row', 'Barbell row', ['back', 'arms'], ['barbell'], 'intermediate', ['strength'], ['Hinge to 45 degrees', 'Pull to lower ribs']),
  e('db-press', 'Dumbbell bench press', ['chest', 'arms'], ['dumbbell'], 'beginner', ['strength'], ['Wrists stacked over elbows', 'Control the descent']),
  e('goblet', 'Goblet squat', ['legs', 'glutes'], ['dumbbell'], 'beginner', ['strength'], ['Hold weight at chest', 'Sit between your hips']),
  e('db-rdl', 'Dumbbell Romanian deadlift', ['glutes', 'back', 'legs'], ['dumbbell'], 'beginner', ['strength'], ['Soft knees', 'Hips travel back']),
  e('db-row', 'One-arm dumbbell row', ['back', 'arms'], ['dumbbell'], 'beginner', ['strength'], ['Elbow to hip', 'Keep torso still']),
  e('db-shoulder', 'Dumbbell shoulder press', ['shoulders', 'arms'], ['dumbbell'], 'beginner', ['strength'], ['Ribs down', 'Press straight up']),
  e('curl', 'Dumbbell curl', ['arms'], ['dumbbell'], 'beginner', ['strength'], ['Elbows pinned', 'Slow lowering']),
  e('lat-pull', 'Lat pulldown', ['back', 'arms'], ['machine'], 'beginner', ['strength'], ['Chest up', 'Pull elbows to ribs']),
  e('leg-press', 'Leg press', ['legs', 'glutes'], ['machine'], 'beginner', ['strength'], ['Lower back stays flat', 'Do not lock knees']),
  e('pushup', 'Push-up', ['chest', 'arms', 'core'], [], 'beginner', ['bodyweight', 'strength', 'hiit'], ['Body in one line', 'Elbows 45 degrees']),
  e('air-squat', 'Air squat', ['legs', 'glutes'], [], 'beginner', ['bodyweight', 'hiit'], ['Chest tall', 'Full depth you control']),
  e('lunge', 'Reverse lunge', ['legs', 'glutes'], [], 'beginner', ['bodyweight', 'strength'], ['Step back softly', 'Front shin vertical']),
  e('pullup', 'Pull-up', ['back', 'arms'], ['bar'], 'advanced', ['strength', 'bodyweight'], ['Start from a dead hang', 'Chin over bar']),
  e('dip', 'Bench dip', ['arms', 'chest'], [], 'beginner', ['bodyweight'], ['Shoulders away from ears', 'Elbows back']),
  e('plank', 'Plank', ['core'], [], 'beginner', ['bodyweight', 'mobility'], ['Ribs down', 'Squeeze glutes'], true),
  e('side-plank', 'Side plank', ['core'], [], 'intermediate', ['bodyweight'], ['Stack your hips', 'Long line'], true),
  e('glute-bridge', 'Glute bridge', ['glutes', 'legs'], [], 'beginner', ['bodyweight', 'mobility'], ['Tuck ribs', 'Pause at the top']),
  e('burpee', 'Burpee', ['legs', 'chest', 'core'], [], 'intermediate', ['hiit', 'cardio'], ['Land softly', 'Keep a steady rhythm'], true),
  e('mtn-climber', 'Mountain climber', ['core', 'shoulders'], [], 'beginner', ['hiit', 'cardio'], ['Hands under shoulders', 'Drive knees fast'], true),
  e('jump-squat', 'Jump squat', ['legs', 'glutes'], [], 'intermediate', ['hiit'], ['Land through the whole foot'], true),
  e('high-knees', 'High knees', ['legs', 'core'], [], 'beginner', ['hiit', 'cardio'], ['Tall posture', 'Quick feet'], true),
  e('skater', 'Skater hops', ['legs', 'glutes'], [], 'intermediate', ['hiit'], ['Sweep the back leg', 'Soft landings'], true),
  e('jog', 'Easy jog', ['legs'], [], 'beginner', ['cardio'], ['Conversational pace', 'Relax shoulders'], true),
  e('row-erg', 'Rowing machine', ['back', 'legs'], ['machine'], 'beginner', ['cardio'], ['Legs, body, arms', 'Steady rhythm'], true),
  e('bike', 'Stationary bike', ['legs'], ['machine'], 'beginner', ['cardio'], ['Smooth pedal circles'], true),
  e('jump-rope', 'Jump rope', ['legs', 'shoulders'], ['rope'], 'intermediate', ['cardio', 'hiit'], ['Small hops', 'Wrists turn the rope'], true),
  e('cat-cow', 'Cat-cow', ['back', 'core'], [], 'beginner', ['mobility'], ['Move with your breath'], true),
  e('hip-flexor', 'Half-kneeling hip flexor stretch', ['legs', 'glutes'], [], 'beginner', ['mobility'], ['Tuck pelvis', 'Tall chest'], true),
  e('worlds-greatest', "World's greatest stretch", ['legs', 'back', 'shoulders'], [], 'beginner', ['mobility'], ['Rotate from the upper back'], true),
  e('child-pose', "Child's pose", ['back', 'shoulders'], [], 'beginner', ['mobility'], ['Breathe into your back'], true),
  e('thoracic', 'Thoracic rotation', ['back', 'shoulders'], [], 'beginner', ['mobility'], ['Hips stay square'], true),
  e('pigeon', 'Pigeon pose', ['glutes', 'legs'], [], 'intermediate', ['mobility'], ['Fold forward gently'], true),
]

export const EXERCISE_MAP = Object.fromEntries(EXERCISES.map((x) => [x.id, x]))

export const MUSCLES = ['chest', 'back', 'legs', 'glutes', 'shoulders', 'arms', 'core']
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'bar', 'rope']

export const SESSION_TYPES: { id: SessionType; label: string; blurb: string }[] = [
  { id: 'strength', label: 'Strength', blurb: 'Sets, reps and weight' },
  { id: 'cardio', label: 'Cardio', blurb: 'Steady duration' },
  { id: 'hiit', label: 'HIIT', blurb: 'Work and rest rounds' },
  { id: 'mobility', label: 'Mobility', blurb: 'Timed holds' },
  { id: 'bodyweight', label: 'Bodyweight', blurb: 'Home friendly' },
  { id: 'custom', label: 'Custom', blurb: 'Pick everything' },
]

export interface TemplateExercise {
  exerciseId: string
  sets: number
  reps: number
  seconds: number
  rest: number
}

export function defaultsFor(type: SessionType, ex: Exercise): TemplateExercise {
  const timed = !!ex.timed
  switch (type) {
    case 'strength':
      return { exerciseId: ex.id, sets: 3, reps: 8, seconds: 0, rest: 90 }
    case 'cardio':
      return { exerciseId: ex.id, sets: 1, reps: 0, seconds: 600, rest: 30 }
    case 'hiit':
      return { exerciseId: ex.id, sets: 4, reps: 0, seconds: 40, rest: 20 }
    case 'mobility':
      return { exerciseId: ex.id, sets: 2, reps: 0, seconds: 45, rest: 10 }
    case 'bodyweight':
      return timed
        ? { exerciseId: ex.id, sets: 3, reps: 0, seconds: 40, rest: 45 }
        : { exerciseId: ex.id, sets: 3, reps: 12, seconds: 0, rest: 45 }
    default:
      return timed
        ? { exerciseId: ex.id, sets: 3, reps: 0, seconds: 40, rest: 45 }
        : { exerciseId: ex.id, sets: 3, reps: 10, seconds: 0, rest: 60 }
  }
}

/** Estimated minutes: sets * (work + rest). Rep work assumed 40s per set. */
export function estimateMinutes(items: TemplateExercise[]) {
  const sec = items.reduce((a, t) => a + t.sets * ((t.seconds || 40) + t.rest), 0)
  return Math.max(1, Math.round(sec / 60))
}

export interface CustomEx { id: string; name: string; muscles: string[]; equipment: string[]; difficulty: Difficulty; cues: string[]; timed: boolean }
/** Registers a user-created exercise into the in-memory catalog. */
export function registerCustom(c: CustomEx) {
  if (EXERCISE_MAP[c.id]) return
  const ex: Exercise = { ...c, types: ['custom', 'strength', 'bodyweight'] }
  EXERCISES.push(ex)
  EXERCISE_MAP[ex.id] = ex
}
