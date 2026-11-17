// Minimal service worker: precache shell, cache-first for static assets, network-only for AI.
// Replaced at build time with the hashed build files so every route works offline from the first load.
const PRECACHE = /*__PRECACHE__*/[]
const CACHE = 'pulse-' + /*__VERSION__*/'dev'
const SCOPE = self.registration.scope
const SHELL = [SCOPE, SCOPE + 'manifest.webmanifest', SCOPE + 'icon.svg', ...PRECACHE.map((f) => SCOPE + f)]
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
})
// The app asks to activate a waiting worker only when no workout is in progress.
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (/openai|anthropic|googleapis.com\/v1/.test(url.host + url.pathname)) return
  // Open Food Facts: stale-while-revalidate
  if (url.host.endsWith('openfoodfacts.org')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req, { ignoreVary: true })
        const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r }).catch(() => hit)
        return hit || net
      }),
    )
    return
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(SCOPE)))
    return
  }
  if (url.origin === location.origin || url.host.includes('gstatic') || url.host.includes('googleapis')) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return r
      })),
    )
  }
})
