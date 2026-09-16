import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, legalActions } from '../src/game/engine.ts';
import { chooseAction } from '../src/game/ai.ts';
import {
  advanceComputer,
  confirmTurn,
  inspectSession,
  resetTurn,
  stageAction,
  undoAction,
} from '../src/game/session.ts';
import type { TurnSession } from '../src/game/session.ts';
import { deserializeSession, serialize, serializeSession } from '../src/game/storage.ts';
import { CELLS, TRACK_END } from '../src/game/data.ts';

function fresh(): TurnSession {
  return { committed: createGame(123), draft: [] };
}
test('human movement and purchases stay provisional and can be undone independently', () => {
  let session = fresh();
  const original = structuredClone(session.committed);
  session = stageAction(session, { type: 'move', space: 0 });
  assert.equal(session.committed.players[0].position, -1);
  assert.equal(inspectSession(session).visible.players[0].position, 0);
  const current = inspectSession(session).current,
    tile = current.market[0].tiles[0],
    cell = CELLS.find((c) => c.side === 'shade')!.id;
  session = stageAction(session, { type: 'buy', tile: tile.id, cell });
  assert.equal(Object.keys(inspectSession(session).visible.players[0].garden).length, 1);
  assert.deepEqual(session.committed, original);
  session = undoAction(session);
  assert.equal(inspectSession(session).visible.players[0].coins, 25);
  assert.equal(inspectSession(session).visible.market[0].tiles.length, 1);
  session = undoAction(session);
  assert.deepEqual(inspectSession(session).visible, original);
});
test('ready review blocks AI until confirm and can return to buying', () => {
  let session = fresh();
  session = stageAction(session, { type: 'move', space: 0 });
  const s = inspectSession(session).current;
  const buy = legalActions(s).find((a) => a.type === 'buy')!;
  session = stageAction(session, buy);
  session = stageAction(session, { type: 'endBuy' });
  assert.ok(inspectSession(session).ready);
  assert.equal(inspectSession(session).visible.turn, 0);
  assert.equal(inspectSession(session).current.turn, 1);
  assert.throws(() => advanceComputer(session, { type: 'move', space: 1 }));
  assert.throws(() => stageAction(session, { type: 'move', space: 1 }));
  const undone = undoAction(session);
  assert.equal(inspectSession(undone).visible.phase.kind, 'buy');
  assert.equal(inspectSession(undone).ready, false);
  const confirmed = confirmTurn(session);
  assert.equal(confirmed.committed.turn, 1);
  assert.equal(confirmed.draft.length, 0);
  assert.ok(
    advanceComputer(confirmed, chooseAction(confirmed.committed)).committed.revision >
      confirmed.committed.revision,
  );
});
test('a human acting again after everyone else returned still needs confirmation', () => {
  const session = fresh();
  for (let i = 1; i < 4; i++) session.committed.players[i].home = i;
  let draft = stageAction(session, { type: 'move', space: 0 });
  draft = stageAction(
    draft,
    legalActions(inspectSession(draft).current).find((a) => a.type === 'buy')!,
  );
  draft = stageAction(draft, { type: 'endBuy' });
  assert.equal(inspectSession(draft).current.turn, 0);
  assert.equal(inspectSession(draft).ready, true);
  assert.throws(() => stageAction(draft, { type: 'move', space: 1 }));
});
test('round refill is hidden until confirmation, and undo restores the home choice', () => {
  const session = fresh();
  for (let i = 1; i < 4; i++) session.committed.players[i].home = i;
  let draft = stageAction(session, { type: 'move', space: TRACK_END });
  draft = stageAction(draft, { type: 'home', slot: 0 });
  const { current, visible } = inspectSession(draft);
  assert.equal(current.round, 2);
  assert.equal(visible.round, 1);
  assert.deepEqual(visible.market, session.committed.market);
  assert.deepEqual(visible.resourceDeck, session.committed.resourceDeck);
  assert.equal(visible.players[0].home, 0);
  assert.equal(inspectSession(undoAction(draft)).visible.phase.kind, 'home');
  assert.equal(confirmTurn(draft).committed.round, 2);
});
test('endgame is not finalized before human confirmation', () => {
  const session = fresh();
  session.committed.round = 6;
  for (let i = 1; i < 4; i++) session.committed.players[i].home = i;
  let draft = stageAction(session, { type: 'move', space: TRACK_END });
  draft = stageAction(draft, { type: 'home', slot: 0 });
  assert.equal(inspectSession(draft).current.phase.kind, 'finished');
  assert.notEqual(inspectSession(draft).visible.phase.kind, 'finished');
  assert.equal(confirmTurn(draft).committed.phase.kind, 'finished');
});
test('emergency sales and complete transactions reset without losing cards or coins', () => {
  let session = fresh();
  const original = structuredClone(session.committed);
  session = stageAction(session, { type: 'emergency', card: 'coins' });
  assert.equal(inspectSession(session).visible.players[0].coins, 28);
  assert.equal(session.committed.players[0].cards.length, 5);
  assert.throws(() => confirmTurn(session));
  session = resetTurn(session);
  assert.deepEqual(inspectSession(session).visible, original);
});
test('drafts survive export/reload and remain undoable; old saves still load', () => {
  let session = fresh();
  session = stageAction(session, { type: 'move', space: 0 });
  session = stageAction(
    session,
    legalActions(inspectSession(session).current).find((a) => a.type === 'buy')!,
  );
  session = stageAction(session, { type: 'endBuy' });
  const loaded = deserializeSession(serializeSession(session));
  assert.deepEqual(loaded, session);
  assert.ok(inspectSession(loaded).ready);
  assert.equal(inspectSession(undoAction(loaded)).visible.phase.kind, 'buy');
  assert.deepEqual(deserializeSession(serialize(session.committed)), fresh());
  const raw = JSON.parse(serializeSession(session));
  raw.draft.push({ type: 'move', space: 1 });
  assert.throws(() => deserializeSession(JSON.stringify(raw)));
});
test('all human reward phases can be staged and undone; full games finish with confirmation', () => {
  const phases = new Set<string>();
  for (let seed = 1; seed <= 4; seed++) {
    let session: TurnSession = { committed: createGame(seed), draft: [] };
    let steps = 0;
    while (session.committed.phase.kind !== 'finished') {
      const current = inspectSession(session).current;
      if (current.turn === 0) {
        const previous = session,
          action = chooseAction(current);
        phases.add(current.phase.kind);
        session = stageAction(session, action);
        assert.deepEqual(undoAction(session), previous);
        assert.deepEqual(resetTurn(session).committed, previous.committed);
        if (inspectSession(session).ready) session = confirmTurn(session);
      } else session = advanceComputer(session, chooseAction(current));
      assert.ok(++steps < 1500);
    }
  }
  for (const phase of ['move', 'buy', 'shed', 'score', 'privilege', 'home'])
    assert.ok(phases.has(phase), phase);
});
