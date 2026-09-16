import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  advanceSimulation,
  cloneSimulationState,
  applyAction,
  applySimulationAction,
  createGame,
  legalActions,
  assertInvariants,
} from '../src/game/engine.ts';
import { createAgent, chooseAction } from '../src/game/ai.ts';
import { chooseAction as baseline } from '../src/game/ai.baseline.ts';
import { candidateActions, createHardAgent, searchAction } from '../src/game/ai.search.ts';
import { CELLS } from '../src/game/data.ts';
import type { GameState } from '../src/game/types.ts';

const withoutHistory = (s: GameState) => ({ ...s, actions: [], log: [] });
function freeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}

test('fast simulation matches production rules through complete games without mutating frozen input', () => {
  const phases = new Set<string>();
  for (let seed = 30; seed < 33; seed++) {
    let s = createGame(seed),
      steps = 0;
    while (s.phase.kind !== 'finished') {
      s = withoutHistory(s);
      phases.add(s.phase.kind);
      freeze(s);
      const action = baseline(s),
        actual = applyAction(s, action),
        simulated = applySimulationAction(s, action);
      const mutable = cloneSimulationState(s);
      assert.equal(advanceSimulation(mutable, action), mutable);
      assert.deepEqual(withoutHistory(mutable), withoutHistory(actual));
      assert.deepEqual(withoutHistory(simulated), withoutHistory(actual));
      assertInvariants(simulated);
      assert.ok(++steps < 1500);
      s = actual;
    }
  }
  for (const phase of ['move', 'buy', 'score', 'shed', 'privilege', 'home'])
    assert.ok(phases.has(phase));
});

test('candidate generation covers every destination and both sides for each affordable tile', () => {
  const s = createGame(6);
  const expected = legalActions(s).filter((a) => a.type === 'move');
  const moves = candidateActions(s).filter((a) => a.type === 'move');
  assert.deepEqual(moves, expected);
  s.phase = { kind: 'buy', space: 0, bought: 0 };
  const extra = s.market.findIndex((m, i) => i !== 0 && m.type === 'resource');
  s.market[0].tiles.push(...s.market[extra].tiles);
  s.market[extra].tiles = [];
  const actions = candidateActions(s);
  for (const tile of s.market[0].tiles)
    for (const side of ['sun', 'shade']) {
      assert.ok(
        actions.some((a) => a.type === 'buy' && a.tile === tile.id && CELLS[a.cell].side === side),
      );
    }
});

test('planner follows the complete chosen transaction and replans on a changed public state', () => {
  const options = { nodes: 1800, rollouts: 0 },
    initial = createGame(22);
  const planned = searchAction(initial, options),
    agent = createHardAgent(options);
  assert.ok(planned.plan.length >= 2);
  let s = initial;
  for (const action of planned.plan) {
    const hiddenChanged = { ...s, seed: 9876, resourceDeck: [...s.resourceDeck].reverse() };
    assert.deepEqual(agent(hiddenChanged), action);
    s = applyAction(s, action);
  }
  assert.deepEqual(
    agent(initial),
    planned.action,
    'undo to the original state invalidates the old plan',
  );
  const changed = applyAction(initial, planned.action);
  changed.players[changed.turn].coins++;
  assert.deepEqual(
    agent(changed),
    searchAction(changed, options).action,
    'different public state triggers a fresh search',
  );
});

test('previous hard policy is retained unchanged', () => {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(new URL('../src/game/ai.hard-v1.ts', import.meta.url)))
      .digest('hex'),
    'be8e1e086f5d50b887dc2bf19e5c40b49cdf859e2396fad9e7551aabbfc0b787',
  );
});

test('hard-v2 preserves the previous opening policy and switches to the second planner after round two', () => {
  const opening = createGame(16);
  assert.deepEqual(createAgent('hard-v2')(opening), chooseAction(opening, 'hard-v1'));
  let late = opening;
  while (late.round < 3) late = applyAction(late, baseline(late));
  const expected = createHardAgent()(late);
  assert.deepEqual(createAgent('hard-v2')(late), expected);
});
