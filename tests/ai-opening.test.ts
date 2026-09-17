import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/engine.ts';
import { openingOpportunityPenalty } from '../src/game/ai.opening.ts';
import { searchTree } from '../src/game/ai.mcts.ts';
import { CELLS, TRACK_END } from '../src/game/data.ts';
import type { Action } from '../src/game/types.ts';

const near: Action = { type: 'move', space: 0 };
const far: Action = { type: 'move', space: 26 };
const ranked = [{ action: near, value: 10 }];

test('opening opportunity cost follows useful skipped purchases, not physical distance', () => {
  const s = createGame(8);
  assert.equal(openingOpportunityPenalty(s, [near], ranked), 0);
  assert.ok(openingOpportunityPenalty(s, [far], ranked) > 0);
  assert.ok(openingOpportunityPenalty(s, [{ type: 'move', space: TRACK_END }], ranked) > 0);
  assert.equal(openingOpportunityPenalty(s, [far], [{ action: near, value: -1 }]), 0);
  s.players[0].coins = 0;
  assert.equal(openingOpportunityPenalty(s, [far], ranked), 0);
  s.players[0].coins = 25;
  s.market[0].tiles = [];
  assert.equal(openingOpportunityPenalty(s, [far], ranked), 0);
});

test('opening correction ends after construction starts and does not affect later rounds', () => {
  const s = createGame(8);
  assert.equal(openingOpportunityPenalty(s, [{ type: 'emergency', card: 'coins' }], ranked), 0);
  s.round = 2;
  assert.equal(openingOpportunityPenalty(s, [far], ranked), 0);
  s.round = 1;
  const cell = CELLS.find((c) => c.side !== 'shed')!;
  s.players[0].garden[cell.id] = s.market[0].tiles[0];
  assert.equal(openingOpportunityPenalty(s, [far], ranked), 0);
});

test('hard opening builds nearby instead of skipping most of seed 8 market', () => {
  // Previously the first player went directly to space 17 (the 18th stop).
  const s = createGame(8);
  const result = searchTree(s);
  assert.equal(result.action.type, 'move');
  if (result.action.type === 'move') assert.ok(result.action.space < 14);
  assert.ok(result.plan.some((a) => a.type === 'buy'));
  assert.ok(result.nodes <= 36000);
});
