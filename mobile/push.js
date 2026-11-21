import { registerPlugin } from '@capacitor/core';
const Push = registerPlugin('KromkaPush');
let syncing = false, dirty = false;
export async function syncPushSelection() {
  if (syncing) { dirty=true; return; }
  syncing = true;
  try {
    do {
      dirty=false;
      const selection = window.kromkaPushSelection?.();
      if (!selection?.ready) return;
      const state = await Push.getState();
      await Push.setSelection({ fixtureIds: selection.fixtureIds, teamIds: selection.teamIds, kinds: state.kinds });
    } while(dirty);
  } catch { /* A later selection/data-ready event retries, without exposing credentials. */ }
  finally { syncing = false; }
}
window.kromkaClearPushData = () => Push.disable();
export function installPushSettings() {
  const section = document.getElementById('notifications');
  if (!section) return;
  let state, busy = false;
  const toggle = document.getElementById('push-toggle'), system = document.getElementById('push-system');
  const checkboxes = [...section.querySelectorAll('input[type=checkbox]')];
  const status = document.getElementById('push-state'), error = document.getElementById('push-error');
  const messages = { off: 'Уведомления выключены.', connecting: 'Подключаем уведомления…', pending: 'Настройки сохранены на устройстве. Ждём связи с сервером.', on: 'Уведомления включены.', revoking: 'На устройстве уведомления выключены. Удаление серверной подписки завершится после восстановления связи.', error: 'Сервер не принял настройки. Выключите уведомления и попробуйте включить снова.', 'token-error': 'Не удалось подключить доставку. Проверьте RuStore и попробуйте включить уведомления снова.' };
  const render = () => {
    status.textContent = !state.configured && !state.enabled ? 'Уведомления пока недоступны. Приложение работает без них.' : state.enabled && !state.permission ? 'Показ уведомлений запрещён в Android. Разрешите его в настройках или выключите подписку.' : messages[state.status] || messages.off;
    document.getElementById('push-selection').textContent = `В избранном: клубов — ${state.teamIds.length}, матчей — ${state.fixtureIds.length}.`;
    toggle.textContent = state.enabled ? 'Выключить уведомления' : 'Включить уведомления';
    toggle.disabled = busy || (!state.configured && !state.enabled);
    system.hidden = !state.configured || state.permission;
    for (const box of checkboxes) { box.checked = state.kinds.includes(box.value); box.disabled = busy || !state.configured; }
  };
  const refresh = async () => { if (!busy) { state = await Push.getState(); render(); } };
  async function action(fn) {
    busy = true; error.textContent = ''; render();
    try { state = await fn(); } catch (e) { error.textContent = e.message || 'Не удалось сохранить. Повторите попытку.'; }
    finally { busy = false; await refresh(); }
  }
  toggle.addEventListener('click', () => action(() => state.enabled ? Push.disable() : Push.enable({ fixtureIds: state.fixtureIds, teamIds: state.teamIds, kinds: state.kinds })));
  for (const box of checkboxes) box.addEventListener('change', () => action(() => Push.setSelection({ fixtureIds: state.fixtureIds, teamIds: state.teamIds, kinds: checkboxes.filter(item=>item.checked).map(item=>item.value) })));
  system.addEventListener('click', () => Push.openSettings().catch(()=>{error.textContent='Откройте настройки Android → Приложения → КРОМКА → Уведомления.';}));
  refresh().catch(()=>{status.textContent='Не удалось прочитать настройки. Закройте и откройте эту страницу.';});
  const timer = setInterval(()=>refresh().catch(()=>{}), 3000);
  window.addEventListener('pagehide', ()=>clearInterval(timer), {once:true});
}
