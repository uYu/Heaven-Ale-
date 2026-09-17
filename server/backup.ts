import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const destination = resolve(process.argv[2] || `data/backups/replays-${Date.now()}.sqlite`);
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(resolve(process.env.REPLAY_DB || 'data/replays.sqlite'));
try {
  db.prepare('VACUUM INTO ?').run(destination);
  console.log(`Consistent database backup saved: ${destination}`);
} finally {
  db.close();
}
