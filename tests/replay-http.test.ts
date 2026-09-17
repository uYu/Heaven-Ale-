import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createReplayServer } from '../server/http.ts';
import { createGame } from '../src/game/engine.ts';
import { recordingOf } from '../src/replay/model.ts';

test('HTTP API validates requests and never exposes an unfinished archive', async () => {
  const server = createReplayServer({ databasePath: ':memory:', rateLimit: 3 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const id = randomUUID();
  const secret = randomBytes(32).toString('hex');
  const upload = (body: string, auth = secret) =>
    fetch(`${origin}/api/replays/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body,
    });
  try {
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);
    assert.equal((await fetch(`${origin}/api/replays?page=-1`)).status, 400);
    assert.equal((await fetch(`${origin}/api/replays?players=5`)).status, 400);
    assert.equal((await upload('not json')).status, 400);
    const response = await upload(JSON.stringify(recordingOf(createGame(7))));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).published, false);
    assert.equal((await fetch(`${origin}/api/replays/${id}`)).status, 404);
    assert.deepEqual((await (await fetch(`${origin}/api/replays`)).json()).items, []);
    assert.equal((await upload('{}', 'b'.repeat(64))).status, 403);
    assert.equal((await upload('{}')).status, 429);
    assert.equal((await fetch(`${origin}/api/replays/${id}`, { method: 'DELETE' })).status, 404);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('HTTP API reports oversized requests without accepting them', async () => {
  const server = createReplayServer({ databasePath: ':memory:' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/replays/${randomUUID()}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${randomBytes(32).toString('hex')}`,
        },
        body: JSON.stringify({ padding: 'a'.repeat(512 * 1024) }),
      },
    );
    assert.equal(response.status, 413);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
