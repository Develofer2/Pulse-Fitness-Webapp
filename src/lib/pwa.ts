import { create } from 'zustand'

interface PwaState {
  updateReady: boolean
  installEvent: Event | null
  installed: boolean
  apply: () => void
}
let waiting: ServiceWorker | null = null

export const usePwa = create<PwaState>(() => ({
  updateReady: false,
  installEvent: null,
  installed: matchMedia('(display-mode: standalone)').matches,
  apply: () => waiting?.postMessage('SKIP_WAITING'),
}))

export function initPwa() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); usePwa.setState({ installEvent: e }) })
  addEventListener('appinstalled', () => usePwa.setState({ installed: true, installEvent: null }))
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      const track = (w: ServiceWorker | null) => {
        if (!w) return
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; usePwa.setState({ updateReady: true }) }
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; usePwa.setState({ updateReady: true }) }
      reg.addEventListener('updatefound', () => track(reg.installing))
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload())
    } catch { /* unsupported */ }
  })
}

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
