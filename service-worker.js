const CACHE = 'temp-rpl-shell-v36-standings-columns';
const SHELL = [
  '/', '/manifest.json', '/assets/fonts/fonts.css?v=release-20261121', '/assets/legal.css?v=release-20261121b',
  '/assets/fonts/font-1.ttf', '/assets/fonts/font-10.ttf', '/assets/fonts/font-11.ttf', '/assets/fonts/font-2.ttf', '/assets/fonts/font-3.ttf', '/assets/fonts/font-4.ttf', '/assets/fonts/font-5.ttf', '/assets/fonts/font-6.ttf', '/assets/fonts/font-7.ttf', '/assets/fonts/font-8.ttf', '/assets/fonts/font-9.ttf',
  '/assets/football-goal.jpg', '/assets/match-chronology.js?v=football-goal-20261120', '/assets/match-presentation.js?v=match-insights-ru-20261120b', '/assets/goal-insights.js?v=match-insights-ru-20261120b', '/goal-data.js?v=chronology-ledger-20261120b', '/assets/live-data.css?v=dynamo-crest-20261102b', '/assets/ui-polish.css', '/assets/ui-polish.js', '/assets/season-analytics.js?v=season-h2h-splits-20261111', '/assets/unslop.css', '/assets/detail-screens.css', '/assets/detail-data.css?v=football-goal-20261120', '/assets/detail-screens.js?v=chronology-ledger-20261120b', '/assets/stat-charts.js', '/assets/lineup-layout.js', '/assets/stat-charts.css', '/assets/concept-views.css?v=standings-columns-20261121', '/assets/concept-views.js?v=concept-views-20261116', '/assets/tempo-emblem.png',
  '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png',
  '/assets/krestovsky-night.jpg', '/assets/club-crests/dynamo-moscow.svg', '/assets/matchday.css?v=club-match-design-20261120c'
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('temp-rpl-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  if (['/about', '/privacy', '/terms', '/storage', '/support', '/licenses'].includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нужен интернет — КРОМКА</title><h1>Документ недоступен без интернета</h1><p>Подключитесь к сети и обновите страницу, чтобы прочитать актуальную редакцию.</p><p><a href="/">Вернуться к матчам</a></p></html>', {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
    return;
  }
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname) ? await caches.match('/') : Response.error())));
});
