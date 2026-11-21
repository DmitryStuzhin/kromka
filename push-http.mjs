import path from 'node:path';
import { PushStore, PUSH_CONSENT } from './push-store.mjs';

export function pushConfig(env = process.env) {
  return { database: env.KROMKA_PUSH_DB || path.resolve(env.KROMKA_CACHE_DIR || '.cache', 'push.sqlite'),
    registration: env.KROMKA_PUSH_REGISTRATION_ENABLED === 'true', enabled: env.KROMKA_PUSH_ENABLED === 'true',
    project: env.RUSTORE_PROJECT_ID || '', serviceToken: env.RUSTORE_SERVICE_TOKEN || '' };
}
export function pushReady(config) { return config.enabled && /^[A-Za-z0-9_-]{3,160}$/.test(config.project) && Boolean(config.serviceToken); }

// Bodies and Authorization headers are never logged or reflected in errors.
export function createPushHandler(config = pushConfig()) {
  let store;
  const limits = new Map();
  const getStore = () => store ||= new PushStore(config.database);
  const reply = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const handler = async (req, res, url) => {
    if (!url.pathname.startsWith('/api/push/')) return false;
    const originOK = req.headers.origin === 'https://localhost';
    if (url.pathname === '/api/push/status' && req.method === 'GET') {
      reply(res, 200, { available: config.registration && pushReady(config), consent: PUSH_CONSENT }); return true;
    }
    const match = url.pathname.match(/^\/api\/push\/devices\/([A-Za-z0-9-]{36})$/);
    if (!match) { reply(res, 404, { error: 'Not found' }); return true; }
    if (!originOK) { reply(res, 403, { error: 'Origin rejected' }); return true; }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      res.writeHead(204); res.end(); return true;
    }
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, PUT, DELETE, OPTIONS'); reply(res, 405, { error: 'Method not allowed' }); return true; }
    // Revocation remains possible even when registration or delivery is switched off.
    if (req.method === 'PUT' && (!config.registration || !pushReady(config))) { reply(res, 503, { error: 'Push registration is not enabled' }); return true; }
    const remote = req.socket.remoteAddress || '';
    const key = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote) ? String(req.headers['x-real-ip'] || remote) : remote;
    const now = Date.now();
    for (const [ip, value] of limits) if (value.until <= now) limits.delete(ip);
    const limit = limits.get(key) || { n: 0, until: now + 60_000 };
    if (limits.size >= 10000 && !limits.has(key) || ++limit.n > 30) { reply(res, 429, { error: 'Retry later' }); return true; }
    limits.set(key, limit);
    const secret = String(req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{43,100})$/)?.[1];
    if (!secret) { reply(res, 401, { error: 'Installation credentials required' }); return true; }
    try {
      if (req.method === 'DELETE') { getStore().remove(match[1], secret); reply(res, 200, { deleted: true }); }
      else if (req.method === 'GET') reply(res, 200, getStore().preferences(match[1], secret));
      else {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('JSON required'), { status: 415 });
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) throw Object.assign(new Error('Body too large'), { status: 413 }); chunks.push(chunk); }
        let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
        reply(res, 200, getStore().register(match[1], secret, input));
      }
    } catch (error) { reply(res, error.status || 500, { error: error.status ? error.message : 'Push storage unavailable' }); }
    return true;
  };
  handler.close = () => store?.close();
  return handler;
}
