import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const live = readFileSync(new URL('../goal-data.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/ui-polish.css', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('favorites are split into clubs and matches and persist in this browser', () => {
  assert.match(html, /readSet\('temp-rpl:favorite-clubs','temp-rpl-favorites'\)/);
  assert.match(html, /readSet\('temp-rpl:favorite-matches'\)/);
  assert.match(html, /persistSet\('temp-rpl:favorite-clubs',favorites\)/);
  assert.match(html, /persistSet\('temp-rpl:favorite-matches',favoriteMatches\)/);
  assert.match(html, /Избранное сохраняется только в этом браузере/);
  assert.match(html, /Push-уведомления пока не подключены/);
});

test('favorites screen and match scopes are wired in demo and live API views', () => {
  assert.match(html, /data-tab="favorites"/);
  assert.match(html, /favorites:window\.favoritesPage\|\|favoritesPage/);
  assert.match(html, /function favoritesPage\(\)/);
  assert.match(html, /function matchIsFollowed\(m\)/);
  assert.match(html, /data-match-scope="\$\{key\}"/);
  assert.match(html, /m\.status==='soon':matchScope==='favorites'\?matchIsFollowed\(m\)/);
});

test('match and club follow controls expose pressed state and PWA shell caches the emblem', () => {
  assert.match(html, /aria-pressed="\$\{followed\}"/);
  assert.match(html, /data-favorite-club="\$\{selectedClub\}"/);
  assert.match(css, /\.match-scope-chip\.active/);
  assert.match(css, /\.followed-club-list/);
  assert.match(manifest, /"src":"\/assets\/icon-512\.png"/);
  assert.match(serviceWorker, /\/assets\/tempo-emblem\.png/);
});


test('club comparison waits for two selections from the league table', () => {
  assert.match(html, /function comparisonCard\(\)/);
  assert.match(html, /compareLeft='', compareRight=''/);
  assert.match(html, /data-compare-slot=/);
  assert.match(html, /data-compare-club=/);
  assert.match(html, /if\(!left\|\|!right\)return start/);
  assert.match(html, /Очков за матч/);
  assert.match(html, /headToHead\(matches,compareLeft,compareRight\)/);
  assert.match(html, /teamSplits\(matches,compareLeft\)/);
  assert.match(html, /Очные встречи/);
  assert.doesNotMatch(html, /Таблица GOAL API/);
  assert.match(html, /завершённых очных встреч/);
  assert.match(live, /comparisonCard === 'function' \? comparisonCard\(\)/);
});

test('the main inline application script parses before the browser loads it', async () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]).filter((script) => script.trim());
  assert.ok(scripts.length > 0, 'main inline script should be present');
  const { Script } = await import('node:vm');
  assert.doesNotThrow(() => new Script(scripts[scripts.length - 1]));
});
