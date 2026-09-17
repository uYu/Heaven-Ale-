import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  assertInvariants,
  cloneSimulationState,
  createGame,
  legalActions,
} from '../src/game/engine.ts';
import { chooseAction, createAgent } from '../src/game/ai.ts';
import { deserializeSession, serializeSession } from '../src/game/storage.ts';
import { confirmTurn, inspectSession, stageAction, undoAction } from '../src/game/session.ts';
import { TRACK_END } from '../src/game/data.ts';
import { publicStateKey } from '../src/game/ai.search.ts';
import type { GameState } from '../src/game/types.ts';

const setup = (playerCount: 2 | 3 | 4, seed = 7) =>
  createGame(seed, { playerCount, randomStart: true, chooseStartingPositions: true });
for (const count of [2, 3, 4] as const) {
  test(`${count} players choose distinct starting slots counterclockwise, then play clockwise`, () => {
    let s = setup(count);
    const order = s.turnOrder!;
    assert.equal(s.phase.kind, 'setup');
    assert.equal(s.startingSlots![order[0]], 0);
    assert.ok(s.players.every((p) => p.coins === 25 && p.master === -10));
    assert.throws(() => applyAction(s, { type: 'start', slot: 0 }));
    assert.throws(() => applyAction(s, { type: 'emergency', card: s.players[s.turn].cards[0] }));
    assert.throws(() => applyAction(s, { type: 'start', slot: 2, color: 5 }));
    for (const [i, id] of order.slice(1).reverse().entries()) {
      assert.equal(s.turn, id);
      s = applyAction(s, { type: 'start', slot: i + 1, ...(i === 1 ? { color: 0 } : {}) });
      assertInvariants(s);
      assert.deepEqual(
        deserializeSession(serializeSession({ committed: s, draft: [] })).committed,
        s,
      );
      if (s.phase.kind === 'setup') assert.throws(() => applyAction(s, { type: 'start', slot: 1 }));
    }
    assert.equal(s.phase.kind, 'move');
    assert.equal(s.round, 1);
    assert.equal(s.turn, order[0]);
    assert.equal(s.startingSlots!.filter((x) => x === null).length, 0);
    assert.equal(s.players[order[0]].master, -10);
    assert.equal(s.players[order.at(-1)!].master, -9);
    if (count >= 3) assert.equal(s.players[order.at(-2)!].resources[0], 2);
    if (count === 4) assert.equal(s.players[order[1]].coins, 27);
    assert.throws(() => applyAction(s, { type: 'start', slot: 3 }));
    const copy = cloneSimulationState(s);
    copy.startingSlots![order[0]] = null;
    assert.equal(s.startingSlots![order[0]], 0);
    assert.notEqual(publicStateKey(copy), publicStateKey(s));
    s = applyAction(s, { type: 'move', space: TRACK_END });
    assert.equal(s.startingSlots![order[0]], null);
    assert.ok(!legalActions(s).some((a) => a.type === 'home' && a.slot === 1));
    s = applyAction(s, { type: 'home', slot: 0 });
    assert.equal(s.turn, order[1]);
  });
  test(`${count} player new-rule games finish, replay, and preserve invariants`, () => {
    let s = setup(count, 42);
    const agent = createAgent('normal');
    for (let step = 0; step < 2000 && s.phase.kind !== 'finished'; step++) {
      s = applyAction(s, agent(s));
      assertInvariants(s);
    }
    assert.equal(s.phase.kind, 'finished');
    assert.deepEqual(
      deserializeSession(serializeSession({ committed: s, draft: [] })).committed,
      s,
    );
  });
}

test('each of five resource rewards and cash are selectable in a two-player opening', () => {
  const s = setup(2);
  for (let color = 0; color < 5; color++) {
    const after = applyAction(s, { type: 'start', slot: 2, color });
    assert.equal(after.players[s.turn].resources[color], s.players[s.turn].resources[color] + 2);
    assert.equal(after.players[s.turn].master, -10);
  }
  assert.equal(applyAction(s, { type: 'start', slot: 3 }).players[s.turn].coins, 27);
});

test('human opening previews remain undoable and survive reload, including the last selection', () => {
  for (const count of [2, 3, 4] as const) {
    for (let seed = 1; seed < 12; seed++) {
      let s: GameState = setup(count, seed);
      while (s.phase.kind === 'setup' && s.turn !== 0) s = applyAction(s, chooseAction(s));
      if (s.phase.kind !== 'setup') continue;
      const original = { committed: s, draft: [] };
      const draft = stageAction(original, legalActions(s)[0]);
      assert.equal(inspectSession(draft).visible.phase.kind, 'setup');
      assert.equal(inspectSession(draft).visible.turn, 0);
      assert.ok(inspectSession(draft).ready);
      assert.deepEqual(deserializeSession(serializeSession(draft)), draft);
      assert.deepEqual(undoAction(draft), original);
      assert.equal(confirmTurn(draft).draft.length, 0);
    }
  }
});

test('all AI difficulties handle opening choices and legacy games retain fixed rewards', () => {
  const s = setup(4);
  for (const difficulty of [
    'baseline',
    'normal',
    'hard',
    'hard-v1',
    'hard-v2',
    'search-v2',
  ] as const) {
    assert.equal(chooseAction(s, difficulty).type, 'start');
    assert.equal(createAgent(difficulty)(s).type, 'start');
  }
  const old = createGame(7, { playerCount: 3, randomStart: true });
  assert.equal(old.phase.kind, 'move');
  assert.equal(old.startingSlots, undefined);
  assert.deepEqual(
    deserializeSession(serializeSession({ committed: old, draft: [] })).committed,
    old,
  );
  const bad = JSON.parse(serializeSession({ committed: old, draft: [] }));
  bad.setup.chooseStartingPositions = 'yes';
  assert.throws(() => deserializeSession(JSON.stringify(bad)));
});
