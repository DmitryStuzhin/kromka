import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const goal = readFileSync(new URL('../goal-data.js', import.meta.url), 'utf8');
const crest = '/assets/club-crests/dynamo-moscow.svg';
const moscow = {
  id: 'cmr7uolsy8mghrx06jog9s5dt', name: 'Dinamo Moskva',
  badge: 'https://media.goal-api.com/badges/221_dinamo-moskva.jpg'
};
const makhachkala = {
  id: 'cmr7uolt08mgjrx06xj1x745j', name: 'Dinamo Makhachkala',
  badge: 'https://media.goal-api.com/badges/6210_dinamo-makhachkala.jpg'
};

function appRegistry() {
  const context = vm.createContext({ URL });
  const initialClubs = html.slice(html.indexOf('const clubs={'), html.indexOf('const standings=['));
  const renderer = html.slice(html.indexOf('const mediaAsset='), html.indexOf('const statusText='));
  vm.runInContext(`${initialClubs}\n${renderer}\nglobalThis.clubData = clubs; globalThis.renderCrest = clubBadge; globalThis.validateMedia = mediaAsset;`, context);
  const teamPrelude = goal.slice(0, goal.indexOf('  function scalar(v)'));
  vm.runInContext(`${teamPrelude}\nglobalThis.registry = { teamKey, keyFor };\n})();`, context);
  return context;
}

test('GOAL IDs resolve Moscow and Makhachkala separately even with shortened names', () => {
  const app = appRegistry();
  assert.equal(app.registry.teamKey({ ...moscow, name: 'Dinamo' }), 'dynamo');
  assert.equal(app.registry.teamKey({ ...makhachkala, name: 'Dinamo' }), 'makhachkala');
  assert.equal(app.clubData.dynamo.apiId, moscow.id);
  assert.equal(app.clubData.makhachkala.apiId, makhachkala.id);
});

test('API refresh order and old/incorrect remote badges cannot replace the local Moscow crest', () => {
  const app = appRegistry();
  for (let i = 0; i < 3; i++) {
    app.registry.teamKey(makhachkala);
    app.registry.teamKey({ ...moscow, badge: i === 1 ? makhachkala.badge : moscow.badge });
  }
  assert.equal(app.clubData.dynamo.badge, crest);
  assert.equal(app.clubData.dynamo.logo, crest);
  assert.equal(app.clubData.makhachkala.logo, makhachkala.badge);
  assert.notEqual(app.clubData.dynamo.logo, app.clubData.makhachkala.logo);
  assert.match(app.renderCrest('dynamo'), /src="\/assets\/club-crests\/dynamo-moscow\.svg"/);
  assert.match(app.renderCrest('dynamo'), /team-mark has-logo crest/);
  assert.doesNotMatch(app.renderCrest('dynamo'), /shield|6210_dinamo-makhachkala/);
  assert.match(app.renderCrest('makhachkala'), /6210_dinamo-makhachkala\.jpg/);
});

test('the shared renderer uses the same Moscow crest in compact and lineup contexts', () => {
  const app = appRegistry();
  for (const extra of ['', 'lineup-crest', 'club-picker-crest']) {
    assert.ok(app.renderCrest('dynamo', extra).includes(crest));
  }
  assert.ok(existsSync(new URL('../assets/club-crests/dynamo-moscow.svg', import.meta.url)));
});

test('local image allowance is exact and does not permit arbitrary paths or third-party hosts', () => {
  const app = appRegistry();
  assert.equal(app.validateMedia(crest), crest);
  for (const value of ['/assets/club-crests/other.svg', `${crest}?override=1`, '//evil.example/logo.svg', 'https://evil.example/logo.svg', 'javascript:alert(1)']) {
    assert.equal(app.validateMedia(value), '');
  }
  assert.equal(app.validateMedia(makhachkala.badge), makhachkala.badge);
});
