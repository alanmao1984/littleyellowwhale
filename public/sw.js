const CACHE_NAME = 'venus-public-shell-v1'
const OFFLINE_URL = '/offline'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('venus-public-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(OFFLINE_URL)
    return cached || new Response('当前离线 / You are offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }))
})
