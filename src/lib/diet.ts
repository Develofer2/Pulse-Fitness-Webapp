export interface Diet { id: string; label: string; protein: number; carbs: number; fat: number; foods: string; note?: string }
export const DIETS: Diet[] = [
  { id: 'keto', label: 'Keto', protein: 25, carbs: 5, fat: 70, foods: 'Eggs, fish, avocado, nuts, leafy greens, olive oil' },
  { id: 'high-protein', label: 'High protein', protein: 35, carbs: 35, fat: 30, foods: 'Chicken, Greek yogurt, lentils, tuna, cottage cheese' },
  { id: 'vegetarian', label: 'Vegetarian', protein: 20, carbs: 50, fat: 30, foods: 'Legumes, tofu, eggs, dairy, whole grains, vegetables' },
  { id: 'mediterranean', label: 'Mediterranean', protein: 18, carbs: 47, fat: 35, foods: 'Fish, olive oil, vegetables, beans, whole grains, fruit' },
  { id: 'fasting', label: 'Intermittent fasting', protein: 28, carbs: 40, fat: 32, foods: 'Two or three meals inside an 8 hour window, such as 12:00 to 20:00', note: 'Eating window 12:00 to 20:00 is a suggestion. Choose what fits your day.' },
  { id: 'custom', label: 'Custom', protein: 0, carbs: 0, fat: 0, foods: 'Set your own calorie and protein targets in Settings' },
]
export const DIET_NOTE = 'Templates are informational. Individual needs vary, so check with a registered dietitian if you are unsure.'

export const ALLERGENS: Record<string, string[]> = {
  gluten: ['gluten', 'wheat', 'barley', 'rye', 'bread', 'oat'],
  milk: ['milk', 'dairy', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'whey', 'lactose'],
  egg: ['egg'],
  peanut: ['peanut'],
  nuts: ['almond', 'walnut', 'cashew', 'hazelnut', 'pecan', 'pistachio', 'nut'],
  soy: ['soy', 'tofu'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'anchov'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'shellfish'],
  sesame: ['sesame', 'tahini'],
}
/** Keyword match, labelled informational in the UI. */
export function allergenHits(text: string, selected: string[]) {
  const t = text.toLowerCase()
  return selected.filter((a) => (ALLERGENS[a] ?? [a]).some((k) => t.includes(k)))
}
