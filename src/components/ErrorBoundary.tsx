import { Component, type ReactNode } from 'react'
import { db } from '../lib/db'

/** Last-resort screen: never wipes data, always offers an export. */
export default class ErrorBoundary extends Component<{ children: ReactNode; message?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  exportRaw = async () => {
    try {
      const out: Record<string, unknown> = {}
      for (const t of db.tables) if (t.name !== 'aiKey' && t.name !== 'media') out[t.name] = await t.toArray()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'pulse-fitness', version: 1, ...out })], { type: 'application/json' }))
      a.download = 'pulse-rescue-backup.json'
      a.click()
    } catch { alert("Couldn't read the local database.") }
  }
  render() {
    if (!this.state.error && !this.props.message) return this.props.children
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-content-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
        <p className="text-muted">{this.props.message ?? "Pulse hit an unexpected error. Your data has not been deleted."}</p>
        <div className="flex justify-center gap-3">
          <button onClick={this.exportRaw} className="min-h-12 rounded-2xl bg-accent px-5 font-bold text-accent-fg">Export my data</button>
          <button onClick={() => location.reload()} className="min-h-12 rounded-2xl bg-surface-2 px-5 font-semibold">Reload</button>
        </div>
      </div>
    )
  }
}
