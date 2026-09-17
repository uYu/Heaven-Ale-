import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAction, createGame, legalActions } from '../src/game/engine.ts';
import { chooseAction } from '../src/game/ai.ts';
import { confirmTurn, stageAction } from '../src/game/session.ts';
import { deserializeSession, serializeSession } from '../src/game/storage.ts';
import { createTimeline, recordingOf, REPLAY_RULES, validateRecord } from '../src/replay/model.ts';
import { ApiError, openReplayStore } from '../server/replays.ts';
import type { GameState } from '../src/game/types.ts';

function finished(count: 2 | 3 | 4) {
  let state = createGame(730 + count, {
    playerCount: count,
    randomStart: true,
    chooseStartingPositions: true,
  });
  while (state.phase.kind !== 'finished') state = applyAction(state, chooseAction(state));
  return state;
}
const games = ([2, 3, 4] as const).map(finished);

test('public replay reconstructs every step and final result for 2-4 players without mutation', () => {
  for (const game of games) {
    const record = recordingOf(game);
    const validated = validateRecord(record);
    assert.deepEqual(validated.state, game);
    const timeline = createTimeline(record);
    let state = createGame(record.seed, record.setup);
    assert.deepEqual(timeline.at(0), state);
    for (let i = 0; i < record.actions.length; i++) {
      state = applyAction(state, record.actions[i]);
      assert.deepEqual(timeline.at(i + 1), state);
      assert.ok(timeline.activities[i].text);
    }
    assert.deepEqual(timeline.at(record.actions.length), game);
    assert.deepEqual(timeline.at(0), createGame(record.seed, record.setup));
    assert.deepEqual(timeline.at(-20), timeline.at(0));
    assert.deepEqual(timeline.at(99999), game);
  }
});

test('validation rejects unsupported versions, invalid actions, oversized histories and strips unrelated data', () => {
  const record = recordingOf(games[0]);
  assert.throws(() => validateRecord({ ...record, rules: 'future' }));
  assert.throws(() => validateRecord({ ...record, seed: -1 }));
  assert.throws(() => validateRecord({ ...record, actions: Array(2001).fill({ type: 'endBuy' }) }));
  assert.throws(() => validateRecord({ ...record, actions: [{ type: 'move', space: 500 }] }));
  assert.throws(() =>
    validateRecord({ ...record, actions: [{ type: 'start', slot: 2, color: '4' }] }),
  );
  const cleaned = validateRecord({
    ...record,
    privateName: 'not public',
    scores: [{ total: 9999 }],
    actions: record.actions.map((a) => ({ ...a, secret: 'not public' })),
  });
  assert.deepEqual(cleaned.record, record);
});

test('SQLite keeps incomplete games private, verifies ownership, publishes only final legal records and survives restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'heaven-replays-'));
  const path = join(directory, 'replays.sqlite');
  let store = openReplayStore(path);
  const id = randomUUID(),
    secret = randomBytes(32).toString('hex');
  const record = recordingOf(games[0]);
  const partial = { ...record, actions: record.actions.slice(0, 3) };
  try {
    assert.equal(store.upload(id, secret, partial).published, false);
    assert.deepEqual(store.list(1).items, []);
    assert.throws(
      () => store.get(id),
      (e: unknown) => e instanceof ApiError && e.status === 404,
    );
    assert.throws(
      () => store.upload(id, 'a'.repeat(64), partial),
      (e: unknown) => e instanceof ApiError && e.status === 403,
    );
    assert.throws(() => store.upload(id, secret, { ...partial, seed: record.seed + 1 }), ApiError);
    assert.equal(store.upload(id, secret, partial).actionCount, 3);
    assert.equal(store.upload(id, secret, { ...partial, actions: [] }).actionCount, 3);
    const result = store.upload(id, secret, record);
    assert.equal(result.published, true);
    assert.equal(store.upload(id, secret, record).actionCount, record.actions.length);
    assert.equal(store.list(1).items.length, 1);
    assert.equal(store.list(1, 3).items.length, 0);
    assert.equal(store.list(1, 2).items.length, 1);
    const publicRecord = store.get(id);
    assert.deepEqual(publicRecord.record, record);
    assert.ok(!JSON.stringify(publicRecord).includes(secret));
    assert.ok(!JSON.stringify(publicRecord).includes('secret_hash'));
    const publishedAt = publicRecord.publishedAt;
    assert.equal(store.upload(id, secret, partial).published, true);
    assert.equal(store.get(id).publishedAt, publishedAt);
    store.close();
    store = openReplayStore(path);
    assert.deepEqual(store.get(id), publicRecord);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('public archive pagination and storage limits do not drop existing games', () => {
  const store = openReplayStore(':memory:', 21);
  try {
    for (let i = 0; i < 21; i++)
      store.upload(randomUUID(), randomBytes(32).toString('hex'), recordingOf(games[0]));
    const first = store.list(1),
      second = store.list(2);
    assert.equal(first.items.length, 20);
    assert.equal(first.hasMore, true);
    assert.equal(second.items.length, 1);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 21);
    assert.throws(
      () => store.upload(randomUUID(), randomBytes(32).toString('hex'), recordingOf(games[0])),
      (e: unknown) => e instanceof ApiError && e.status === 503,
    );
  } finally {
    store.close();
  }
});

test('recording identifier survives local drafts and confirmations without exporting writer secrets', () => {
  let game: GameState = createGame(1, {
    playerCount: 2,
    randomStart: true,
    chooseStartingPositions: true,
  });
  for (let seed = 2; game.turn !== 0; seed++)
    game = createGame(seed, { playerCount: 2, randomStart: true, chooseStartingPositions: true });
  const session = { committed: game, draft: [], replayId: randomUUID() };
  let draft = stageAction(
    session,
    legalActions(game).find((a) => a.type !== 'emergency')!,
  );
  assert.equal(game.phase.kind, 'setup');
  assert.equal(draft.replayId, session.replayId);
  draft = deserializeSession(serializeSession(draft));
  assert.equal(confirmTurn(draft).replayId, session.replayId);
  assert.ok(!serializeSession(draft).includes('secret'));
  assert.equal(recordingOf(game).rules, REPLAY_RULES);
});
