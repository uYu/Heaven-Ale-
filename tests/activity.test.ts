import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, legalActions } from '../src/game/engine.ts';
import { describeActivity } from '../src/game/activity.ts';
import { CELLS } from '../src/game/data.ts';
import type { Action } from '../src/game/types.ts';

test('narration includes moves even when the engine emits no log entry', () => {
  const before = createGame(123);
  before.turn = 1;
  const action = legalActions(before).find(
    (a) => a.type === 'move' && before.market[a.space]?.type === 'resource',
  )!;
  const after = applyAction(before, action);
  const event = describeActivity(before, after, action);
  assert.equal(event.player, 1);
  assert.match(event.text, /从起点前进到第 .*购买资源/);
  assert.equal(after.log.length, before.log.length);
});

test('purchase narration reports the exact cell, side and actual coin cost', () => {
  const initial = createGame(123);
  initial.turn = 1;
  const move = legalActions(initial).find(
    (a) => a.type === 'move' && initial.market[a.space]?.type === 'resource',
  )!;
  const before = applyAction(initial, move);
  for (const side of ['sun', 'shade']) {
    const action = legalActions(before).find(
      (a) => a.type === 'buy' && CELLS[a.cell].side === side,
    )!;
    const after = applyAction(before, action);
    const event = describeActivity(before, after, action);
    assert.equal(event.player, 1);
    assert.match(event.text, new RegExp(side === 'sun' ? '阳面' : '阴面'));
    assert.ok(
      event.text.includes(`第 ${(action as Extract<Action, { type: 'buy' }>).cell + 1} 格`),
    );
    assert.ok(
      event.changes.includes(
        `金币 ${after.players[1].coins - before.players[1].coins}（${before.players[1].coins} → ${after.players[1].coins}）`,
      ),
    );
  }
});

test('turn-changing actions attribute results to the actor, not the next player', () => {
  const before = createGame(123);
  before.turn = 1;
  before.phase = { kind: 'score', space: 3 };
  before.players[1].garden = { 0: { id: 'test', kind: 'resource', color: 0, value: 3 } };
  const action: Action = { type: 'score', slot: 'number', value: 3 };
  const after = applyAction(before, action);
  const event = describeActivity(before, after, action);
  assert.notEqual(after.turn, 1);
  assert.equal(event.player, 1);
  assert.equal(event.round, before.round);
  assert.ok(event.changes.some((change) => change.startsWith('木材 +3')));
});
