import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldAlert } from 'lucide-react'
import { db } from '../lib/db'
import { MODEL_SUGGESTIONS, PROVIDERS } from '../lib/providers'
import { removeKey, saveKey, validFormat, type Provider } from '../lib/vault'
import { aiMessage, testKey } from '../lib/ai'
import { Button, Card, Chips, Field } from './ui'

export default function AiConnection({ toast }: { toast: (m: string) => void }) {
  const rec = useLiveQuery(() => db.aiKey.get('key'), [])
  const [provider, setProvider] = useState<Provider>('openai')
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [cap, setCap] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(localStorage.getItem('pulse-ai-history') !== 'off')
  const def = PROVIDERS.find((p) => p.id === provider)!

  const connect = async (skipTest = false) => {
    setErr('')
    const k = key.trim()
    if (!validFormat(provider, k)) return setErr('Paste your full API key (no spaces).')
    setBusy(true)
    const m = model.trim() || def.defaultModel
    try {
      if (!skipTest) await testKey(provider, k, m)
    } catch (e) {
      setErr(aiMessage(e))
      setBusy(false)
      return
    }
    try {
      await saveKey(provider, k, m, cap && Number.isFinite(parseFloat(cap)) ? Math.max(0, parseFloat(cap)) : null)
      setKey('')
      toast(skipTest ? 'Key saved without testing' : 'AI connected')
    } catch (e) {
      setErr(`Couldn't store the key on this device: ${(e as Error).message}. Secure storage needs https and a browser that allows IndexedDB.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card id="ai-connection">
      <p className="mb-4 flex gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <span>Your key is encrypted on this device and sent only to your chosen provider. Anyone with access to your unlocked device, or any script on the page, could still reach it. Remove it on shared devices.</span>
      </p>
      {rec ? (
        <div key="connected" className="space-y-3">
          <p className="font-semibold">Connected to {PROVIDERS.find((p) => p.id === rec.provider)?.label} · key ending {rec.last4}</p>
          <p className="text-sm text-muted">Model {rec.model}. Estimated usage this month: ${rec.usageEstimateUsd.toFixed(3)}{rec.monthlyCapUsd != null && ` of $${rec.monthlyCapUsd.toFixed(2)} cap`}. Estimates are approximate; your provider bills actual usage.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field id="m2" label="Model" defaultValue={rec.model} onBlur={(e) => e.target.value.trim() && db.aiKey.update('key', { model: e.target.value.trim() })} />
            <Field id="cap2" label="Monthly cap (USD)" inputMode="decimal" defaultValue={rec.monthlyCapUsd ?? ''} onBlur={(e) => db.aiKey.update('key', { monthlyCapUsd: e.target.value ? Math.max(0, parseFloat(e.target.value)) : null })} />
          </div>
          <Button onClick={async () => { await removeKey(); toast('Key removed') }}>Remove key</Button>
        </div>
      ) : (
        <div key="form" className="space-y-3">
          <Chips<Provider> label="Provider" options={PROVIDERS.map((p) => ({ id: p.id, label: p.label }))} value={provider} onChange={(p) => { setProvider(p); setModel(''); setErr('') }} />
          <Field id="aik" label="API key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} aria-describedby={err ? 'aik-err' : undefined} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="aim" label="Model" list="ai-models" placeholder={def.defaultModel} value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="ai-models">{MODEL_SUGGESTIONS[provider].map((x) => <option key={x} value={x} />)}</datalist>
            <Field id="aic" label="Monthly cap (USD)" inputMode="decimal" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
          {err && <p id="aik-err" role="alert" className="text-sm font-semibold text-warn">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => connect()} disabled={busy || !key.trim()}>{busy ? 'Working…' : 'Test and save'}</Button>
            <Button onClick={() => connect(true)} disabled={busy || !key.trim()}>Save without testing</Button>
          </div>
          <p className="text-xs text-muted">Default model for {def.label}: {def.defaultModel}. If the test says the model isn't accepted, type another one from the list.</p>
        </div>
      )}
      <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="!min-h-0 size-5" checked={history} onChange={(e) => { setHistory(e.target.checked); localStorage.setItem('pulse-ai-history', e.target.checked ? 'on' : 'off') }} />
        Save AI conversation history on this device
      </label>
    </Card>
  )
}
