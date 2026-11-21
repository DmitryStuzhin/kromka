import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { syncPushSelection, installPushSettings } from './push.js';

const API = 'https://tokenapp.ru';
window.kromkaApiUrl = value => new URL(value, API).href;
window.kromkaNative = true;
document.addEventListener('kromka:selection', syncPushSelection);
document.addEventListener('kromka:data-ready', syncPushSelection);
document.addEventListener('DOMContentLoaded', () => {
  installPushSettings(); syncPushSelection();
  const links = document.querySelector('.app-links');
  if (links) { const link=document.createElement('a'); link.href='/storage.html#notifications'; link.textContent='Уведомления'; links.append(link); }
});
let pendingMatch;
const openPending = () => { if(pendingMatch && window.kromkaOpenPushMatch?.(pendingMatch)) { pendingMatch=null; sessionStorage.removeItem('kromka:push-match'); } };
const receiveLink = value => {
  try {
    const match = typeof value === 'string' && /^ru\.tokenapp\.kromka:\/\/match\/([A-Za-z0-9_-]{1,64})$/.exec(value);
    if(!match) return;
    console.info('Получена ссылка на матч из уведомления');
    pendingMatch = match[1]; sessionStorage.setItem('kromka:push-match', pendingMatch);
    if(location.pathname !== '/' && location.pathname !== '/index.html') location.href='/'; else openPending();
  } catch (error) { console.warn('Не удалось открыть матч из уведомления', error?.message); }
};
pendingMatch = sessionStorage.getItem('kromka:push-match');
App.getLaunchUrl().then(result=>{if(result?.url) receiveLink(result.url);}).catch(()=>{});
App.addListener('appUrlOpen', event=>receiveLink(event.url));
document.addEventListener('kromka:data-ready', openPending);
document.addEventListener('DOMContentLoaded', openPending);
document.addEventListener('click', async event => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  const url = new URL(link.href);
  if (url.protocol === 'https:' && url.origin !== location.origin) {
    event.preventDefault();
    await Browser.open({ url: url.href });
  }
});
App.addListener('backButton', async () => {
  if (document.querySelector('#overlay.open')) { window.closeOverlay?.(); return; }
  const detailBack = document.querySelector('#screen [data-detail-back]');
  if (detailBack) { detailBack.click(); return; }
  if (location.pathname !== '/' && location.pathname !== '/index.html') { location.href = '/'; return; }
  const today = document.querySelector('.nav-item[data-tab="today"]');
  if (today && !today.classList.contains('active')) { today.click(); return; }
  await App.minimizeApp();
});
