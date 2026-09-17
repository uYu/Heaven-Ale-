import { applyAction } from './engine.ts';
import type { Action, GameState } from './types.ts';

/** A human turn is a transaction. Only confirmation releases control to the AI. */
export interface TurnSession {
  committed: GameState;
  draft: Action[];
}
export function completesTurn(before: GameState, after: GameState, action: Action): boolean {
  return (
    action.type === 'start' ||
    action.type === 'endBuy' ||
    action.type === 'home' ||
    action.type === 'privilege' ||
    (action.type === 'score' && after.phase.kind !== 'privilege') ||
    (action.type === 'move' && before.market[action.space]?.type === 'barrel')
  );
}
export function inspectSession(session: TurnSession) {
  let current = session.committed,
    beforeLast = current,
    ready = false;
  for (const action of session.draft) {
    if (ready || current.turn !== 0 || current.phase.kind === 'finished')
      throw new Error('待确认操作跨越了回合边界。');
    beforeLast = current;
    current = applyAction(current, action);
    ready = completesTurn(beforeLast, current, action);
  }
  // Do not expose the next round's replenishment (or results) before confirmation.
  let visible = current;
  if (ready) {
    visible = {
      ...current,
      turn: 0,
      round: beforeLast.round,
      phase: { kind: beforeLast.phase.kind === 'setup' ? 'setup' : 'move' },
      log: current.log.filter((l) => l.round === beforeLast.round || l.round < beforeLast.round),
    };
    if (current.round !== beforeLast.round) {
      const last = session.draft[session.draft.length - 1];
      visible = {
        ...visible,
        ...(beforeLast.startingSlots ? { startingSlots: beforeLast.startingSlots } : {}),
        market: beforeLast.market,
        resourceDeck: beforeLast.resourceDeck,
        monkDeck: beforeLast.monkDeck,
        players: current.players.map((p, i) => ({
          ...p,
          position: beforeLast.players[i].position,
          home: i === 0 && last.type === 'home' ? last.slot : beforeLast.players[i].home,
        })),
      };
    }
  }
  return { current, visible, ready };
}
export function stageAction(session: TurnSession, action: Action): TurnSession {
  const { current, ready } = inspectSession(session);
  if (ready) throw new Error('请先确认本回合，或撤回操作。');
  if (current.turn !== 0 || current.phase.kind === 'finished')
    throw new Error('当前不是你的回合。');
  applyAction(current, action); // Validate without changing the committed state.
  return { committed: session.committed, draft: [...session.draft, action] };
}
export function undoAction(session: TurnSession): TurnSession {
  return { ...session, draft: session.draft.slice(0, -1) };
}
export function resetTurn(session: TurnSession): TurnSession {
  return { ...session, draft: [] };
}
export function confirmTurn(session: TurnSession): TurnSession {
  const { current, ready } = inspectSession(session);
  if (!ready) throw new Error('请先完成当前行动及其奖励选择。');
  return { committed: current, draft: [] };
}
export function advanceComputer(session: TurnSession, action: Action): TurnSession {
  if (session.draft.length || session.committed.turn === 0)
    throw new Error('玩家尚未确认，AI 不能行动。');
  return { committed: applyAction(session.committed, action), draft: [] };
}
