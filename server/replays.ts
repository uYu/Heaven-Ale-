import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { scoresOf, validateRecord } from '../src/replay/model.ts';
import type { ReplayRecord } from '../src/replay/model.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
interface Row {
  id: string;
  secret_hash: string;
  record: string;
  player_count: number;
  action_count: number;
  published_at: string | null;
  scores: string;
}
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
export function openReplayStore(path: string, capacity = 100000) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS replays (
      id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, record TEXT NOT NULL,
      player_count INTEGER NOT NULL, action_count INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT,
      scores TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS replays_public ON replays(published_at DESC, id DESC);
  `);
  const summary = (row: Row) => ({
    id: row.id,
    playerCount: row.player_count,
    actionCount: row.action_count,
    publishedAt: row.published_at!,
    scores: JSON.parse(row.scores),
  });
  return {
    close: () => db.close(),
    upload(id: string, secret: string, input: unknown) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
        !/^[0-9a-f]{64}$/i.test(secret)
      )
        throw new ApiError(400, '上传凭证无效。');
      const old = db.prepare('SELECT * FROM replays WHERE id = ?').get(id) as unknown as
        Row | undefined;
      if (
        old &&
        !timingSafeEqual(Buffer.from(old.secret_hash, 'hex'), Buffer.from(hash(secret), 'hex'))
      )
        throw new ApiError(403, '无权修改此对局。');
      let validated: ReturnType<typeof validateRecord>;
      try {
        validated = validateRecord(input);
      } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : '对局记录无效。');
      }
      const { record, state } = validated;
      if (old) {
        const prior = JSON.parse(old.record) as ReplayRecord;
        const sameSetup =
          prior.rules === record.rules &&
          prior.seed === record.seed &&
          JSON.stringify(prior.setup) === JSON.stringify(record.setup);
        const samePrefix = prior.actions
          .slice(0, Math.min(prior.actions.length, record.actions.length))
          .every(
            (action, index) => JSON.stringify(action) === JSON.stringify(record.actions[index]),
          );
        if (!sameSetup || !samePrefix) throw new ApiError(409, '此对局已存在不同的行动记录。');
        if (record.actions.length <= prior.actions.length)
          return { id, actionCount: old.action_count, published: !!old.published_at };
        if (old.published_at) throw new ApiError(409, '已公开的对局不能修改。');
      } else if (
        Number((db.prepare('SELECT COUNT(*) AS n FROM replays').get() as { n: number }).n) >=
        capacity
      ) {
        throw new ApiError(503, '存档空间已满，请联系站点管理员。');
      }
      const now = new Date().toISOString();
      const published = state.phase.kind === 'finished';
      // One SQL statement atomically persists the record and its public metadata.
      db.prepare(
        `INSERT INTO replays VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET record=excluded.record, action_count=excluded.action_count,
        updated_at=excluded.updated_at, published_at=excluded.published_at, scores=excluded.scores`,
      ).run(
        id,
        hash(secret),
        JSON.stringify(record),
        state.players.length,
        record.actions.length,
        now,
        now,
        published ? now : null,
        JSON.stringify(published ? scoresOf(state) : []),
      );
      return { id, actionCount: record.actions.length, published };
    },
    list(page: number, playerCount?: number) {
      const filter = playerCount ? ' AND player_count = ?' : '';
      const params = playerCount ? [playerCount] : [];
      const rows = db
        .prepare(
          `SELECT id, player_count, action_count, published_at, scores FROM replays WHERE published_at IS NOT NULL${filter} ORDER BY published_at DESC, id DESC LIMIT 21 OFFSET ?`,
        )
        .all(...params, (page - 1) * 20) as unknown as Row[];
      return { items: rows.slice(0, 20).map(summary), hasMore: rows.length > 20, page };
    },
    get(id: string) {
      const row = db
        .prepare(
          'SELECT id, record, player_count, action_count, published_at, scores FROM replays WHERE id = ? AND published_at IS NOT NULL',
        )
        .get(id) as unknown as Row | undefined;
      if (!row) throw new ApiError(404, '回放不存在或对局尚未结束。');
      return { ...summary(row), record: JSON.parse(row.record) };
    },
  };
}
