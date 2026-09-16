import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/engine.ts';
import { privilegePreview } from '../src/game/preview.ts';

function state() {
  const s = createGame(123);
  s.turn = 0;
  s.phase = { kind: 'privilege', pair: 0 };
  return s;
}
test('privilege preview counts both sides, explains overflow and leaves the game unchanged', () => {
  const s = state();
  s.players[0].resources[0] = 19;
  s.players[0].garden = {
    0: { id: 'a', kind: 'resource', color: 0, value: 5 },
    1: { id: 'b', kind: 'resource', color: 0, value: 1 },
  };
  const original = JSON.stringify(s);
  assert.match(
    privilegePreview(s, { type: 'privilege', card: 'color', color: 0 }),
    /前进 1 步：19 → 20；超出 20 的 1 步换为 1 金币/,
  );
  assert.equal(JSON.stringify(s), original);
});
test('lowest privilege previews the used disc count, including negative positions', () => {
  const s = state();
  s.players[0].scored = ['number', 'r0', 'r1'];
  assert.match(
    privilegePreview(s, { type: 'privilege', card: 'lowest', color: 4 }),
    /前进 3 步：-8 → -5/,
  );
});
test('master preview respects the cap; empty color and future barrel rewards are explicit', () => {
  const s = state();
  s.players[0].master = 19;
  assert.match(privilegePreview(s, { type: 'privilege', card: 'master' }), /前进 1 步：19 → 20/);
  assert.match(
    privilegePreview(s, { type: 'privilege', card: 'color', color: 0 }),
    /前进 0 步：0 → 0/,
  );
  assert.match(
    privilegePreview(s, { type: 'privilege', card: 'barrel' }),
    /预计 \+0 分，之后获得的酒桶也计入/,
  );
});
