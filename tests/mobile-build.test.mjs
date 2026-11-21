import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

test('packaged Android assets include local documents and runtime, but no server files or credentials', () => {
  execFileSync(process.execPath,['scripts/build-mobile.mjs'],{cwd:new URL('..',import.meta.url)});
  const root=new URL('../dist-mobile/',import.meta.url);
  const html=readFileSync(new URL('index.html',root),'utf8');
  assert.match(html,/native-runtime\.js/);
  assert.match(html,/href="\/privacy\.html"/);
  for(const route of ['about','privacy','terms','support','licenses','storage']) {
    assert.match(readFileSync(new URL(route+'.html',root),'utf8'),/<html lang="ru">/);
  }
  for(const path of ['.env','server.mjs','package.json','flashscore_proxy.py']) assert.equal(existsSync(new URL(path,root)),false);
  const runtime=readFileSync(new URL('native-runtime.js',root),'utf8');
  assert.match(runtime,/https:\/\/tokenapp\.ru/);
  const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
  assert.equal(config.server.url,undefined,'interface must be bundled, not a remote website');
  assert.equal(config.server.cleartext,false);
});
