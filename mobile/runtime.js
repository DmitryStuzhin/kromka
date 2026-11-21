import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const API = 'https://tokenapp.ru';
window.kromkaApiUrl = value => new URL(value, API).href;
window.kromkaNative = true;
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
