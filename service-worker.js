const CACHE = 'temp-rpl-shell-v12-live-websocket';
const SHELL = [
  '/', '/manifest.json', '/assets/goal-insights.js?v=goal-insights-20261111', '/goal-data.js?v=match-insights-20261111-live-ws', '/assets/live-data.css?v=dynamo-crest-20261102b', '/assets/ui-polish.css', '/assets/ui-polish.js', '/assets/season-analytics.js?v=season-h2h-splits-20261111', '/assets/unslop.css', '/assets/detail-screens.css', '/assets/detail-screens.js', '/assets/tempo-emblem.png',
  '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png',
  '/assets/krestovsky-night.jpg', '/assets/club-crests/dynamo-moscow.svg'
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('temp-rpl-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))));
});
