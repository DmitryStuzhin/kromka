import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { pushConfig } from '../push-http.mjs';
const database = pushConfig().database;
const destination = process.argv[2];
if (!destination) throw new Error('Supply a backup destination outside the web root');
if (existsSync(database)) {
  const db = new DatabaseSync(database, { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
}
