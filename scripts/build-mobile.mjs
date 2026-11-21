import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { renderLegalPage, legalRoutes } from '../legal-pages.mjs';
import { releaseConfig } from '../release-config.mjs';

const root = new URL('../', import.meta.url);
const out = new URL('dist-mobile/', root);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of ['assets', 'goal-data.js', 'manifest.json']) await cp(new URL(name, root), new URL(name, out), { recursive: true });
const nativeLinks = html => html.replace(/href="\/(about|privacy|terms|storage|support|licenses)"/g, 'href="/$1.html"');
const inject = html => nativeLinks(html.replace('</head>', '<script src="/native-runtime.js"></script></head>'));
await writeFile(new URL('index.html', out), inject(await readFile(new URL('index.html', root), 'utf8')));
const config = releaseConfig({ ...process.env, APP_PUBLIC_URL: 'https://tokenapp.ru', LEGAL_HOSTING_COUNTRY: 'RU' });
for (const route of legalRoutes) await writeFile(new URL(route.slice(1)+'.html', out), inject(renderLegalPage(route, config)));
await build({entryPoints:[new URL('mobile/runtime.js',root).pathname],bundle:true,format:'iife',outfile:new URL('native-runtime.js',out).pathname});
console.log('Mobile web assets built. Secrets and server source are excluded.');
