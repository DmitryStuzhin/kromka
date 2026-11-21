(() => {
  const preferenceKeys = ['temp-rpl:favorite-clubs', 'temp-rpl:favorite-matches', 'temp-rpl-favorites', 'kromka:my-club'];
  for (const action of document.querySelectorAll('[data-storage-action]')) {
    const kind = action.dataset.storageAction;
    const start = action.querySelector('[data-storage-start]');
    const confirm = action.querySelector('[data-storage-confirm]');
    const remove = action.querySelector('[data-storage-delete]');
    const cancel = action.querySelector('[data-storage-cancel]');
    const status = action.querySelector('[data-storage-status]');
    start.addEventListener('click', () => {
      status.textContent = '';
      start.hidden = true;
      confirm.hidden = false;
      cancel.focus();
    });
    cancel.addEventListener('click', () => {
      confirm.hidden = true;
      start.hidden = false;
      start.focus();
    });
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      cancel.disabled = true;
      try {
        if (kind === 'preferences') {
          for (const key of preferenceKeys) localStorage.removeItem(key);
          status.textContent = 'Избранное и любимый клуб удалены из этого браузера. Обновите другие открытые вкладки КРОМКИ.';
        } else {
          if (!('caches' in window)) throw new Error('Cache API unavailable');
          const keys = (await caches.keys()).filter(key => key.startsWith('temp-rpl-shell-'));
          await Promise.all(keys.map(key => caches.delete(key)));
          status.textContent = 'Кеш КРОМКИ очищен. Избранное сохранено. Для следующей загрузки ресурсов потребуется интернет.';
        }
        confirm.hidden = true;
        start.hidden = false;
        start.focus();
      } catch {
        status.textContent = 'Браузер не разрешил завершить очистку. Часть данных могла быть удалена. Удалите оставшиеся данные через настройки сайта в браузере.';
      } finally {
        remove.disabled = false;
        cancel.disabled = false;
      }
    });
  }
})();
