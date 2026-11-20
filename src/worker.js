const prefix = 'dashboard-house-shell-'
const cacheName = prefix + '__CACHE_VERSION__'
const files = /*PRECACHE*/ []

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    // The cached HTML and its hashed assets always belong to the same build.
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match('/')) ?? fetch(request)))
  } else if (files.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(url.pathname)) ?? fetch(request)))
  }
})
