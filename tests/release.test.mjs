import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { releaseConfig, releaseIssues } from '../release-config.mjs';
import { renderLegalPage, legalRoutes } from '../legal-pages.mjs';

const configured = {APP_PUBLIC_URL:'https://kromka.example',LEGAL_HOSTING_PROVIDER:'Тестовый хостинг',LEGAL_HOSTING_COUNTRY:'RU',LEGAL_HOSTING_LOCATION:'Москва',LEGAL_LOG_RETENTION_DAYS:'7'};
test('unselected hosting remains explicit; valid deployment parameters produce a complete document',()=>{
  assert.equal(releaseIssues(releaseConfig({})).length,5);
  const ready=releaseConfig(configured);
  assert.deepEqual(releaseIssues(ready),[]);
  const html=renderLegalPage('/privacy',ready);
  assert.match(html,/Стужин Дмитрий Юрьевич и Явников Федор Андреевич/);
  assert.match(html,/stuzzhin@mail.ru/);
  assert.match(html,/до 7 дней/);
  assert.doesNotMatch(html,/Редакция для подготовки к выпуску/);
  assert.match(renderLegalPage('/privacy',releaseConfig({})),/Редакция для подготовки к выпуску/);
  assert.ok(releaseIssues(releaseConfig({...configured,LEGAL_HOSTING_COUNTRY:'DE'})).some(v=>v.includes('COUNTRY')));
  for(const bad of ['http://kromka.example','https://user:secret@kromka.example','https://kromka.example/private','https://kromka.example/?token=secret']) assert.equal(releaseConfig({...configured,APP_PUBLIC_URL:bad}).publicUrl,'');
});

test('all documents render server-side with correct escaping and no guessed release domain',()=>{
  const config=releaseConfig({...configured,LEGAL_HOSTING_PROVIDER:'<script>alert(1)</script>'});
  for(const route of legalRoutes){
    const html=renderLegalPage(route,config);
    assert.match(html,/<html lang="ru">/);
    assert.match(html,/<h1>/);
    assert.match(html,/href="\/privacy"/);
    assert.doesNotMatch(html,/<script>alert/);
    assert.doesNotMatch(html,/fonts\.googleapis|fonts\.gstatic/);
    assert.doesNotMatch(html,/flashscore|goal[\s-]*api|фл[еэ]шскор|гоал\s*апи/i);
  }
  assert.equal(renderLegalPage('/not-a-document',config),null);
});

async function startServer(t, env={}) {
  const probe=createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),GOAL_API_KEY:'',API_FOOTBALL_API_KEY:'',RPL_FLASHSCORE_ENABLED:'false',RPL_FLASHSCORE_AUTOSTART:'false',APP_PUBLIC_URL:'',LEGAL_HOSTING_PROVIDER:'',LEGAL_HOSTING_COUNTRY:'',LEGAL_HOSTING_LOCATION:'',LEGAL_LOG_RETENTION_DAYS:'',...env},stdio:'ignore'});
  t.after(()=>child.kill('SIGTERM'));
  const base=`http://127.0.0.1:${port}`;
  for(let n=0;n<80;n++){
    try{ if((await fetch(base+'/healthz')).ok)return base; }catch{}
    if(child.exitCode!==null)throw new Error('Server stopped');
    await new Promise(resolve=>setTimeout(resolve,35));
  }
  throw new Error('Server did not start');
}

test('legal routes, font licenses, private files, HEAD and security headers work without a sports provider',async t=>{
  const base=await startServer(t);
  for(const path of legalRoutes){
    const response=await fetch(base+path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/html/);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.equal(response.headers.get('x-frame-options'),'DENY');
    assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
    assert.match(response.headers.get('content-security-policy'),/font-src 'self'/);
    assert.match(await response.text(),/КРОМКА/);
  }
  assert.equal((await fetch(base+'/privacy',{method:'HEAD'})).status,200);
  assert.equal(await (await fetch(base+'/privacy',{method:'HEAD'})).text(),'');
  const post=await fetch(base+'/privacy',{method:'POST'});
  assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
  assert.match(await (await fetch(base+'/robots.txt')).text(),/Disallow: \//);
  assert.equal((await fetch(base+'/sitemap.xml')).status,404);
  for(const path of ['/server.mjs','/release-config.mjs','/.env','/assets/fonts/SOURCES.md']) assert.equal((await fetch(base+path)).status,403);
  for(const font of ['Golos-Text','Oswald','IBM-Plex-Mono']){
    const response=await fetch(`${base}/assets/fonts/${font}-OFL.txt`);
    assert.equal(response.status,200);assert.match(await response.text(),/SIL OPEN FONT LICENSE/);
  }
  const fonts=await (await fetch(base+'/assets/fonts/fonts.css')).text();
  const resource=fonts.match(/url\((\/assets\/fonts\/[^)]+)\)/)[1];
  assert.match((await fetch(base+resource)).headers.get('content-type'),/^font\//);
});

test('public indexing and sitemap use only the validated configured domain',async t=>{
  const base=await startServer(t,configured);
  const response=await fetch(base+'/privacy',{headers:{Host:'untrusted.example'}});
  assert.equal(response.headers.get('x-robots-tag'),null);
  assert.doesNotMatch(await response.text(),/Редакция для подготовки к выпуску/);
  const xml=await (await fetch(base+'/sitemap.xml')).text();
  assert.match(xml,/https:\/\/kromka\.example\/privacy/);
  assert.doesNotMatch(xml,/untrusted\.example/);
});

function element(){return {hidden:false,disabled:false,textContent:'',listeners:{},addEventListener(kind,fn){this.listeners[kind]=fn},focus(){this.focused=true}}}
test('storage controls require confirmation and erase only owned preferences or owned caches',async()=>{
  const script=await readFile(new URL('../assets/storage-controls.js',import.meta.url),'utf8');
  const nodes=new Map();
  const actions=['preferences','cache'].map(kind=>({dataset:{storageAction:kind},querySelector(selector){const key=kind+selector;if(!nodes.has(key))nodes.set(key,element());return nodes.get(key)}}));
  const saved=new Map([['temp-rpl:favorite-clubs','["cska"]'],['temp-rpl:favorite-matches','["1"]'],['kromka:my-club','cska'],['other-app:setting','keep']]);
  const erased=[];
  const context={document:{querySelectorAll:()=>actions},localStorage:{removeItem:key=>saved.delete(key)},window:{caches:{}},caches:{keys:async()=>['temp-rpl-shell-old','other-app-cache'],delete:async key=>{erased.push(key);return true}}};
  runInNewContext(script,context);
  const node=(kind,selector)=>nodes.get(kind+selector);
  node('preferences','[data-storage-start]').listeners.click();
  assert.equal(saved.get('kromka:my-club'),'cska');
  node('preferences','[data-storage-cancel]').listeners.click();
  assert.equal(saved.get('kromka:my-club'),'cska');
  await node('cache','[data-storage-delete]').listeners.click();
  assert.deepEqual(erased,['temp-rpl-shell-old']);
  assert.equal(saved.get('kromka:my-club'),'cska');
  await node('preferences','[data-storage-delete]').listeners.click();
  assert.deepEqual([...saved],[['other-app:setting','keep']]);
  assert.match(node('preferences','[data-storage-status]').textContent,/удалены/);
});

test('offline legal documents never turn into a cached match screen',async()=>{
  const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
  const listeners={};
  runInNewContext(source,{self:{location:{origin:'https://kromka.example'},addEventListener:(name,fn)=>{listeners[name]=fn}},fetch:async()=>{throw new Error('offline')},caches:{match:async()=>new Response('match homepage')},Response,URL});
  let response;
  listeners.fetch({request:{url:'https://kromka.example/privacy',method:'GET',mode:'navigate'},respondWith:promise=>{response=promise}});
  const result=await response;
  assert.equal(result.status,503);
  assert.match(await result.text(),/Документ недоступен без интернета/);
});
