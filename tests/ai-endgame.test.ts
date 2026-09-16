import test from 'node:test';
import assert from 'node:assert/strict';
import { solveEndgame } from '../src/game/ai.endgame.ts';
import { searchAction, createHardAgent } from '../src/game/ai.search.ts';
import { createGame, applyAction, legalActions, calculateResult } from '../src/game/engine.ts';
import { CELLS, TRACK_END } from '../src/game/data.ts';
import type { GameState } from '../src/game/types.ts';

// Independent exhaustive oracle uses production transitions, including all sale
// orders, rather than the solver's simulation, memoization and pruning.
function oracle(s: GameState, seat: number): number {
  if (s.players[seat].home !== null) return calculateResult(s.players[seat]).total;
  return Math.max(...legalActions(s).map((a) => oracle(applyAction(s, a), seat)));
}

function tail(): GameState {
  const s = createGame(101);
  s.round = 6;
  s.players.slice(1).forEach((p, i) => {
    p.home = i;
    p.position = TRACK_END;
  });
  const p = s.players[0];
  p.position = 22;
  p.resources = [4, 7, 7, 7, 7];
  p.master = 14;
  p.coins = 7;
  p.cards = ['master', 'coins'];
  p.scored = ['r1'];
  p.garden[CELLS.find((c) => c.side === 'sun')!.id] = {
    id: 'fixture',
    kind: 'resource',
    color: 2,
    value: 5,
  };
  // Leave a scoring space and barrel stop, with no purchases after them.
  s.market.forEach((m) => {
    m.tiles = [];
  });
  return s;
}

test('solo endgame matches exhaustive optimal score across scoring, privileges and return', () => {
  for (const master of [8, 14, 19]) {
    const s = tail();
    s.players[0].master = master;
    const before = structuredClone(s);
    const result = solveEndgame(s, 8000)!;
    assert.equal(result.solved, true);
    assert.equal(result.value, oracle(s, 0));
    let after = s;
    const agent = createHardAgent({ endgame: true });
    for (const action of result.plan) {
      assert.deepEqual(agent(after), action);
      after = applyAction(after, action);
    }
    assert.equal(after.phase.kind, 'finished');
    assert.equal(calculateResult(after.players[0]).total, result.value);
    assert.deepEqual(s, before);
  }
});

test('final return accounts for card sales, coin conversion and every available reward', () => {
  const s = tail();
  s.phase = { kind: 'home' };
  s.players[0].position = TRACK_END;
  s.players[3].home = null;
  const result = solveEndgame(s, 100)!;
  assert.equal(result.solved, true);
  assert.equal(result.value, oracle(s, 0));
  assert.equal(result.plan[0].type, 'emergency');
  const altered = structuredClone(s);
  altered.seed++;
  altered.resourceDeck.reverse();
  altered.monkDeck.reverse();
  assert.deepEqual(solveEndgame(altered, 100), result);
});

test('unsolved or contested endgames fall back legally within the total node budget', () => {
  const s = tail();
  const result = solveEndgame(s, 1)!;
  assert.equal(result.solved, false);
  assert.equal(result.nodes, 1);
  assert.deepEqual(result.plan, []);
  for (const nodes of [1, 20, 100]) {
    const search = searchAction(s, { nodes, rollouts: 0, endgame: true });
    assert.ok(search.nodes <= nodes);
    assert.ok(legalActions(s).some((a) => JSON.stringify(a) === JSON.stringify(search.action)));
  }
  s.players[3].home = null;
  assert.equal(solveEndgame(s, 8000), undefined);
  s.phase = { kind: 'home' };
  s.round = 5;
  assert.equal(solveEndgame(s, 8000), undefined);
});

test('default search keeps the pre-experiment policy until full-game improvement is demonstrated', () => {
  const s = tail();
  const options = { nodes: 100, rollouts: 0 };
  assert.deepEqual(searchAction(s, options), searchAction(s, { ...options, endgame: false }));
});
