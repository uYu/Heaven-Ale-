import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chooseAction } from '../src/game/ai.ts';
import { chooseAction as baseline } from '../src/game/ai.baseline.ts';
import { searchAction } from '../src/game/ai.search.ts';
import {
  createGame,
  applyAction,
  legalActions,
  calculateResult,
  assertInvariants,
} from '../src/game/engine.ts';
import { CELLS, TRACK_END, neighbours } from '../src/game/data.ts';

test('frozen baseline source is unchanged', () => {
  const source = readFileSync(new URL('../src/game/ai.baseline.ts', import.meta.url));
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    'becf3e0177405aac143e7868dc1286456ee5b843c9d23cf472ba4402c68c7820',
  );
});

const key = (a: unknown) => JSON.stringify(a);
test('default and explicit baseline preserve the original policy', () => {
  let s = createGame(314);
  for (let i = 0; i < 100; i++) {
    const expected = baseline(s);
    assert.deepEqual(chooseAction(s), expected);
    assert.deepEqual(chooseAction(s, 'baseline'), expected);
    s = applyAction(s, expected);
  }
});

test('hard search is deterministic, legal, bounded and does not mutate input or inspect hidden information', () => {
  let s = createGame(71);
  for (let i = 0; i < 140; i++) {
    if (i % 35 === 0) {
      const before = structuredClone(s),
        altered = structuredClone(s);
      altered.seed = 99999;
      altered.resourceDeck.reverse();
      altered.monkDeck.reverse();
      altered.log = [];
      altered.actions = [];
      const result = searchAction(s);
      assert.deepEqual(searchAction(altered), result);
      assert.deepEqual(s, before);
      assert.ok(legalActions(s).some((a) => key(a) === key(result.action)));
      assert.ok(result.nodes <= 36000);
    }
    s = applyAction(s, baseline(s));
  }
  const result = searchAction(s, { nodes: 1 });
  assert.ok(result.nodes <= 1);
  assert.ok(legalActions(s).some((a) => key(a) === key(result.action)));
});

test('final home choice uses true final scores, including the master threshold', () => {
  const s = createGame(7),
    p = s.players[0];
  s.round = 6;
  s.phase = { kind: 'home' };
  p.position = TRACK_END;
  p.cards = [];
  p.resources = [10, 10, 10, 10, 10];
  p.coins = 0;
  p.master = 14;
  s.players[1].home = 0;
  s.players[2].home = 3;
  s.players[3].position = TRACK_END - 1;
  const action = chooseAction(s, 'hard');
  assert.deepEqual(action, { type: 'home', slot: 1 });
  let after = applyAction(s, action);
  while (after.phase.kind !== 'finished') after = applyAction(after, baseline(after));
  assert.equal(after.phase.kind, 'finished');
  assert.equal(calculateResult(after.players[0]).total, 50);
});

test('search resolves forced sales and pending shed rewards with legal actions', () => {
  const s = createGame(9);
  s.phase = { kind: 'buy', space: 0, bought: 0 };
  s.players[0].coins = 0;
  assert.equal(chooseAction(s, 'hard').type, 'emergency');
  const c = CELLS.find((c) => c.side === 'shed')!;
  for (const [i, id] of neighbours(c.id).entries())
    s.players[0].garden[id] = { id: `fixture${i}`, kind: 'resource', color: 4, value: 3 };
  s.phase = {
    kind: 'shed',
    cell: c.id,
    tier: 3,
    rest: [],
    resume: { kind: 'buy', space: 0, bought: 1 },
  };
  const a = searchAction(s, { nodes: 500, rollouts: 0 }).action;
  assert.ok(legalActions(s).some((b) => key(a) === key(b)));
  assert.doesNotThrow(() => applyAction(s, a));
});

test('mixed hard/normal/baseline game terminates and preserves invariants', () => {
  let s = createGame(4001),
    steps = 0;
  while (s.phase.kind !== 'finished') {
    const action =
      s.turn === 0
        ? searchAction(s, { nodes: 800, rollouts: 0 }).action
        : chooseAction(s, s.turn === 1 ? 'normal' : 'baseline');
    s = applyAction(s, action);
    assertInvariants(s);
    assert.ok(++steps < 1500);
  }
});
