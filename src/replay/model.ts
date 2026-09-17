import { applyAction, assertInvariants, calculateResult, createGame } from '../game/engine.ts';
import { describeActivity } from '../game/activity.ts';
import type { Activity } from '../game/activity.ts';
import type { Action, GameSetup, GameState } from '../game/types.ts';

// Keep this version's engine behavior compatible when changing future rules.
export const REPLAY_RULES = 'base-2026-09-17';
export const MAX_REPLAY_ACTIONS = 2000;
export interface ReplayRecord {
  rules: typeof REPLAY_RULES;
  seed: number;
  setup?: GameSetup;
  actions: Action[];
}
export interface ReplaySummary {
  id: string;
  playerCount: number;
  actionCount: number;
  publishedAt: string;
  scores: { name: string; total: number }[];
}
export interface PublicReplay extends ReplaySummary {
  record: ReplayRecord;
}

export function recordingOf(state: GameState): ReplayRecord {
  return {
    rules: REPLAY_RULES,
    seed: state.seed,
    ...(state.setup ? { setup: { ...state.setup } } : {}),
    actions: state.actions,
  };
}

// Only game-defined fields survive ingestion; extra client data is never published.
export function canonicalAction(input: unknown): Action {
  if (!input || typeof input !== 'object') throw new Error('行动格式无效。');
  const a = input as Record<string, unknown>;
  const integer = (key: string) => {
    if (!Number.isSafeInteger(a[key])) throw new Error('行动参数无效。');
    return a[key] as number;
  };
  const string = (key: string) => {
    if (typeof a[key] !== 'string' || (a[key] as string).length > 40)
      throw new Error('行动参数无效。');
    return a[key] as string;
  };
  const color = () => (a.color === undefined ? {} : { color: integer('color') });
  switch (a.type) {
    case 'start':
    case 'home':
      return { type: a.type, slot: integer('slot'), ...color() };
    case 'move':
      return { type: 'move', space: integer('space') };
    case 'buy':
      return { type: 'buy', tile: string('tile'), cell: integer('cell') };
    case 'endBuy':
      return { type: 'endBuy' };
    case 'shed': {
      if (!Array.isArray(a.cells) || a.cells.length > 6 || !a.cells.every(Number.isSafeInteger))
        throw new Error('棚屋参数无效。');
      return { type: 'shed', cells: [...a.cells] };
    }
    case 'score':
      return {
        type: 'score',
        slot: string('slot') as Extract<Action, { type: 'score' }>['slot'],
        ...(a.value === undefined ? {} : { value: integer('value') }),
      };
    case 'privilege':
      return {
        type: 'privilege',
        card: string('card') as Extract<Action, { type: 'privilege' }>['card'],
        ...color(),
      };
    case 'emergency':
      return {
        type: 'emergency',
        card: string('card') as Extract<Action, { type: 'emergency' }>['card'],
      };
    default:
      throw new Error('未知行动。');
  }
}

export function validateRecord(input: unknown): { record: ReplayRecord; state: GameState } {
  if (!input || typeof input !== 'object') throw new Error('回放格式无效。');
  const value = input as Record<string, unknown>;
  if (value.rules !== REPLAY_RULES) throw new Error('不支持此回放规则版本。');
  if (
    !Number.isSafeInteger(value.seed) ||
    Number(value.seed) < 0 ||
    Number(value.seed) > 0xffffffff
  )
    throw new Error('种子无效。');
  if (!Array.isArray(value.actions) || value.actions.length > MAX_REPLAY_ACTIONS)
    throw new Error('行动记录过长或无效。');
  let setup: GameSetup | undefined;
  if (value.setup !== undefined) {
    const s = value.setup as Partial<GameSetup> | null;
    if (
      !s ||
      typeof s !== 'object' ||
      ![2, 3, 4].includes(s.playerCount!) ||
      typeof s.randomStart !== 'boolean' ||
      (s.chooseStartingPositions !== undefined && typeof s.chooseStartingPositions !== 'boolean')
    )
      throw new Error('开局设置无效。');
    setup = {
      playerCount: s.playerCount!,
      randomStart: s.randomStart,
      ...(s.chooseStartingPositions === undefined
        ? {}
        : { chooseStartingPositions: s.chooseStartingPositions }),
    };
  }
  const record: ReplayRecord = {
    rules: REPLAY_RULES,
    seed: Number(value.seed),
    ...(setup ? { setup } : {}),
    actions: value.actions.map(canonicalAction),
  };
  let state = createGame(record.seed, record.setup);
  for (const action of record.actions) state = applyAction(state, action);
  assertInvariants(state);
  return { record, state };
}

export function scoresOf(state: GameState) {
  return state.players.map((player) => ({
    name: player.id === 0 ? '玩家' : player.name,
    total: calculateResult(player).total,
  }));
}

export function createTimeline(record: ReplayRecord) {
  // Sparse snapshots avoid keeping a full copy of every board and log in memory.
  const snapshots = new Map<number, GameState>();
  let state = createGame(record.seed, record.setup);
  snapshots.set(0, state);
  const activities: Activity[] = [];
  for (const [index, action] of record.actions.entries()) {
    const after = applyAction(state, action);
    activities.push(describeActivity(state, after, action));
    state = after;
    if ((index + 1) % 20 === 0) snapshots.set(index + 1, state);
  }
  snapshots.set(record.actions.length, state);
  return {
    activities,
    at(index: number) {
      const step = Math.min(record.actions.length, Math.max(0, Math.trunc(index)));
      if (snapshots.has(step)) return snapshots.get(step)!;
      const base = Math.floor(step / 20) * 20;
      let current = snapshots.get(base)!;
      for (let i = base; i < step; i++) current = applyAction(current, record.actions[i]);
      return current;
    },
  };
}
