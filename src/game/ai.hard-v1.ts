import { CELLS, SCORE_PAIRS, TRACK_END, masterLevel, neighbours } from './data.ts';
import { applyAction, calculateResult, claimable, legalActions } from './engine.ts';
import { chooseAction as baseline } from './ai.baseline.ts';
import { rankActions } from './ai.normal.ts';
import type { Action, GameState, Player, Resource, Tile } from './types.ts';

export interface SearchOptions { nodes?: number; width?: number; turns?: number; rollouts?: number }
export interface SearchResult { action: Action; nodes: number; completedDepth: number; rolloutScenarios: number; value: number }
const adjacent = CELLS.map(c => neighbours(c.id));

// A smooth progress score keeps negative resource tracks and master thresholds visible.
function production(p: Player): number {
  const r = calculateResult(p), level = masterLevel(p.master);
  return r.total + Math.min(...r.afterExchange) * 0.7 +
    p.resources.reduce((sum, v) => sum + v, 0) * 0.65 + p.master * 0.9 +
    (5 - level.rate) * 0.65;
}

export function evaluate(s: GameState, seat: number): number {
  const p = s.players[seat];
  if (s.phase.kind === 'finished') return calculateResult(p).total;
  const projected = structuredClone(p);
  // Slots never reset. Discount each unused trigger by remaining opportunities.
  const rounds = 7 - s.round;
  const reach = p.home === null && s.market.some((m, i) => i > p.position && m.disc);
  const chance = Math.min(0.85, (rounds - 1) * 0.24 + (reach ? 0.55 : 0));
  const gains = (cell: number, probability: number) => {
    const tile = p.garden[cell];
    if (!tile) return;
    if (tile.kind === 'monk') projected.master = Math.min(20, projected.master + probability);
    else if (CELLS[cell].side === 'shade') projected.coins += tile.value * probability;
    else projected.resources[tile.color] = Math.min(20, projected.resources[tile.color] + tile.value * probability);
  };
  const numbers = [1, 2, 3, 4, 5].map(n => Object.entries(p.garden).reduce((v, [id, t]) =>
    v + (t.kind === 'resource' && t.value === n ? n * (CELLS[+id].side === 'sun' ? 1 : 0.65) : 0), 0));
  const bestNumber = numbers.indexOf(Math.max(...numbers)) + 1;
  for (const [id, tile] of Object.entries(p.garden)) {
    if (tile.kind === 'resource') {
      if (!p.scored.includes(`r${tile.color}`)) gains(+id, chance);
      if (!p.scored.includes('number') && tile.value === bestNumber) gains(+id, chance * 0.75);
    } else if (!p.scored.includes(`m${tile.monk}`)) adjacent[+id].forEach(n => gains(n, chance));
  }
  // calculateResult expects discrete markers and coins.
  projected.resources = projected.resources.map(Math.floor);
  projected.master = Math.floor(projected.master);
  projected.coins = Math.floor(projected.coins);
  const liquidity = (coins: number) => Math.min(coins, 8) * 0.95 + Math.min(Math.max(0, coins - 8), 12) * 0.4 + Math.max(0, coins - 20) * 0.08;
  let value = production(p) * 0.2 + production(projected) * 0.8;
  value += liquidity(p.coins) * Math.min(1, rounds * 0.4);
  value += (projected.coins - p.coins) * (p.coins < 10 ? 0.65 : 0.3);
  // Empty cells near completion are useful only while there is time to fill them.
  for (const c of CELLS) if (c.side === 'shed' && p.sheds[c.id] === undefined) {
    const filled = adjacent[c.id].filter(n => p.garden[n]).length;
    value += [0, 0.05, 0.2, 0.65, 1.65, 3.4, 0][filled] * Math.min(1, rounds * 0.4);
  }
  const pairsLeft = SCORE_PAIRS.filter((_, i) => p.privileges[i] === undefined).length;
  const cardValues = p.cards.map(card => ({ coins: 5, master: 5, lowest: 4, color: 3, barrel: 2 })[card]).sort((a, b) => b - a);
  value += cardValues.slice(0, pairsLeft).reduce((a, b) => a + b, 0) * Math.min(0.65, rounds * 0.16);
  value += SCORE_PAIRS.filter(pair => pair.filter(slot => p.scored.includes(slot)).length === 1).length * (p.cards.length ? 0.8 : 0);
  if (p.home === null && s.market.some((m, i) => m.type === 'barrel' && i > p.position)) {
    value += claimable(s, p).reduce((v, i) => v + (s.barrelSupply[i] === 2 ? 3 : 1.5), 0);
  }
  // Preserve remaining road opportunities; only a small tie-break, not a turn reward.
  if (p.home === null) value += (TRACK_END - p.position) * 0.035;
  return value;
}

interface Node { state: GameState; plan: Action[]; value: number; priority?: number }
interface Budget { used: number; limit: number }
function step(s: GameState, a: Action, budget: Budget): GameState | undefined {
  if (budget.used >= budget.limit) return;
  budget.used++;
  return applyAction({ ...s, actions: [], log: [] }, a);
}

function candidates(s: GameState): Action[] {
  const ranked = rankActions(s);
  const limit = s.phase.kind === 'move' ? 10 : s.phase.kind === 'buy' ? 6 : 16;
  const actions = ranked.slice(0, limit).map(r => r.action);
  const add = (a: Action | undefined) => { if (a && !actions.some(b => JSON.stringify(a) === JSON.stringify(b))) actions.push(a); };
  const legal = legalActions(s);
  // Keep cash-out, scoring, and both garden sides even when the heuristic prefers building.
  for (const a of legal) if (a.type === 'endBuy' || a.type === 'home' || a.type === 'score' ||
    (a.type === 'move' && ['score', 'barrel'].includes(s.market[a.space]?.type))) add(a);
  if (s.phase.kind === 'buy') {
    for (const side of ['sun', 'shade']) add(ranked.find(r => r.action.type === 'buy' && CELLS[r.action.cell].side === side)?.action);
    for (const c of CELLS) if (c.side === 'shed' && s.players[s.turn].sheds[c.id] === undefined) {
      const missing = adjacent[c.id].filter(n => !s.players[s.turn].garden[n]);
      if (missing.length <= 2) add(ranked.find(r => r.action.type === 'buy' && missing.includes(r.action.cell))?.action);
    }
  }
  return actions;
}

function completeTurn(start: GameState, seat: number, width: number, budget: Budget): Node[] {
  const round = start.round;
  let frontier: Node[] = [{ state: start, plan: [], value: evaluate(start, seat) }];
  let completed: Node[] = [];
  // At most 30 placements, 7 sheds, 5 sales and phase transitions on this board.
  for (let depth = 0; depth < 48 && frontier.length && budget.used < budget.limit; depth++) {
    const next: Node[] = [];
    for (const node of frontier) for (const action of candidates(node.state)) {
      const state = step(node.state, action, budget);
      if (!state) break;
      const child = { state, plan: [...node.plan, action], value: evaluate(state, seat) };
      if (state.turn !== seat || state.round !== round || state.phase.kind === 'finished' || state.players[seat].home !== null) completed.push(child);
      else {
        // Moving only changes position; include the pending purchase/scoring benefit
        // so distant scoring spaces survive until their effect is actually resolved.
        const pending = action.type === 'move' ? Math.max(0, rankActions(state)[0].value) : 0;
        next.push({ ...child, priority: child.value + pending });
      }
    }
    completed.sort((a, b) => b.value - a.value);
    completed = completed.slice(0, width);
    next.sort((a, b) => (b.priority ?? b.value) - (a.priority ?? a.value));
    const seen = new Set<string>();
    frontier = next.filter(n => {
      const key = JSON.stringify([n.state.players[seat], n.state.phase, n.state.market]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, width);
  }
  return completed;
}

function opponents(s: GameState, seat: number, round: number, budget: Budget): GameState | undefined {
  while (s.turn !== seat && s.round === round && s.phase.kind !== 'finished') {
    const next = step(s, baseline(s), budget);
    if (!next) return;
    s = next;
  }
  return s;
}

// Reconstruct only the publicly unknown tiles. All tiles persist in market/gardens.
// I and II stay in separate eras; neither the real deck nor the game seed is consulted.
function sampledDecks(input: GameState, scenario: number): { resourceDeck: Tile[]; monkDeck: Tile[] } {
  const seen = new Set([...input.market.flatMap(m => m.tiles), ...input.players.flatMap(p => Object.values(p.garden))].map(t => t.id));
  let random = (0x9e3779b9 + scenario * 104729) >>> 0;
  const shuffle = (tiles: Tile[]) => {
    for (let i = tiles.length - 1; i > 0; i--) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      const j = (random >>> 0) % (i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
  };
  const resourceDeck: Tile[] = [], monkDeck: Tile[] = [];
  for (let era = 0; era < 2; era++) {
    const resources: Tile[] = [], monks: Tile[] = [];
    for (let color = 0; color < 5; color++) for (let value = 1; value <= 5; value++) for (let copy = 0; copy < 2; copy++) {
      const id = `r${era}${color}${value}${copy}`;
      if (!seen.has(id)) resources.push({ id, kind: 'resource', color: color as Resource, value });
    }
    for (let monk = 0; monk < 4; monk++) for (let copy = 0; copy < 3; copy++) {
      const id = `m${era}${monk}${copy}`;
      if (!seen.has(id)) monks.push({ id, kind: 'monk', monk });
    }
    resourceDeck.push(...shuffle(resources)); monkDeck.push(...shuffle(monks));
  }
  return { resourceDeck, monkDeck };
}

function rollout(input: GameState, node: Node, seat: number, scenario: number, budget: Budget): number | undefined {
  let s = structuredClone({ ...node.state, ...sampledDecks(input, scenario) });
  // The bounded tree deliberately stopped at an empty-deck refill boundary.
  if (s.round > input.round) for (const space of s.market) {
    const tile = space.type === 'resource' ? s.resourceDeck.shift() : space.type === 'monk' ? s.monkDeck.shift() : undefined;
    if (tile) space.tiles.push(tile);
  }
  while (s.phase.kind !== 'finished') {
    const next = step(s, baseline(s), budget);
    if (!next) return;
    s = next;
  }
  const scores = s.players.map(p => calculateResult(p).total);
  const bestOther = Math.max(...scores.filter((_, i) => i !== seat));
  return scores[seat] - bestOther * 0.65;
}

export function searchAction(input: GameState, options: SearchOptions = {}): SearchResult {
  const seat = input.turn, round = input.round;
  // Search is current-round only. Never expose hidden order, seed, IDs in history to policies.
  const s: GameState = { ...input, seed: 0, resourceDeck: [], monkDeck: [], actions: [], log: [] };
  const fallback = rankActions(s)[0].action;
  const width = Math.max(1, Math.floor(options.width ?? 5));
  const budget = { used: 0, limit: Math.max(1, Math.floor(options.nodes ?? 6500)) };
  const turns = Math.max(1, Math.floor(options.turns ?? 2));
  const treeLimit = Math.min(budget.limit, 1800);
  const firstBudget = { used: 0, limit: Math.min(treeLimit, Math.max(1, Math.floor(treeLimit * 0.45))) };
  let beam = completeTurn(s, seat, width, firstBudget);
  budget.used = firstBudget.used;
  if (!beam.length) return { action: fallback, nodes: budget.used, completedDepth: 0, rolloutScenarios: 0, value: evaluate(s, seat) };
  let best = beam[0], completedDepth = 1;
  const roots = [...beam];
  // Always retain the original policy's complete turn as a control candidate.
  let control = s; const plan: Action[] = [];
  while (control.turn === seat && control.round === round && control.phase.kind !== 'finished' && control.players[seat].home === null && plan.length < 48) {
    const action = baseline(control), next = step(control, action, budget);
    if (!next) break;
    plan.push(action); control = next;
  }
  if (plan.length && (control.turn !== seat || control.round !== round || control.phase.kind === 'finished' || control.players[seat].home !== null)) roots.push({ state: control, plan, value: evaluate(control, seat) });
  for (let depth = 1; depth < turns && budget.used < treeLimit; depth++) {
    const next: Node[] = [];
    let complete = true;
    for (let i = 0; i < beam.length; i++) {
      const node = beam[i];
      if (node.state.round !== round || node.state.phase.kind === 'finished' || node.state.players[seat].home !== null) { next.push(node); continue; }
      // Each root candidate receives an equal remaining allowance.
      const local: Budget = { used: 0, limit: Math.floor((treeLimit - budget.used) / (beam.length - i)) };
      const state = opponents(node.state, seat, round, local);
      if (!state) { budget.used += local.used; complete = false; break; }
      if (state.round !== round || state.phase.kind === 'finished') next.push({ ...node, state, value: evaluate(state, seat) });
      else {
        const children = completeTurn(state, seat, width, local);
        if (!children.length) complete = false;
        for (const child of children) next.push({ ...child, plan: [...node.plan, ...child.plan] });
      }
      budget.used += local.used;
    }
    // Never compare a partially searched root against fully searched alternatives.
    if (!complete || !next.length) break;
    next.sort((a, b) => b.value - a.value);
    beam = next.slice(0, width); best = beam[0]; completedDepth = depth + 1;
  }
  const unique = new Map<string, Node>();
  // Different placements after the same move are distinct candidates.
  for (const node of [...roots, best]) unique.set(JSON.stringify(node.plan), node);
  const finalists = [...unique.values()];
  let totals = finalists.map(() => 0), completedScenarios = 0;
  for (let scenario = 0; scenario < (options.rollouts ?? 2); scenario++) {
    const values: number[] = [];
    for (const node of finalists) {
      const value = rollout(input, node, seat, scenario, budget);
      if (value === undefined) break;
      values.push(value);
    }
    // A scenario counts only if every candidate was simulated to the end.
    if (values.length !== finalists.length) break;
    totals = totals.map((v, i) => v + values[i]); completedScenarios++;
  }
  if (completedScenarios) {
    const index = totals.indexOf(Math.max(...totals)); best = finalists[index];
  }
  return { action: best.plan[0], nodes: budget.used, completedDepth, rolloutScenarios: completedScenarios, value: completedScenarios ? Math.max(...totals) / completedScenarios : best.value };
}

export function chooseAction(s: GameState): Action { return searchAction(s).action; }
