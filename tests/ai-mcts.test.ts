import test from 'node:test';
import assert from 'node:assert/strict';
import { createTreeAgent, searchTree } from '../src/game/ai.mcts.ts';
import { chooseAction as baseline } from '../src/game/ai.baseline.ts';
import { applyAction, assertInvariants, createGame, legalActions } from '../src/game/engine.ts';
import type { GameState } from '../src/game/types.ts';
import { createAgent, chooseAction } from '../src/game/ai.ts';

function freeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}
function position(round: number): GameState {
  let s = createGame(71);
  while (s.round < round) s = applyAction(s, baseline(s));
  return s;
}

test('default hard routes to the validated tree search from the first round onward', () => {
  for (const round of [1, 3]) {
    const s = position(round);
    const expected = searchTree(s).action;
    assert.deepEqual(createAgent('hard')(s), expected);
    assert.deepEqual(chooseAction(s, 'hard'), expected);
  }
});

test('MCTS expands later own transactions in opening and middle game', () => {
  for (const round of [1, 3]) {
    const s = position(round);
    const before = structuredClone(s);
    freeze(s);
    const result = searchTree(s);
    assert.ok(result.simulations > result.candidates);
    assert.ok(result.depth >= 2, `round ${round} must search a later own transaction`);
    assert.ok(result.nodes <= 36000);
    assert.ok(legalActions(s).some((a) => JSON.stringify(a) === JSON.stringify(result.action)));
    assert.deepEqual(s, before);
  }
});

test('MCTS is deterministic and independent of hidden deck, seed and history', () => {
  const s = position(3);
  const altered = structuredClone(s);
  altered.seed = 123456789;
  altered.resourceDeck.reverse();
  altered.monkDeck.reverse();
  altered.actions = [];
  altered.log = [];
  const options = { nodes: 6000 };
  assert.deepEqual(searchTree(s, options), searchTree(altered, options));
});

test('MCTS uses one total node budget and handles interrupted simulations', () => {
  const s = position(3);
  for (const nodes of [1, 20, 300, 1500]) {
    const result = searchTree(s, { nodes });
    assert.ok(result.nodes <= nodes);
    assert.ok(legalActions(s).some((a) => JSON.stringify(a) === JSON.stringify(result.action)));
    assert.ok(Number.isFinite(result.value));
  }
});

test('MCTS agent follows its transaction and invalidates stale plans after undo or edits', () => {
  const s = position(3);
  const options = { nodes: 2000 };
  const result = searchTree(s, options);
  const agent = createTreeAgent(options);
  let next = s;
  for (const action of result.plan) {
    assert.deepEqual(agent(next), action);
    next = applyAction(next, action);
    assertInvariants(next);
  }
  assert.deepEqual(agent(s), result.action);
  const changed = applyAction(s, result.action);
  changed.players[changed.turn].coins++;
  assert.deepEqual(agent(changed), searchTree(changed, options).action);
});

test('a complete mixed game with bounded MCTS has legal actions and terminates', () => {
  let s = createGame(14001),
    steps = 0;
  const agent = createTreeAgent({ nodes: 800 });
  while (s.phase.kind !== 'finished') {
    s = applyAction(s, s.turn === 0 ? agent(s) : baseline(s));
    assertInvariants(s);
    assert.ok(++steps < 1500);
  }
});
