import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, legalActions } from '../src/game/engine.ts';
import type { Action } from '../src/game/types.ts';

test('worker echoes request identity for stale-result rejection and returns legal actions/errors', async () => {
  const responses: { revision: number; requestId: number; action?: Action; error?: string }[] = [];
  const worker = {
    postMessage: (data: (typeof responses)[number]) => responses.push(data),
    onmessage: (_: unknown) => {},
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { configurable: true, value: worker });
  try {
    await import('../src/game/ai.worker.ts');
    const state = createGame(9);
    for (const [requestId, difficulty] of ['baseline', 'normal', 'hard'].entries()) {
      worker.onmessage({ data: { state, difficulty, requestId } });
      const result = responses.at(-1)!;
      assert.equal(result.requestId, requestId);
      assert.equal(result.revision, state.revision);
      assert.ok(!result.error);
      assert.ok(
        legalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(result.action)),
      );
    }
    state.phase = { kind: 'finished' };
    worker.onmessage({ data: { state, difficulty: 'hard', requestId: 99 } });
    assert.equal(responses.at(-1)!.requestId, 99);
    assert.ok(responses.at(-1)!.error);
  } finally {
    if (original) Object.defineProperty(globalThis, 'self', original);
    else Reflect.deleteProperty(globalThis, 'self');
  }
});
