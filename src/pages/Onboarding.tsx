import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { Activity } from 'lucide-react'
import { Button, Chips } from '../components/ui'
import { useSettings } from '../lib/store'

export default function Onboarding() {
  const s = useSettings()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const finish = () => { s.set({ onboarded: true }); nav('/', { replace: true }) }
  const next = () => (step === 2 ? finish() : setStep(step + 1))
  const steps = [
    { q: 'What is your main goal?', body: <Chips label="Goal" options={[{ id: 'strength', label: 'Get stronger' }, { id: 'fat-loss', label: 'Lose fat' }, { id: 'endurance', label: 'More endurance' }, { id: 'health', label: 'Stay healthy' }]} value={s.goalFocus} onChange={(v) => s.set({ goalFocus: v })} /> },
    { q: 'How many sessions per week?', body: <Chips label="Sessions per week" options={[2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: String(n) }))} value={String(s.weeklyTarget)} onChange={(v) => s.set({ weeklyTarget: +v })} /> },
    { q: 'What equipment do you have?', body: <Chips label="Equipment" options={[{ id: 'dumbbell', label: 'Dumbbells' }, { id: 'barbell', label: 'Barbell' }, { id: 'machine', label: 'Machines' }, { id: 'bar', label: 'Pull-up bar' }, { id: 'rope', label: 'Jump rope' }]} value={s.equipment} onChange={(v) => s.set({ equipment: s.equipment.includes(v) ? s.equipment.filter((x) => x !== v) : [...s.equipment, v] })} /> },
  ]
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-10">
      <div className="flex items-center gap-3 font-display text-xl font-bold"><span className="grid size-10 place-items-center rounded-2xl bg-accent text-accent-fg"><Activity size={22} /></span> Pulse</div>
      <AnimatePresence mode="wait">
        <m.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <p className="mb-2 text-sm font-semibold text-muted">Step {step + 1} of 3</p>
          <h1 className="font-display mb-6 text-4xl font-bold leading-tight">{steps[step].q}</h1>
          {steps[step].body}
          <p className="mt-8 text-xs text-muted">Pulse gives general fitness information, not medical advice. Everything is stored on this device.</p>
        </m.div>
      </AnimatePresence>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={next}>Skip</Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={next}>{step === 2 ? 'Get started' : 'Continue'}</Button>
      </div>
    </div>
  )
}
