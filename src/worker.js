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

self.addEventListener('push', event => {
  let data = { title: 'Maison', body: 'Nouvelle notification', url: '/' }
  try { data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/assets/icon-192.png?i=2',
    badge: '/assets/favicon-round.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(item => item.url === target)
    return client ? client.focus() : self.clients.openWindow(target)
  }))
})
