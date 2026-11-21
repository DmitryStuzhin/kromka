import { readFileSync } from 'node:fs';

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const text = value => String(value || '').trim();
const positiveDays = value => /^\d{1,3}$/.test(text(value)) && Number(value) > 0 ? Number(value) : null;

export function releaseConfig(env = process.env) {
  let publicUrl = '';
  try {
    const url = new URL(text(env.APP_PUBLIC_URL));
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) publicUrl = url.origin;
  } catch { /* A public domain is deliberately not guessed from a request header. */ }
  return {
    name: 'КРОМКА', version: packageInfo.version, revision: '1.1', updated: '2026-11-21',
    owners: ['Стужин Дмитрий Юрьевич', 'Явников Федор Андреевич'],
    operatorCountry: 'Россия', email: 'stuzzhin@mail.ru',
    postalAddress: text(env.LEGAL_POSTAL_ADDRESS),
    hostingProvider: text(env.LEGAL_HOSTING_PROVIDER),
    hostingCountry: text(env.LEGAL_HOSTING_COUNTRY),
    hostingLocation: text(env.LEGAL_HOSTING_LOCATION),
    logRetentionDays: positiveDays(env.LEGAL_LOG_RETENTION_DAYS),
    supportRetentionDays: 90,
    publicUrl
  };
}

export function releaseIssues(config) {
  const issues = [];
  if (!config.publicUrl) issues.push('APP_PUBLIC_URL: укажите конечный HTTPS-домен приложения.');
  if (!config.hostingProvider) issues.push('LEGAL_HOSTING_PROVIDER: укажите выбранного российского хостинг-провайдера.');
  if (!/^(?:RU|Россия|Российская Федерация)$/i.test(config.hostingCountry)) issues.push('LEGAL_HOSTING_COUNTRY: подтвердите размещение в России значением RU.');
  if (!config.hostingLocation) issues.push('LEGAL_HOSTING_LOCATION: укажите город или регион дата-центра.');
  if (!config.logRetentionDays) issues.push('LEGAL_LOG_RETENTION_DAYS: укажите фактический срок хранения технических журналов у хостинга.');
  return issues;
}

export const release = releaseConfig();
