import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, legalActions } from '../src/game/engine.ts';
import { serializeSession } from '../src/game/storage.ts';

test('upload outbox retries failures, coalesces progress, excludes drafts and remembers acknowledgements', async () => {
  const values = new Map<string, string>();
  const windowOriginal = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storageOriginal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const fetchOriginal = globalThis.fetch;
  const cryptoOriginal = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const browserCrypto = globalThis.crypto;
  // HTTP on a public IP exposes getRandomValues, but not randomUUID.
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: browserCrypto.getRandomValues.bind(browserCrypto) },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  const sync = await import('../src/replay/sync.ts');
  try {
    let session = sync.attachRecording({ committed: createGame(7), draft: [] });
    assert.match(
      session.replayId!,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(sync.attachRecording(session).replayId, session.replayId);
    sync.enqueueRecording(session.committed, session.replayId!);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    await sync.flush();
    assert.equal(sync.getSyncStatus(session.replayId!).kind, 'error');
    const savedQueue = JSON.parse(values.get('heaven-and-ale.replay-outbox.v1')!);
    assert.equal(savedQueue.length, 1);
    assert.ok(!serializeSession(session).includes(savedQueue[0].secret));
    const next = applyAction(
      session.committed,
      legalActions(session.committed).find((a) => a.type === 'move')!,
    );
    session = { ...session, committed: next };
    sync.enqueueRecording(next, session.replayId!);
    const payloads: unknown[] = [];
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(options!.body as string);
      payloads.push(payload);
      return new Response(
        JSON.stringify({ actionCount: payload.actions.length, published: false }),
        { status: 200 },
      );
    };
    await sync.flush();
    assert.equal(payloads.length, 1);
    assert.equal((payloads[0] as { actions: unknown[] }).actions.length, 1);
    assert.ok(!('draft' in (payloads[0] as object)));
    assert.deepEqual(JSON.parse(values.get('heaven-and-ale.replay-outbox.v1')!), []);
    assert.equal(sync.getSyncStatus(session.replayId!).kind, 'saved');
    sync.enqueueRecording(next, session.replayId!);
    await sync.flush();
    assert.equal(payloads.length, 1);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (cryptoOriginal) Object.defineProperty(globalThis, 'crypto', cryptoOriginal);
    else delete (globalThis as Record<string, unknown>).crypto;
    if (windowOriginal) Object.defineProperty(globalThis, 'window', windowOriginal);
    else delete (globalThis as Record<string, unknown>).window;
    if (storageOriginal) Object.defineProperty(globalThis, 'localStorage', storageOriginal);
    else delete (globalThis as Record<string, unknown>).localStorage;
  }
});
