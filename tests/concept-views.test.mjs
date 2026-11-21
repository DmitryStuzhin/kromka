import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const views = readFileSync(new URL('../assets/concept-views.js', import.meta.url), 'utf8');
const details = readFileSync(new URL('../assets/detail-screens.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/concept-views.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('league form uses only scored, finished provider fixtures in newest-first order', () => {
  assert.match(views, /match\.status === 'finished'[\s\S]*scoreOf\(match\)/);
  assert.match(views, /right\.dateKey\)\.localeCompare\(String\(left\.dateKey\)\)/);
  assert.match(views, /\.slice\(0, limit\)/);
  assert.match(views, /textContent = '—'/);
  assert.match(views, /неполную историю не дополняем/);
  assert.match(css, /\.last-five-mark\.win/);
  assert.match(css, /\.last-five-mark\.draw/);
  assert.match(css, /\.last-five-mark\.loss/);
});

test('the detail concepts keep events intact and retain all existing match-section anchors', () => {
  assert.match(details, /data-detail-anchor="match-events"/);
  assert.match(details, /data-detail-anchor="match-statistics"/);
  assert.match(details, /data-detail-anchor="matchLineupsSection"/);
  assert.match(details, /<header class="match-detail-hero"[\s\S]*<nav class="detail-anchor-nav"[\s\S]*<div id="match-statistics">/);
  assert.doesNotMatch(css, /\.match-timeline|\.timeline-event/);
  assert.match(html, /assets\/concept-views\.css\?v=standings-columns-20261121/);
  assert.match(html, /assets\/concept-views\.js\?v=concept-views-20261116/);
  assert.match(worker, /assets\/concept-views\.css\?v=standings-columns-20261121/);
  assert.match(worker, /assets\/concept-views\.js\?v=concept-views-20261116/);
});
