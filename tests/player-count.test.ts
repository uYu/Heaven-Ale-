import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, legalActions, assertInvariants } from '../src/game/engine.ts';
import { roundsForPlayers } from '../src/game/data.ts';
import {
  serialize,
  deserialize,
  serializeSession,
  deserializeSession,
} from '../src/game/storage.ts';
import { chooseAction } from '../src/game/ai.ts';
import { sampledDecks, publicStateKey } from '../src/game/ai.search.ts';
import { searchTree } from '../src/game/ai.mcts.ts';
import type { Action } from '../src/game/types.ts';

for (const playerCount of [2, 3, 4] as const) {
  test(`${playerCount} players: seeded random seating, deck supply, and save replay`, () => {
    const firstSeats = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGame(seed, { playerCount, randomStart: true });
      assert.deepEqual(state, createGame(seed, { playerCount, randomStart: true }));
      assert.equal(state.players.length, playerCount);
      assert.equal(new Set(state.turnOrder).size, playerCount);
      assert.equal(state.turn, state.turnOrder![0]);
      firstSeats.add(state.turn);
      assert.equal(state.monkDeck.length, roundsForPlayers(playerCount) * 4 - 4);
      assert.equal(sampledDecks(state, 0).monkDeck.length, state.monkDeck.length);
      assertInvariants(state);
      assert.deepEqual(deserialize(serialize(state)), state);
      assert.deepEqual(
        deserializeSession(serializeSession({ committed: state, draft: [] })).committed,
        state,
      );
    }
    assert.equal(firstSeats.size, playerCount);
  });
  test(`${playerCount} players: complete games stay legal and finish in the correct round`, () => {
    for (const seed of [7, 42, 103]) {
      let state = createGame(seed, { playerCount, randomStart: true });
      let steps = 0;
      while (state.phase.kind !== 'finished' && steps++ < 2000) {
        state = applyAction(state, chooseAction(state, 'normal'));
        assertInvariants(state);
      }
      assert.equal(state.phase.kind, 'finished');
      assert.equal(state.round, roundsForPlayers(playerCount));
      assert.deepEqual(deserialize(serialize(state)), state);
    }
  });
  test(`${playerCount} players: final round refill and last return force the first-player slot`, () => {
    let state = createGame(9, { playerCount, randomStart: true });
    while (state.round < roundsForPlayers(playerCount)) {
      const oldRound = state.round;
      while (state.round === oldRound) {
        state = applyAction(state, { type: 'move', space: state.market.length });
        const homes = legalActions(state).filter((a) => a.type === 'home');
        const home = homes.find((a) => a.type === 'home' && a.slot !== 0) ?? homes[0];
        if (state.players.filter((p) => p.home !== null).length === playerCount - 1) {
          assert.ok(homes.every((a) => a.type === 'home' && a.slot === 0));
        }
        state = applyAction(state, home);
      }
      assertInvariants(state);
    }
    const scores = state.market.filter((m) => m.type === 'score');
    assert.equal(
      scores.filter((m) => Number(m.disc) === 2).length,
      playerCount === 2 ? 2 : playerCount === 3 ? 3 : 0,
    );
    if (playerCount < 4) {
      const cell = state.market.findIndex((m) => m.scoring === 'C');
      state.players[state.turn].garden[0] = { id: 'fixture', kind: 'resource', color: 0, value: 1 };
      state.phase = { kind: 'score', space: cell };
      state = applyAction(state, { type: 'score', slot: 'r0' });
      assert.equal(Number(state.market[cell].disc), 1);
    }
  });
  test(`${playerCount} players: hard planner returns a legal action for randomized seating`, () => {
    const state = createGame(123, { playerCount, randomStart: true });
    const result = searchTree(state, { nodes: 200, width: 3 });
    assert.ok(legalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(result.action)));
  });
}

test('legacy saves retain their original four-player human-first setup', () => {
  const old = createGame(123);
  assert.equal(old.turn, 0);
  assert.equal(old.setup, undefined);
  assert.deepEqual(deserialize(JSON.stringify({ version: 1, seed: 123, actions: [] })), old);
  assert.throws(() =>
    deserialize(
      JSON.stringify({
        version: 1,
        seed: 123,
        actions: [],
        setup: { playerCount: 1, randomStart: true },
      }),
    ),
  );
});
test('turn rotation follows the shuffled seating order and planning keys distinguish it', () => {
  let state = createGame(88, { playerCount: 4, randomStart: true });
  const original = structuredClone(state);
  for (let i = 0; i < 3; i++) {
    assert.equal(state.turn, original.turnOrder![i]);
    state = applyAction(state, { type: 'move', space: state.market.length });
    const home = legalActions(state).find((a) => a.type === 'home' && a.slot === i)!;
    state = applyAction(state, home as Action);
  }
  assert.equal(state.turn, original.turnOrder![3]);
  assert.notEqual(
    publicStateKey(original),
    publicStateKey({ ...original, turnOrder: [...original.turnOrder!].reverse() }),
  );
});
