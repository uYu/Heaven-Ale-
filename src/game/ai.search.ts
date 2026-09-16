import { CELLS, neighbours } from './data.ts';
import {
  advanceSimulation,
  cloneSimulationState,
  applySimulationAction,
  calculateResult,
  legalActions,
} from './engine.ts';
import { chooseAction as baseline } from './ai.baseline.ts';
import { chooseAction as normal, rankActions } from './ai.normal.ts';
import { evaluate as evaluateLegacy } from './ai.hard-v1.ts';
import { roundsForPlayers } from './data.ts';
export function evaluate(s: GameState, player: number) {
  return evaluateLegacy({ ...s, round: s.round + 6 - roundsForPlayers(s.players.length) }, player);
}
import { solveEndgame } from './ai.endgame.ts';
import type { Action, GameState, Resource, Tile } from './types.ts';

export interface SearchOptions {
  nodes?: number;
  width?: number;
  rollouts?: number;
  // Experimental: full-game seat-swapped validation did not show a strength gain.
  endgame?: boolean;
}
export interface SearchResult {
  action: Action;
  plan: Action[];
  nodes: number;
  completedDepth: number;
  rolloutScenarios: number;
  candidates: number;
  value: number;
}
interface Budget {
  used: number;
  limit: number;
}
interface Candidate {
  state: GameState;
  plan: Action[];
  values: number[];
  prior: number;
}
const key = (a: unknown) => JSON.stringify(a);
function step(s: GameState, a: Action, b: Budget): GameState | undefined {
  if (b.used >= b.limit) return;
  b.used++;
  return applySimulationAction(s, a);
}
function ended(s: GameState, original: GameState): boolean {
  return (
    s.turn !== original.turn ||
    s.round !== original.round ||
    s.phase.kind === 'finished' ||
    s.players[original.turn].home !== null
  );
}

// Keep every destination. For purchases retain both sides for every tile, distinct
// shed targets, and high-ranked alternatives; do not let near-identical cells dominate.
export function candidateActions(s: GameState): Action[] {
  const ranked = rankActions(s),
    legal = legalActions(s);
  if (s.phase.kind !== 'buy') return legal;
  const result = new Map<string, Action>();
  const add = (a: Action | undefined) => {
    if (a) result.set(key(a), a);
  };
  for (const a of legal) if (a.type !== 'buy') add(a);
  const tiles = s.market[s.phase.space].tiles;
  for (const t of tiles)
    for (const side of ['sun', 'shade']) {
      ranked
        .filter(
          (r) =>
            r.action.type === 'buy' && r.action.tile === t.id && CELLS[r.action.cell].side === side,
        )
        .slice(0, 2)
        .forEach((r) => add(r.action));
    }
  for (const c of CELLS)
    if (c.side === 'shed' && s.players[s.turn].sheds[c.id] === undefined) {
      const missing = neighbours(c.id).filter((n) => !s.players[s.turn].garden[n]);
      if (missing.length <= 2)
        for (const t of tiles)
          add(
            ranked.find(
              (r) =>
                r.action.type === 'buy' &&
                r.action.tile === t.id &&
                missing.includes(r.action.cell),
            )?.action,
          );
    }
  ranked.slice(0, 8).forEach((r) => add(r.action));
  return [...result.values()];
}

function complete(
  s: GameState,
  action: Action,
  policy: typeof normal,
  budget: Budget,
): Candidate | undefined {
  let state = step(s, action, budget);
  if (!state) return;
  const plan = [action];
  while (!ended(state, s) && plan.length < 48) {
    const a = policy(state),
      next = step(state, a, budget);
    if (!next) return;
    state = next;
    plan.push(a);
  }
  if (!ended(state, s)) return;
  return { state, plan, values: [], prior: evaluate(state, s.turn) };
}
export function sampledDecks(
  input: GameState,
  scenario: number,
): { resourceDeck: Tile[]; monkDeck: Tile[] } {
  const seen = new Set(
    [
      ...input.market.flatMap((m) => m.tiles),
      ...input.players.flatMap((p) => Object.values(p.garden)),
    ].map((t) => t.id),
  );
  let random = (0x9e3779b9 + scenario * 104729) >>> 0;
  const shuffle = (tiles: Tile[]) => {
    for (let i = tiles.length - 1; i > 0; i--) {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      const j = (random >>> 0) % (i + 1);
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  };
  const resourceDeck: Tile[] = [],
    monkDeck: Tile[] = [];
  for (let era = 0; era < 2; era++) {
    const resources: Tile[] = [],
      monks: Tile[] = [];
    for (let color = 0; color < 5; color++)
      for (let value = 1; value <= 5; value++)
        for (let copy = 0; copy < 2; copy++) {
          const id = `r${era}${color}${value}${copy}`;
          if (!seen.has(id))
            resources.push({ id, kind: 'resource', color: color as Resource, value });
        }
    for (let monk = 0; monk < 4; monk++)
      for (let copy = 0; copy < 3; copy++) {
        const id = `m${era}${monk}${copy}`;
        if (!seen.has(id)) monks.push({ id, kind: 'monk', monk });
      }
    resourceDeck.push(...shuffle(resources));
    const shuffledMonks = shuffle(monks);
    const seenEra = [...seen].filter((id) => id.startsWith(`m${era}`)).length;
    const eraSupply = era === 0 ? 12 : roundsForPlayers(input.players.length) * 4 - 12;
    monkDeck.push(...shuffledMonks.slice(0, Math.max(0, eraSupply - seenEra)));
  }
  return { resourceDeck, monkDeck };
}

function rollout(
  input: GameState,
  c: Candidate,
  scenario: number,
  budget: Budget,
): number | undefined {
  let s = cloneSimulationState({ ...c.state, ...sampledDecks(input, scenario) });
  // A complete candidate may have crossed a refill boundary with empty decks.
  if (s.round > input.round) {
    s = { ...s, market: s.market.map((m) => ({ ...m, tiles: [...m.tiles] })) };
    for (const m of s.market) {
      const t =
        m.type === 'resource'
          ? s.resourceDeck.shift()
          : m.type === 'monk'
            ? s.monkDeck.shift()
            : undefined;
      if (t) m.tiles.push(t);
    }
  }
  while (s.phase.kind !== 'finished') {
    // Include stronger and mixed opponents instead of assuming everyone is greedy.
    const policy =
      scenario % 3 === 0 ? baseline : scenario % 3 === 1 ? normal : s.turn % 2 ? normal : baseline;
    if (budget.used >= budget.limit) return;
    budget.used++;
    advanceSimulation(s, policy(s));
  }
  const scores = s.players.map((p) => calculateResult(p).total),
    own = scores[input.turn];
  const margin = own - Math.max(...scores.filter((_, i) => i !== input.turn));
  return own * 0.25 + margin * 0.25 + 12 * Math.tanh(margin / 12);
}
function rating(c: Candidate): number {
  if (!c.values.length) return c.prior;
  const mean = c.values.reduce((a, b) => a + b, 0) / c.values.length;
  const variance = c.values.reduce((v, x) => v + (x - mean) ** 2, 0) / c.values.length;
  return mean - Math.sqrt(variance) * 0.12;
}

export function searchAction(input: GameState, options: SearchOptions = {}): SearchResult {
  // Seed/history/deck ordering are not features. Every future sample uses public tiles only.
  const s: GameState = { ...input, seed: 0, resourceDeck: [], monkDeck: [], actions: [], log: [] };
  const fallback = normal(s);
  const budget: Budget = { used: 0, limit: Math.max(1, Math.floor(options.nodes ?? 36000)) };
  const endgame =
    options.endgame !== true
      ? undefined
      : solveEndgame(s, Math.min(8000, Math.floor(budget.limit / 4)));
  if (endgame?.solved)
    return {
      action: endgame.plan[0],
      plan: endgame.plan,
      nodes: endgame.nodes,
      completedDepth: endgame.plan.length,
      rolloutScenarios: 0,
      candidates: legalActions(s).length,
      value: endgame.value,
    };
  // Incomplete exact trees never compete with fully evaluated candidates.
  budget.used = endgame?.nodes ?? 0;
  const maxCandidates = Math.max(2, Math.floor(options.width ?? 28));
  const maxScenarios = Math.max(0, Math.floor(options.rollouts ?? 8));
  const ranked = rankActions(s),
    ranks = new Map(ranked.map((r) => [key(r.action), r.value]));
  const actions = candidateActions(s).sort(
    (a, b) => (ranks.get(key(b)) ?? -1000) - (ranks.get(key(a)) ?? -1000),
  );
  const unique = new Map<string, Candidate>();
  const generation: Budget = { used: 0, limit: Math.min(budget.limit - budget.used, 1600) };
  // First cover root actions, then alternative continuations. The original and normal
  // policies' first choices are always considered before heuristic pruning.
  const rootActions = [normal(s), baseline(s), ...actions].filter(
    (a, i, all) => all.findIndex((b) => key(a) === key(b)) === i,
  );
  for (const policy of [normal, baseline])
    for (const action of rootActions) {
      const c = complete(s, action, policy, generation);
      if (!c) continue;
      const identity = key([
        c.state.players,
        c.state.market,
        c.state.phase,
        c.state.turn,
        c.state.round,
        c.state.barrelSupply,
      ]);
      if (!unique.has(identity)) unique.set(identity, c);
    }
  budget.used += generation.used;
  const all = [...unique.values()];
  // Round-robin over root actions before spending slots on a second continuation.
  const selected: Candidate[] = [],
    groups = new Map<string, Candidate[]>();
  for (const c of all) {
    const k = key(c.plan[0]);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const g of groups.values()) g.sort((a, b) => b.prior - a.prior);
  for (let i = 0; i < 2; i++)
    for (const g of groups.values())
      if (g[i] && selected.length < maxCandidates) selected.push(g[i]);
  if (!selected.length)
    return {
      action: fallback,
      plan: [fallback],
      nodes: budget.used,
      completedDepth: 0,
      rolloutScenarios: 0,
      candidates: 0,
      value: evaluate(s, s.turn),
    };
  const initialCandidates = selected.length;
  let active = selected,
    completed = 0,
    placementTrials = 0;
  for (let scenario = 0; scenario < maxScenarios; scenario++) {
    const values: number[] = [];
    for (const c of active) {
      const v = rollout(input, c, scenario, budget);
      if (v === undefined) break;
      values.push(v);
    }
    if (values.length !== active.length) break;
    active.forEach((c, i) => c.values.push(values[i]));
    completed++;
    active.sort((a, b) => rating(b) - rating(a));
    // Once routes have two paired outcomes, widen the purchase placements on the
    // best routes. Re-score every new plan on the SAME completed scenarios before
    // comparing it to incumbents; an unfinished trial can never displace a plan.
    if (completed === 2 && s.phase.kind === 'move') {
      const survivors = [...active.slice(0, 4)];
      const identities = new Set(
        active.map((c) => key([c.state.players, c.state.market, c.state.phase, c.state.turn])),
      );
      for (const route of survivors) {
        const first = route.plan[0];
        if (first.type !== 'move') continue;
        const moved = step(s, first, budget);
        if (!moved || moved.phase.kind !== 'buy') continue;
        const alternatives = candidateActions(moved)
          .filter((a) => a.type === 'buy')
          .slice(0, 6);
        for (const purchase of alternatives) {
          const trial = complete(moved, purchase, normal, budget);
          if (!trial) continue;
          trial.plan.unshift(first);
          const identity = key([
            trial.state.players,
            trial.state.market,
            trial.state.phase,
            trial.state.turn,
          ]);
          if (identities.has(identity)) continue;
          identities.add(identity);
          for (let sample = 0; sample < completed; sample++) {
            const value = rollout(input, trial, sample, budget);
            if (value === undefined) break;
            trial.values.push(value);
          }
          if (trial.values.length === completed) {
            active.push(trial);
            placementTrials++;
          }
        }
      }
      active.sort((a, b) => rating(b) - rating(a));
    }
    // Two paired samples before pruning; spend further samples on the survivors.
    if (completed >= 2 && completed % 2 === 0 && active.length > 3)
      active = active.slice(0, Math.max(3, Math.ceil(active.length / 2)));
  }
  active.sort((a, b) => rating(b) - rating(a));
  const best = active[0];
  return {
    action: best.plan[0],
    plan: best.plan,
    nodes: budget.used,
    completedDepth: 1,
    rolloutScenarios: completed,
    candidates: initialCandidates + placementTrials,
    value: rating(best),
  };
}

export function chooseAction(s: GameState): Action {
  return searchAction(s).action;
}

export function publicStateKey(s: GameState): string {
  return key([s.round, s.turn, s.turnOrder, s.phase, s.players, s.market, s.barrelSupply]);
}
// A private planner per opponent. Reuse only an exact public-state match within the
// current transaction. A changed board, undo, import or new game invalidates it.
export function createHardAgent(options: SearchOptions = {}): (s: GameState) => Action {
  let pending: { expected: string; action: Action }[] = [];
  return (s) => {
    if (pending[0]?.expected === publicStateKey(s)) return pending.shift()!.action;
    pending = [];
    const result = searchAction(s, options);
    let state: GameState = { ...s, seed: 0, resourceDeck: [], monkDeck: [], actions: [], log: [] };
    for (const a of result.plan) {
      pending.push({ expected: publicStateKey(state), action: a });
      state = applySimulationAction(state, a);
      if (ended(state, s)) break;
    }
    return pending.shift()!.action;
  };
}
