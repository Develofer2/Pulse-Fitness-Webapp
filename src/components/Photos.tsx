import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { Button, Card, Empty } from './ui'
import { compressImage } from '../lib/photo'
import { dateKey } from '../lib/domain'

function useUrl(blob?: Blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}
function Img({ blob, alt }: { blob: Blob; alt: string }) {
  const u = useUrl(blob)
  return <img src={u} alt={alt} width={300} height={400} loading="lazy" className="aspect-[3/4] w-full rounded-2xl object-cover" />
}

export default function Photos({ onError }: { onError: (m: string) => void }) {
  const list = useLiveQuery(() => db.media.orderBy('date').reverse().toArray(), [])
  const [pick, setPick] = useState<number[]>([])
  const add = async (f?: File) => {
    if (!f) return
    try {
      const blob = await compressImage(f, 1280, 300 * 1024) // JPEG under 300 KB, EXIF removed by re-encoding
      await db.media.add({ date: dateKey(), blob, createdAt: Date.now() })
    } catch (e) {
      onError((e as Error).name === 'QuotaExceededError' ? 'Storage is full. Delete old photos or export your data in Settings.' : "Couldn't save that photo.")
    }
  }
  const sel = (list ?? []).filter((m) => pick.includes(m.id!)).sort((a, b) => a.date.localeCompare(b.date))
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Progress photos</h2>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-bold text-accent-fg">
          <Camera size={16} /> Add photo
          <input type="file" accept="image/*" hidden onChange={(e) => { void add(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {list && list.length === 0 && <Empty text="No photos yet. Add one to compare how you change over time." />}
      {sel.length === 2 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {sel.map((m) => <figure key={m.id}><Img blob={m.blob} alt={`Progress photo from ${m.date}`} /><figcaption className="mt-1 text-center text-xs font-semibold text-muted">{m.date}</figcaption></figure>)}
        </div>
      )}
      {list && list.length > 1 && <p className="mb-2 text-xs text-muted">Select any two photos to compare them side by side ({pick.length}/2).</p>}
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {list?.map((m) => (
          <li key={m.id} className="relative">
            <button aria-pressed={pick.includes(m.id!)} aria-label={`Select photo from ${m.date}`} onClick={() => setPick((p) => (p.includes(m.id!) ? p.filter((x) => x !== m.id) : [...p.slice(-1), m.id!]))} className={`block w-full overflow-hidden rounded-2xl border-2 ${pick.includes(m.id!) ? 'border-accent' : 'border-transparent'}`}>
              <Img blob={m.blob} alt={`Progress photo from ${m.date}`} />
              <span className="absolute inset-x-1 bottom-1 rounded-lg bg-black/60 px-1 text-center text-[10px] font-bold text-white">{m.date}</span>
            </button>
            <Button variant="ghost" aria-label={`Delete photo from ${m.date}`} className="absolute right-0 top-0 !min-h-9 !px-2 text-white" onClick={() => db.media.delete(m.id!)}><Trash2 size={14} /></Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
