import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Bell, Download, Lock, Trash2, Upload } from 'lucide-react'
import { db } from '../lib/db'
import { Button, Card, Chips, Field, PageHeader, useToast } from '../components/ui'
import { applyTheme, useSettings, type Theme } from '../lib/store'
import AiConnection from '../components/AiConnection'
import { hashPin, newSalt } from '../lib/lock'
import { ALLERGENS } from '../lib/diet'
import { blobToDataUrl } from '../lib/photo'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-semibold">{label}</p>{hint && <p className="text-sm text-muted">{hint}</p>}</div>
      {children}
    </div>
  )
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-surface-2'}`}>
      <span className={`absolute left-1 top-1 size-6 rounded-full transition-transform ${on ? 'translate-x-6 bg-accent-fg' : 'bg-muted'}`} />
    </button>
  )
}
const H = ({ children }: { children: ReactNode }) => <h2 className="font-display mb-3 mt-8 text-lg font-bold">{children}</h2>

const TABLES = ['templates', 'workouts', 'sets', 'entries', 'foods', 'metrics', 'water', 'recipes', 'conversations', 'achievements', 'customExercises'] as const
const VERSION = '1.0.0'
const CHANGELOG = [
  { v: '1.0.0', d: 'First release: training, nutrition, progress, goals, offline PWA, backups and optional bring-your-own-key AI.' },
]

export default function SettingsPage() {
  const s = useSettings()
  const { hash } = useLocation()
  const { toast, node } = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [usage, setUsage] = useState('')
  const [withPhotos, setWithPhotos] = useState(false)
  const [mode, setMode] = useState<'replace' | 'merge'>('merge')
  const [pin, setPin] = useState('')
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1048576).toFixed(1)} MB of ${((e.quota ?? 0) / 1048576 / 1024).toFixed(1)} GB used`))
  }, [])
  useEffect(() => { if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }) }, [hash])

  const exportData = async () => {
    const out: Record<string, unknown> = { app: 'pulse-fitness', version: 1, exportedAt: new Date().toISOString(), settings: { ...s, set: undefined, lockHash: '', lockSalt: '' } }
    for (const t of TABLES) out[t] = await db.table(t).toArray()
    if (withPhotos) out.media = await Promise.all((await db.media.toArray()).map(async (m) => ({ date: m.date, createdAt: m.createdAt, data: await blobToDataUrl(m.blob) })))
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' })
    const name = `pulse-backup-${new Date().toISOString().slice(0, 10)}.json`
    const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }
    try {
      if (w.showSaveFilePicker) {
        const h = await w.showSaveFilePicker({ suggestedName: name, types: [{ accept: { 'application/json': ['.json'] } }] })
        const ws = await h.createWritable(); await ws.write(blob); await ws.close()
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
      }
      localStorage.setItem('pulse-last-backup', String(Date.now()))
      toast('Backup saved. AI keys are never included.')
    } catch { /* user cancelled */ }
  }

  const importData = async (f: File) => {
    let j: Record<string, unknown>
    try {
      j = JSON.parse(await f.text())
      if (j.app !== 'pulse-fitness' || typeof j.version !== 'number' || j.version > 1) throw new Error('bad')
      for (const t of TABLES) if (j[t] !== undefined && (!Array.isArray(j[t]) || (j[t] as unknown[]).some((r) => typeof r !== 'object' || r === null))) throw new Error('bad')
    } catch {
      return toast("That file isn't a valid Pulse backup.")
    }
    if (mode === 'replace' && !confirm('Replace all data on this device with this backup?')) return
    const media = Array.isArray(j.media) ? await Promise.all((j.media as { date: string; createdAt: number; data: string }[]).map(async (m) => ({ date: m.date, createdAt: m.createdAt, blob: await (await fetch(m.data)).blob() }))) : []
    await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.media], async () => {
      for (const t of TABLES) {
        const rows = (j[t] as { id?: unknown; createdAt?: number }[] | undefined) ?? []
        const tbl = db.table(t)
        if (mode === 'replace') { await tbl.clear(); await tbl.bulkPut(rows); continue }
        // Merge: keep the newer record per id; completed workout logs and sets are never overwritten.
        for (const r of rows) {
          const key = t === 'water' ? (r as unknown as { date: string }).date : r.id
          const cur = key != null ? await tbl.get(key as never) : undefined
          const keep = t === 'workouts' || t === 'sets' || t === 'achievements'
          if (!cur) await tbl.put(r)
          else if (!keep && (r.createdAt ?? 0) > ((cur as { createdAt?: number }).createdAt ?? 0)) await tbl.put(r)
        }
      }
      if (media.length) { if (mode === 'replace') await db.media.clear(); await db.media.bulkAdd(media) }
    })
    const { lockHash: _h, lockSalt: _s, ...rest } = (j.settings ?? {}) as Record<string, unknown>
    void _h; void _s
    if (mode === 'replace') s.set(rest as never)
    toast(mode === 'replace' ? 'Backup restored' : 'Backup merged')
  }

  const clearAll = async () => {
    if (!confirm('Erase everything on this device, including your AI key? This cannot be undone. Export a backup first.')) return
    await db.delete()
    localStorage.clear(); sessionStorage.clear()
    caches?.keys().then((k) => k.forEach((x) => caches.delete(x)))
    location.href = '/'
  }
  const daysSince = Math.floor((Date.now() - Number(localStorage.getItem('pulse-last-backup') ?? 0)) / 86400000)

  const enableReminders = async () => {
    if (typeof Notification === 'undefined') return toast("This browser doesn't support notifications.")
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p !== 'granted') toast('Notifications are blocked. Enable them in your browser settings.')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" sub="Your data stays on this device." />
      <Card className="divide-y divide-line !py-1">
        <Row label="Theme">
          <Chips<Theme> label="Theme" options={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} value={s.theme} onChange={(v) => { s.set({ theme: v }); applyTheme(v) }} />
        </Row>
        <Row label="Units"><Chips<'kg' | 'lb'> label="Units" options={[{ id: 'kg', label: 'kg' }, { id: 'lb', label: 'lb' }]} value={s.units} onChange={(v) => s.set({ units: v })} /></Row>
        <Row label="Weekly sessions goal" hint="The home ring fills as you train."><Chips label="Weekly goal" options={[1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: String(n) }))} value={String(s.weeklyTarget)} onChange={(v) => s.set({ weeklyTarget: +v })} /></Row>
        <Row label="Automatic workouts" hint="Sets start, count and finish on their own, then rest begins."><Toggle label="Automatic workouts" on={s.autoFlow} onChange={(v) => s.set({ autoFlow: v })} /></Row>
        {s.autoFlow && <Row label="Rep pace" hint="Seconds per rep for the automatic rep counter."><Chips label="Rep pace" options={[2, 3, 4, 5].map((n) => ({ id: String(n), label: `${n}s` }))} value={String(s.tempo)} onChange={(v) => s.set({ tempo: +v })} /></Row>}
        <Row label="Haptics"><Toggle label="Haptics" on={s.haptics} onChange={(v) => s.set({ haptics: v })} /></Row>
        <Row label="Sounds"><Toggle label="Sounds" on={s.sound} onChange={(v) => s.set({ sound: v })} /></Row>
      </Card>

      <H>Daily targets</H>
      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="kcal" label="Calories" inputMode="numeric" value={s.kcalTarget} onChange={(e) => s.set({ kcalTarget: Math.min(10000, +e.target.value || 0) })} />
        <Field id="prot" label="Protein (g)" inputMode="numeric" value={s.proteinTarget} onChange={(e) => s.set({ proteinTarget: Math.min(1000, +e.target.value || 0) })} />
        <Field id="water" label="Water (ml)" inputMode="numeric" value={s.waterGoal} onChange={(e) => s.set({ waterGoal: Math.min(20000, +e.target.value || 0) })} />
      </Card>

      <H>Allergens</H>
      <Card>
        <p className="mb-3 text-sm text-muted">Foods that match get a warning badge. Matching is keyword based and informational only. Always check the label.</p>
        <Chips label="Allergens" options={Object.keys(ALLERGENS).map((a) => ({ id: a, label: a[0].toUpperCase() + a.slice(1) }))} value={s.allergens} onChange={(a) => s.set({ allergens: s.allergens.includes(a) ? s.allergens.filter((x) => x !== a) : [...s.allergens, a] })} />
      </Card>

      <H>Reminders</H>
      <Card className="space-y-4">
        <p className="text-sm text-muted">Reminders are scheduled on this device and depend on your browser and operating system. They may not fire if the app is fully closed, and there is no server push.</p>
        {perm !== 'granted' && <Button onClick={enableReminders}><Bell size={16} /> Allow notifications</Button>}
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Workout reminder time
            <input type="time" value={s.reminderWorkout} onChange={(e) => s.set({ reminderWorkout: e.target.value })} className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4" />
          </label>
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-2"><span className="text-sm font-semibold">Water reminders</span><Toggle label="Water reminders" on={s.reminderWater} onChange={(v) => s.set({ reminderWater: v })} /></div>
        </div>
      </Card>

      <H>App lock</H>
      <Card className="space-y-3">
        <p className="text-sm text-muted">Optional PIN for shared devices. The PIN is stored only as a salted hash. Your data is not encrypted at rest by the browser, so this protects the app screen, not the device storage.</p>
        {s.lockHash ? (
          <div className="flex flex-wrap items-center gap-3">
            <Chips label="Auto-lock" options={[1, 5, 15].map((n) => ({ id: String(n), label: `${n} min` }))} value={String(s.lockMinutes)} onChange={(v) => s.set({ lockMinutes: +v })} />
            <Button onClick={() => s.set({ lockHash: '', lockSalt: '' })}><Lock size={16} /> Turn off lock</Button>
          </div>
        ) : (
          <form className="flex items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const salt = newSalt(); s.set({ lockSalt: salt, lockHash: await hashPin(pin, salt) }); setPin(''); toast('App lock on') }}>
            <Field id="newpin" label="New PIN (4 to 8 digits)" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            <Button type="submit" variant="primary" disabled={pin.length < 4}>Turn on</Button>
          </form>
        )}
      </Card>

      <H>Data</H>
      <Card className="space-y-4">
        <p className="text-sm text-muted">Nothing is sent to a server. {usage && `${usage}. `}{daysSince >= 30 && <strong className="text-warn">It's been a while since your last backup.</strong>}</p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="!min-h-0 size-5" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} /> Include progress photos (larger file)</label>
        <p className="text-xs text-muted">AI keys are never exported. Reconnect your key after restoring on another device.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Chips<'merge' | 'replace'> label="Restore mode" options={[{ id: 'merge', label: 'Merge on restore' }, { id: 'replace', label: 'Replace on restore' }]} value={mode} onChange={setMode} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}><Download size={16} /> Export backup</Button>
          <Button onClick={() => file.current?.click()}><Upload size={16} /> Restore backup</Button>
          <Button onClick={clearAll} className="!text-warn"><Trash2 size={16} /> Clear all data</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = '' }} />
        </div>
      </Card>

      <H>AI connection</H>
      <AiConnection toast={toast} />

      <H>Privacy</H>
      <Card className="space-y-2 text-sm text-muted">
        <p>Everything is stored on this device. There are no accounts and no analytics on health values.</p>
        <p>What can leave the device: AI requests to the provider you choose, and barcode or search lookups to Open Food Facts, which send only the barcode or search text.</p>
        <p>You can export or erase your data at any time.</p>
      </Card>

      <H>About</H>
      <Card className="space-y-2 text-sm">
        <p className="font-semibold">Pulse v{VERSION}</p>
        {CHANGELOG.map((c) => <p key={c.v} className="text-muted"><strong className="text-ink">{c.v}</strong> {c.d}</p>)}
        <p className="text-xs text-muted">General fitness and nutrition information and estimates. Not medical advice, and not a substitute for a doctor, registered dietitian or qualified trainer. If you have an injury, a medical condition or are pregnant, consult a professional before starting a new program.</p>
      </Card>
      {node}
    </div>
  )
}
