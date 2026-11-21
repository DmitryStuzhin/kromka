import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { release, releaseIssues } from '../release-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const issues = releaseIssues(release);
const required = ['legal-pages.mjs', 'assets/legal.css', 'assets/storage-controls.js', 'assets/fonts/fonts.css', 'assets/fonts/Golos-Text-OFL.txt', 'assets/fonts/Oswald-OFL.txt', 'assets/fonts/IBM-Plex-Mono-OFL.txt', 'RELEASE-CHECKLIST.md', 'RELEASE-OPERATIONS.md', 'RUSTORE-RELEASE.md'];
for (const filename of required) {
  try { if (!(await stat(resolve(root, filename))).isFile()) throw new Error(); }
  catch { issues.push(`В пакете отсутствует ${filename}.`); }
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
if (/fonts\.(?:googleapis|gstatic)\.com/.test(html)) issues.push('Шрифты по-прежнему запрашиваются с внешнего сервера.');
const fonts = await readFile(resolve(root, 'assets/fonts/fonts.css'), 'utf8');
for (const match of fonts.matchAll(/url\(([^)]+)\)/g)) {
  const resource = match[1].replace(/["']/g,'');
  if (!resource.startsWith('/assets/fonts/')) { issues.push('Шрифт должен загружаться с собственного сервера.'); continue; }
  try { await stat(resolve(root, '.'+resource)); } catch { issues.push(`Отсутствует файл шрифта ${resource}.`); }
}
console.log(`КРОМКА ${release.version} — проверка веб-части и документов`);
if (issues.length) {
  console.log('Публичный запуск пока не готов:');
  issues.forEach(issue=>console.log('  - '+issue));
  process.exitCode = 1;
} else {
  console.log('Параметры веб-публикации и состав документов заполнены.');
  console.log('Перед запуском завершите ручные проверки из RELEASE-CHECKLIST.md.');
}
console.log('Проверка не меняет настройки хостинга, источников спортивных данных или изображений.');

console.log('Сборка, подпись и готовность APK к RuStore проверяются отдельно по RUSTORE-RELEASE.md.');
