import { db, type AiKeyRecord } from './db'

export type Provider = AiKeyRecord['provider']

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Encrypts the API key with a non-extractable AES-GCM key. Only ciphertext, IV and last 4 characters persist. */
export async function saveKey(provider: Provider, apiKey: string, model: string, monthlyCapUsd: number | null) {
  const cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(apiKey))
  const prev = await db.aiKey.get('key')
  await db.aiKey.put({
    id: 'key', provider, cryptoKey, encrypted, iv, last4: apiKey.slice(-4), model, monthlyCapUsd,
    usageMonth: prev?.usageMonth ?? monthKey(), usageEstimateUsd: prev?.usageEstimateUsd ?? 0,
  })
}

export async function readKey(): Promise<{ rec: AiKeyRecord; apiKey: string } | null> {
  const rec = await db.aiKey.get('key')
  if (!rec) return null
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv as BufferSource }, rec.cryptoKey, rec.encrypted)
  return { rec, apiKey: dec.decode(buf) }
}

export const removeKey = () => db.aiKey.delete('key')
export const monthKey = () => new Date().toISOString().slice(0, 7)

/** Light sanity check only: provider key formats change often, so the test request is the real validation. */
export function validFormat(_provider: Provider, key: string) {
  const k = key.trim()
  return k.length >= 16 && !/\s/.test(k)
}
