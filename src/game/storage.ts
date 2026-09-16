import { stageAction } from './session.ts';
import type { TurnSession } from './session.ts';
import { applyAction, assertInvariants, createGame } from './engine.ts';
import type { Action, GameState } from './types.ts';
export const SAVE_KEY = 'heaven-and-ale.save.v1';
export function serialize(s: GameState) {
  return JSON.stringify({
    version: 1,
    seed: s.seed,
    actions: s.actions,
    savedAt: new Date().toISOString(),
  });
}
export function deserialize(text: string): GameState {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('存档格式无效。');
  const d = data as { version?: unknown; seed?: unknown; actions?: unknown };
  if (
    d.version !== 1 ||
    !Number.isInteger(d.seed) ||
    typeof d.seed !== 'number' ||
    d.seed < 0 ||
    d.seed > 0xffffffff ||
    !Array.isArray(d.actions) ||
    d.actions.length > 10000
  )
    throw new Error('存档版本或内容无效。');
  let state = createGame(d.seed);
  for (const action of d.actions) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string')
      throw new Error('存档包含无效行动。');
    state = applyAction(state, action as Action);
  }
  assertInvariants(state);
  return state;
}
export function loadGame(): { state: GameState; restored: boolean; error?: string } {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) return { state: deserialize(saved), restored: true };
  } catch {
    return {
      state: createGame(),
      restored: false,
      error: '无法读取旧存档，已开启新局。旧存档尚未覆盖，你可以导出备份。',
    };
  }
  return { state: createGame(), restored: false };
}

export function serializeSession(session: TurnSession) {
  return JSON.stringify({ ...JSON.parse(serialize(session.committed)), draft: session.draft });
}
export function deserializeSession(text: string): TurnSession {
  const committed = deserialize(text),
    data = JSON.parse(text);
  if (data.draft !== undefined && (!Array.isArray(data.draft) || data.draft.length > 200))
    throw new Error('待确认操作格式无效。');
  let session: TurnSession = { committed, draft: [] };
  for (const action of data.draft ?? []) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string')
      throw new Error('待确认操作无效。');
    session = stageAction(session, action);
  }
  return session;
}
export function loadSession(): { session: TurnSession; restored: boolean; error?: string } {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) return { session: deserializeSession(saved), restored: true };
  } catch {
    return {
      session: { committed: createGame(), draft: [] },
      restored: false,
      error: '无法读取旧存档，已开启新局。旧存档尚未覆盖，你可以导出备份。',
    };
  }
  return { session: { committed: createGame(), draft: [] }, restored: false };
}
