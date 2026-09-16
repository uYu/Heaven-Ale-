import test from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, SCORE_PAIRS, TRACK_END, masterLevel, neighbours } from '../src/game/data.ts';
import {
  activate,
  advanceResource,
  applyAction,
  assertInvariants,
  calculateResult,
  canVisit,
  claimable,
  createGame,
  goalMet,
  legalActions,
  scoreOptions,
  shedOptions,
  shedTier,
} from '../src/game/engine.ts';
import { chooseAction } from '../src/game/ai.ts';
import { deserialize, serialize } from '../src/game/storage.ts';
import type { GameState, Resource, Tile } from '../src/game/types.ts';
const tile = (color: Resource = 0, value = 3, id = 'test'): Tile => ({
  kind: 'resource',
  color,
  value,
  id,
});
const sunny = CELLS.filter((c) => c.side === 'sun'),
  shady = CELLS.filter((c) => c.side === 'shade'),
  sheds = CELLS.filter((c) => c.side === 'shed');
function atMarket(type: 'resource' | 'score' | 'monk' | 'barrel', s = createGame(42)) {
  const space = s.market.findIndex((m) => m.type === type);
  return { s, space };
}

test('original board geometry, setup and fixed first-player bonuses', () => {
  const s = createGame(42);
  assert.equal(CELLS.length, 37);
  assert.equal(sunny.length, 15);
  assert.equal(shady.length, 15);
  assert.equal(sheds.length, 7);
  sheds.forEach((c) => {
    assert.equal(neighbours(c.id).length, 6);
    assert.ok(neighbours(c.id).every((id) => id >= 0 && CELLS[id].side !== 'shed'));
  });
  assert.deepEqual(s.players[0].resources, [0, -2, -4, -6, -8]);
  assert.equal(s.players[0].master, -10);
  assert.equal(s.players[0].coins, 25);
  assert.equal(s.players[3].master, -9);
  assert.equal(s.players[2].resources[4], -6);
  assert.equal(s.players[1].coins, 27);
  assert.equal(s.market.filter((m) => m.type === 'resource').length, 15);
  assert.equal(s.market.filter((m) => m.disc).length, 6);
  assert.equal(s.market.filter((m) => m.type === 'monk').length, 4);
  assertInvariants(s);
  assert.deepEqual(createGame(42), s);
  assert.notDeepEqual(createGame(43).market, s.market);
});
test('movement is forward only; empty and unaffordable spaces are illegal', () => {
  const { s, space } = atMarket('resource');
  s.players[0].position = space;
  assert.equal(canVisit(s, space), false);
  s.players[0].position = -1;
  s.market[space].tiles = [];
  assert.equal(canVisit(s, space), false);
  s.market[space].tiles = [tile(0, 5)];
  s.players[0].coins = 0;
  s.players[0].cards = [];
  assert.equal(canVisit(s, space), false);
  s.players[0].cards = ['master', 'barrel'];
  assert.equal(canVisit(s, space), true);
  assert.equal(canVisit(s, TRACK_END), true);
  assert.throws(() => applyAction(s, { type: 'move', space: 99 }));
});
test('purchase costs, occupancy, mandatory purchase and multiple purchases', () => {
  let { s, space } = atMarket('resource');
  s.market[space].tiles = [tile(0, 3, 'a'), tile(1, 2, 'b')];
  s = applyAction(s, { type: 'move', space });
  assert.throws(() => applyAction(s, { type: 'endBuy' }));
  const original = structuredClone(s);
  s = applyAction(s, { type: 'buy', tile: 'a', cell: sunny[0].id });
  assert.deepEqual(original.players[0].garden, {});
  assert.equal(s.players[0].coins, 19);
  assert.equal(s.turn, 0);
  assert.throws(() => applyAction(s, { type: 'buy', tile: 'b', cell: sunny[0].id }));
  assert.throws(() => applyAction(s, { type: 'buy', tile: 'b', cell: sheds[0].id }));
  s = applyAction(s, { type: 'buy', tile: 'b', cell: shady[0].id });
  assert.equal(s.players[0].coins, 17);
  s = applyAction(s, { type: 'endBuy' });
  assert.equal(s.turn, 1);
});
test('activation distinguishes sunlight, shade and capped resources', () => {
  const p = createGame(1).players[0];
  p.garden[sunny[0].id] = tile(0, 5);
  p.garden[shady[0].id] = tile(1, 4);
  p.resources[0] = 18;
  activate(p, sunny[0].id);
  assert.equal(p.resources[0], 20);
  assert.equal(p.coins, 28);
  activate(p, shady[0].id);
  assert.equal(p.coins, 32);
  assert.equal(p.resources[1], -2);
  p.master = 20;
  p.garden[sunny[1].id] = { kind: 'monk', id: 'm', monk: 0 };
  activate(p, sunny[1].id);
  assert.equal(p.master, 20);
  assert.equal(p.coins, 32);
  advanceResource(p, 2, 50);
  assert.equal(p.resources[2], 20);
  assert.equal(p.coins, 58);
});
test('monk triggering activates neighbours, including monks, without recursive chains', () => {
  const s = createGame(2),
    p = s.players[0];
  const a = CELLS.find(
    (c) =>
      c.side !== 'shed' &&
      neighbours(c.id).filter((n) => n >= 0 && CELLS[n].side !== 'shed').length >= 3,
  )!;
  const ns = neighbours(a.id).filter((n) => n >= 0 && CELLS[n].side !== 'shed'),
    b = ns[0],
    c = ns[1];
  p.garden[a.id] = { kind: 'monk', monk: 0, id: 'm0' };
  p.garden[b] = { kind: 'monk', monk: 1, id: 'm1' };
  p.garden[c] = tile(0, 3);
  const before = structuredClone(p);
  const space = s.market.findIndex((m) => m.scoring === 'B');
  s.phase = { kind: 'score', space };
  const after = applyAction(s, { type: 'score', slot: 'm0' }).players[0];
  assert.equal(after.master, before.master + 1);
  assert.equal(after.coins, before.coins + (CELLS[c].side === 'shade' ? 3 : 0));
  assert.equal(after.resources[0], before.resources[0] + (CELLS[c].side === 'sun' ? 3 : 0));
});
test('number, color and monk scoring cannot be reused or score an absent tile', () => {
  let s = createGame(2);
  s.players[0].garden[sunny[0].id] = tile(2, 4);
  const space = s.market.findIndex((m) => m.scoring === 'ABC');
  s.phase = { kind: 'score', space };
  const options = scoreOptions(s, space);
  assert.ok(options.some((o) => o.slot === 'number' && o.value === 4));
  assert.ok(options.some((o) => o.slot === 'r2'));
  assert.ok(!options.some((o) => o.slot === 'r1'));
  s = applyAction(s, { type: 'score', slot: 'number', value: 4 });
  assert.equal(s.players[0].resources[2], 0);
  assert.equal(s.market[space].disc, false);
  s.turn = 0;
  s.phase = { kind: 'score', space };
  assert.throws(() => applyAction(s, { type: 'score', slot: 'number', value: 4 }));
});
test('all shed thresholds and orientation constraints', () => {
  assert.deepEqual(
    [0, 7, 8, 11, 12, 17, 18, 23, 24, 30].map(shedTier),
    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
  const cell = sheds[0].id;
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((t) => shedOptions(cell, t).length),
    [1, 6, 3, 2, 15],
  );
  const ns = neighbours(cell);
  for (const o of shedOptions(cell, 2))
    assert.equal(Math.abs(ns.indexOf(o[0]) - ns.indexOf(o[1])), 3);
  for (const o of shedOptions(cell, 3))
    for (const n of o) assert.ok(!o.includes(ns[(ns.indexOf(n) + 1) % 6]));
});
test('enclosing a shed creates a pending choice, rewards master immediately, then resumes buying', () => {
  let { s, space } = atMarket('resource');
  const ns = neighbours(sheds[0].id);
  for (let i = 0; i < 5; i++) s.players[0].garden[ns[i]] = tile(0, 2, `x${i}`);
  s.market[space].tiles = [tile(0, 2, 'last')];
  s.phase = { kind: 'buy', space, bought: 0 };
  s = applyAction(s, { type: 'buy', tile: 'last', cell: ns[5] });
  assert.equal(s.phase.kind, 'shed');
  assert.equal(s.players[0].master, -9);
  assert.throws(() => applyAction(s, { type: 'shed', cells: [ns[0], ns[1]] }));
  s = applyAction(s, { type: 'shed', cells: [ns[0], ns[3]] });
  assert.equal(s.players[0].sheds[sheds[0].id], 2);
  assert.equal(s.phase.kind, 'buy');
  assert.equal(s.turn, 0);
});
test('privilege pairs, all privilege rewards and emergency sale are one-time', () => {
  let s = createGame(1);
  const p = s.players[0];
  p.scored = ['r1'];
  p.garden[sunny[0].id] = tile(2, 2);
  const space = s.market.findIndex((m) => m.scoring === 'C');
  s.phase = { kind: 'score', space };
  s = applyAction(s, { type: 'score', slot: 'r2' });
  assert.equal(s.phase.kind, 'privilege');
  s = applyAction(s, { type: 'privilege', card: 'coins' });
  assert.equal(s.players[0].coins, 37);
  assert.equal(s.players[0].privileges[1], 'coins');
  s.turn = 0;
  s.phase = { kind: 'move' };
  assert.throws(() => applyAction(s, { type: 'emergency', card: 'coins' }));
  s = applyAction(s, { type: 'emergency', card: 'master' });
  assert.equal(s.players[0].coins, 40);
  for (const card of ['color', 'lowest', 'barrel', 'master', 'skip'] as const) {
    let q = createGame(3);
    q.players[0].garden[sunny[0].id] = tile(4, 2);
    q.players[0].scored = ['r0', 'number'];
    q.phase = { kind: 'privilege', pair: 0 };
    q = applyAction(q, {
      type: 'privilege',
      card,
      ...(['color', 'lowest'].includes(card) ? { color: 4 } : {}),
    });
    assert.equal(q.players[0].privileges[0], card);
    if (card === 'color') assert.equal(q.players[0].resources[4], -7);
    if (card === 'lowest') assert.equal(q.players[0].resources[4], -6);
    if (card === 'master') assert.equal(q.players[0].master, -5);
  }
  const q = createGame(3);
  q.phase = { kind: 'privilege', pair: 0 };
  assert.throws(() => applyAction(q, { type: 'privilege', card: 'lowest', color: 0 }));
});
test('barrels award all eligible goals and cannot award both sizes to one player', () => {
  let s = createGame(1);
  s.players[0].master = 1;
  s.players[0].resources = [1, 1, 1, 1, 20];
  assert.deepEqual(claimable(s), [0, 1, 8]);
  const space = s.market.findIndex((m) => m.type === 'barrel');
  s = applyAction(s, { type: 'move', space });
  assert.deepEqual(
    s.players[0].barrels.map((b) => b.points),
    [4, 4, 4],
  );
  s.turn = 0;
  s.players[0].position = -1;
  assert.deepEqual(claimable(s), []);
  s.turn = 1;
  s.players[1].master = 1;
  s = applyAction(s, { type: 'move', space });
  assert.equal(s.players[1].barrels[0].points, 2);
  assert.equal(s.barrelSupply[0], 0);
});
test('all barrel predicates reflect the original twelve goals', () => {
  const p = createGame(1).players[0];
  p.master = 20;
  p.resources = [20, 20, 20, 20, 20];
  p.scored = SCORE_PAIRS.flat();
  p.privileges = { 0: 'coins', 1: 'master', 2: 'color' };
  CELLS.filter((c) => c.side !== 'shed').forEach(
    (c, i) => (p.garden[c.id] = tile(0, i < 6 ? 1 : i < 12 ? 5 : 3, `g${i}`)),
  );
  sheds.forEach((c, i) => (p.sheds[c.id] = i < 3 ? 0 : i - 2));
  for (let i = 0; i < 12; i++) assert.equal(goalMet(p, i), true, `goal ${i}`);
});
test('home bonuses, forced first player and round refill preserve leftover tiles', () => {
  let s = createGame(1);
  const oldTiles = s.market[0].tiles.map((t) => t.id);
  s.players[1].home = 1;
  s.players[2].home = 2;
  s.players[3].home = 3;
  s.players[0].position = TRACK_END;
  s.phase = { kind: 'home' };
  assert.deepEqual(
    legalActions(s).filter((a) => a.type === 'home'),
    [{ type: 'home', slot: 0 }],
  );
  assert.throws(() => applyAction(s, { type: 'home', slot: 3 }));
  s = applyAction(s, { type: 'home', slot: 0 });
  assert.equal(s.round, 2);
  assert.equal(s.turn, 0);
  assert.ok(s.players.every((p) => p.home === null));
  assert.equal(s.market[0].tiles.length, 2);
  assert.equal(s.market[0].tiles[0].id, oldTiles[0]);
  assertInvariants(s);
  let q = createGame(1);
  q.phase = { kind: 'home' };
  q = applyAction(q, { type: 'home', slot: 0 });
  assert.equal(q.players[0].master, -10, 'first-player space has no master reward');
});
test('final scoring: exchange before money, negative positions score zero, barrel bonus and tie-compatible totals', () => {
  const p = createGame(1).players[0];
  p.master = 12;
  p.resources = [10, 8, 8, 8, 0];
  p.coins = 20;
  p.home = 0;
  p.barrels = [
    { goal: 0, points: 4 },
    { goal: 1, points: 2 },
  ];
  p.privileges = { 0: 'barrel' };
  const r = calculateResult(p);
  assert.equal(r.rate, 2);
  assert.equal(r.multiplier, 4);
  assert.equal(r.exchanges.length, 5);
  assert.equal(Math.min(...r.afterExchange), 5);
  assert.equal(r.coinsSpent, 20);
  assert.equal(r.minimum, 6);
  assert.equal(r.production, 24);
  assert.equal(r.total, 33);
  assert.deepEqual(p.resources, [10, 8, 8, 8, 0]);
  p.resources = [0, 0, 0, 0, 0];
  p.coins = 0;
  assert.equal(calculateResult(p).production, 0);
  p.resources = [20, 20, 20, 20, 20];
  p.coins = 100;
  assert.equal(calculateResult(p).coinsSpent, 0);
  assert.deepEqual([0, 1, 5, 9, 12, 15, 18, 20].map(masterLevel), [
    { rate: 5, multiplier: 2 },
    { rate: 4, multiplier: 3 },
    { rate: 3, multiplier: 3 },
    { rate: 3, multiplier: 4 },
    { rate: 2, multiplier: 4 },
    { rate: 2, multiplier: 5 },
    { rate: 2, multiplier: 6 },
    { rate: 1, multiplier: 6 },
  ]);
});
test('save replays every mid-turn state and rejects corrupt files', () => {
  let s = createGame(8);
  for (let i = 0; i < 45; i++) {
    s = applyAction(s, chooseAction(s));
    if (i % 5 === 0) assert.deepEqual(deserialize(serialize(s)), s);
  }
  assert.throws(() => deserialize('{'));
  assert.throws(() => deserialize('{"version":99}'));
  assert.throws(() =>
    deserialize(JSON.stringify({ version: 1, seed: 1, actions: [{ type: 'move', space: 999 }] })),
  );
});
test('AI ignores hidden future tile order', () => {
  let s = createGame(11);
  for (let i = 0; i < 80; i++) {
    const altered = structuredClone(s);
    altered.resourceDeck.reverse();
    altered.monkDeck.reverse();
    assert.deepEqual(chooseAction(s), chooseAction(altered));
    s = applyAction(s, chooseAction(s));
  }
});
test('20 deterministic four-player games complete with invariants after every action', () => {
  for (let seed = 100; seed < 120; seed++) {
    let s: GameState = createGame(seed),
      steps = 0;
    while (s.phase.kind !== 'finished') {
      const action = chooseAction(s);
      assert.ok(legalActions(s).some((a) => JSON.stringify(a) === JSON.stringify(action)));
      s = applyAction(s, action);
      assertInvariants(s);
      assert.ok(++steps < 1500);
    }
    assert.equal(s.round, 6);
    assert.equal(s.players.filter((p) => p.home === 0).length, 1);
    s.players.forEach((p) => assert.ok(calculateResult(p).total >= 0));
  }
});
