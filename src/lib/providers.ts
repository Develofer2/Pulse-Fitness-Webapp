import type { Provider } from './vault'

export class HttpError extends Error {
  constructor(public status: number, public retryAfter = 0, public detail = '') {
    super(`HTTP ${status}`)
  }
}

export interface TextRequest { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; json?: boolean; maxTokens?: number }
export interface ImageRequest { system: string; text: string; imageDataUrl: string; json?: boolean }
export interface Adapter {
  sendText(key: string, model: string, r: TextRequest): Promise<string>
  sendImageWithText(key: string, model: string, r: ImageRequest): Promise<string>
  estimateTokens(chars: number): number
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), cache: 'no-store' })
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = String(j?.error?.message ?? j?.error ?? j?.message ?? '').slice(0, 200)
    } catch { /* no body */ }
    throw new HttpError(res.status, Number(res.headers.get('retry-after')) || 0, detail)
  }
  return res.json()
}
const estimateTokens = (chars: number) => Math.ceil(chars / 4)

const openai: Adapter = {
  estimateTokens,
  async sendText(key, model, r) {
    const j = await post('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model, max_completion_tokens: r.maxTokens ?? 900,
      messages: [{ role: 'system', content: r.system }, ...r.messages],
      ...(r.json ? { response_format: { type: 'json_object' } } : {}),
    })
    return j.choices?.[0]?.message?.content ?? ''
  },
  async sendImageWithText(key, model, r) {
    const j = await post('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model, max_completion_tokens: 500,
      messages: [{ role: 'system', content: r.system }, { role: 'user', content: [{ type: 'text', text: r.text }, { type: 'image_url', image_url: { url: r.imageDataUrl } }] }],
      ...(r.json ? { response_format: { type: 'json_object' } } : {}),
    })
    return j.choices?.[0]?.message?.content ?? ''
  },
}

const anthropicHeaders = (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
const anthropic: Adapter = {
  estimateTokens,
  async sendText(key, model, r) {
    const j = await post('https://api.anthropic.com/v1/messages', anthropicHeaders(key), { model, max_tokens: r.maxTokens ?? 900, system: r.system, messages: r.messages })
    return j.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? ''
  },
  async sendImageWithText(key, model, r) {
    const [meta, data] = r.imageDataUrl.split(',')
    const media = /data:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg'
    const j = await post('https://api.anthropic.com/v1/messages', anthropicHeaders(key), {
      model, max_tokens: 500, system: r.system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data } }, { type: 'text', text: r.text }] }],
    })
    return j.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? ''
  },
}

const gem = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
const gemini: Adapter = {
  estimateTokens,
  async sendText(key, model, r) {
    const j = await post(gem(model), { 'x-goog-api-key': key }, {
      systemInstruction: { parts: [{ text: r.system }] },
      contents: r.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: r.maxTokens ?? 900, ...(r.json ? { responseMimeType: 'application/json' } : {}) },
    })
    return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  },
  async sendImageWithText(key, model, r) {
    const [meta, data] = r.imageDataUrl.split(',')
    const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg'
    const j = await post(gem(model), { 'x-goog-api-key': key }, {
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: 'user', parts: [{ text: r.text }, { inline_data: { mime_type: mime, data } }] }],
      generationConfig: { maxOutputTokens: 500, ...(r.json ? { responseMimeType: 'application/json' } : {}) },
    })
    return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  },
}

export const ADAPTERS: Record<Provider, Adapter> = { openai, anthropic, gemini }
export const MODEL_SUGGESTIONS: Record<Provider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-latest'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
}
export const PROVIDERS: { id: Provider; label: string; defaultModel: string }[] = [
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-haiku-4-5' },
  { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
]
/** Approximate USD per 1M tokens (input, output). Estimates only; providers bill actual usage. */
export const PRICES: Record<Provider, { in: number; out: number }> = {
  openai: { in: 0.15, out: 0.6 },
  anthropic: { in: 0.8, out: 4 },
  gemini: { in: 0.1, out: 0.4 },
}
