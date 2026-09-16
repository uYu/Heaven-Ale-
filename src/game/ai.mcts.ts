import { chooseAction as normal, rankActions } from './ai.normal.ts';
import { chooseAction as baseline } from './ai.baseline.ts';
import { evaluate } from './ai.search.ts';
import { candidateActions, publicStateKey, sampledDecks } from './ai.search.ts';
import {
  advanceSimulation,
  applySimulationAction,
  calculateResult,
  cloneSimulationState,
} from './engine.ts';
import type { Action, GameState } from './types.ts';

export interface TreeOptions {
  nodes?: number;
  width?: number;
  exploration?: number;
}
export interface TreeResult {
  action: Action;
  plan: Action[];
  nodes: number;
  simulations: number;
  depth: number;
  candidates: number;
  value: number;
}
interface Budget {
  used: number;
  limit: number;
}
interface Edge {
  plan: Action[];
  prior: number;
  visits: number;
  total: number;
}
interface Node {
  edges: Edge[];
  visits: number;
}
const key = (a: unknown) => JSON.stringify(a);
const finished = (s: GameState) => s.phase.kind === 'finished';
const transactionEnded = (s: GameState, start: GameState) =>
  s.turn !== start.turn ||
  s.round !== start.round ||
  s.phase.kind === 'finished' ||
  s.players[start.turn].home !== null;
function step(s: GameState, a: Action, budget: Budget): boolean {
  if (budget.used >= budget.limit) return false;
  budget.used++;
  advanceSimulation(s, a);
  return true;
}

// Search edges are complete transactions, not individual UI clicks. This lets a
// modest simulation budget reach later purchases/scoring after opponents respond.
function proposals(input: GameState, budget: Budget, width: number): Edge[] {
  const s = { ...input, resourceDeck: [], monkDeck: [], actions: [], log: [], seed: 0 };
  const ranked = rankActions(s);
  const ranks = new Map(ranked.map((r) => [key(r.action), r.value]));
  const actions = candidateActions(s).sort(
    (a, b) => (ranks.get(key(b)) ?? -1000) - (ranks.get(key(a)) ?? -1000),
  );
  const roots = [normal(s), baseline(s), ...actions].filter(
    (a, i, all) => all.findIndex((b) => key(a) === key(b)) === i,
  );
  const plans: { edge: Edge; identity: string }[] = [];
  const seen = new Set<string>();
  const finish = (prefix: Action[], policy: typeof normal) => {
    const state = cloneSimulationState(s);
    const plan: Action[] = [];
    for (const action of prefix) {
      if (!step(state, action, budget)) return;
      plan.push(action);
    }
    while (!transactionEnded(state, s) && plan.length < 48) {
      const action = policy(state);
      if (!step(state, action, budget)) return;
      plan.push(action);
    }
    if (!transactionEnded(state, s)) return;
    const identity = publicStateKey(state);
    if (seen.has(identity)) return;
    seen.add(identity);
    plans.push({
      identity,
      edge: {
        plan,
        prior: evaluate(state, s.turn),
        visits: 0,
        total: 0,
      },
    });
  };
  // Cover routes before adding multiple continuations of the same route.
  for (const action of roots) finish([action], normal);
  for (const action of roots.slice(0, 8)) finish([action], baseline);
  if (s.phase.kind === 'move') {
    for (const move of roots.filter((a) => a.type === 'move').slice(0, 6)) {
      const moved = cloneSimulationState(s);
      if (!step(moved, move, budget)) break;
      if (moved.phase.kind !== 'buy') continue;
      const buys = rankActions(moved).filter((r) => r.action.type === 'buy');
      // Refine promising routes with additional placements from the public
      // candidate set, which includes sun/shade and nearby shed gaps.
      const alternatives = candidateActions(moved).filter((a) => a.type === 'buy');
      const scores = new Map(buys.map((r) => [key(r.action), r.value]));
      alternatives.sort((a, b) => (scores.get(key(b)) ?? 0) - (scores.get(key(a)) ?? 0));
      for (const purchase of alternatives.slice(0, 4)) finish([move, purchase], normal);
    }
  }
  plans.sort((a, b) => b.edge.prior - a.edge.prior);
  const selected: Edge[] = [];
  const rootKeys = new Set<string>();
  for (const { edge } of plans) {
    const root = key(edge.plan[0]);
    if (!rootKeys.has(root) && selected.length < width) {
      selected.push(edge);
      rootKeys.add(root);
    }
  }
  for (const { edge } of plans)
    if (selected.length < width && !selected.includes(edge)) selected.push(edge);
  const max = Math.max(...selected.map((e) => e.prior));
  const sum = selected.reduce((v, e) => v + Math.exp((e.prior - max) / 8), 0);
  for (const edge of selected) edge.prior = Math.exp((edge.prior - max) / 8) / sum;
  return selected;
}

function outcome(s: GameState, seat: number): number {
  const scores = s.players.map((p) => calculateResult(p).total);
  const own = scores[seat];
  const margin = own - Math.max(...scores.filter((_, i) => i !== seat));
  return 0.5 + 0.5 * Math.tanh((margin + own * 0.3) / 35);
}

export function searchTree(input: GameState, options: TreeOptions = {}): TreeResult {
  const root = { ...input, seed: 0, resourceDeck: [], monkDeck: [], actions: [], log: [] };
  const seat = root.turn;
  const budget: Budget = { used: 0, limit: Math.max(1, Math.floor(options.nodes ?? 36000)) };
  const width = Math.max(2, Math.floor(options.width ?? 36));
  const exploration = options.exploration ?? 0.45;
  const tree = new Map<string, Node>();
  // Candidate generation is charged to the same budget as all tree/rollout moves.
  const generation = { used: 0, limit: Math.min(1200, budget.limit) };
  const edges = proposals(root, generation, width);
  budget.used += generation.used;
  const initial: Node = { edges, visits: 0 };
  tree.set(publicStateKey(root), initial);
  const fallback = normal(root);
  let simulations = 0,
    depth = 0;
  while (edges.length && budget.used < budget.limit) {
    const path: { node: Node; edge: Edge }[] = [];
    let state = cloneSimulationState(root);
    let node = initial;
    let sample = 0;
    let complete = true;
    while (!finished(state)) {
      const unvisited = node.edges.find((e) => !e.visits);
      const selected =
        unvisited ??
        node.edges.reduce((best, edge) => {
          const ucb = (e: Edge) =>
            e.total / e.visits +
            exploration * Math.sqrt(Math.log(node.visits + 1) / e.visits) +
            (0.2 * e.prior) / (e.visits + 1);
          return ucb(edge) > ucb(best) ? edge : best;
        });
      if (!path.length) {
        // Each root edge sees the same deck/opponent scenarios on its first,
        // second, ... visits. Real seed and hidden deck order are never used.
        sample = selected.visits % 4;
        Object.assign(state, sampledDecks(root, sample));
      }
      path.push({ node, edge: selected });
      for (const action of selected.plan)
        if (!step(state, action, budget)) {
          complete = false;
          break;
        }
      if (!complete) break;
      while (!finished(state) && state.turn !== seat) {
        const policy = sample % 2 ? normal : baseline;
        if (!step(state, policy(state), budget)) {
          complete = false;
          break;
        }
      }
      if (!complete || finished(state) || !selected.visits) break;
      const identity = publicStateKey(state);
      const known = tree.get(identity);
      if (known) node = known;
      else {
        const local = { used: 0, limit: Math.min(400, budget.limit - budget.used) };
        const alternatives = proposals(state, local, 12);
        budget.used += local.used;
        if (!alternatives.length) break;
        node = { edges: alternatives, visits: 0 };
        tree.set(identity, node);
      }
    }
    while (complete && !finished(state)) {
      const policy = state.turn === seat || sample % 2 ? normal : baseline;
      if (!step(state, policy(state), budget)) complete = false;
    }
    if (!complete) break;
    const value = outcome(state, seat);
    for (const { node: visited, edge } of path) {
      visited.visits++;
      edge.visits++;
      edge.total += value;
    }
    simulations++;
    depth = Math.max(depth, path.length);
  }
  // Only completed simulations affect selection. Use the most visited branch,
  // breaking ties by mean reward, rather than a single lucky untested rollout.
  const best = [...edges].sort(
    (a, b) =>
      b.visits - a.visits ||
      (b.visits ? b.total / b.visits : b.prior) - (a.visits ? a.total / a.visits : a.prior),
  )[0];
  const plan = best?.plan ?? [fallback];
  return {
    action: plan[0],
    plan,
    nodes: budget.used,
    simulations,
    depth,
    candidates: edges.length,
    value: best?.visits ? best.total / best.visits : 0,
  };
}

export function createTreeAgent(options: TreeOptions = {}): (s: GameState) => Action {
  let pending: { expected: string; action: Action }[] = [];
  return (s) => {
    if (pending[0]?.expected === publicStateKey(s)) return pending.shift()!.action;
    pending = [];
    const result = searchTree(s, options);
    let state: GameState = { ...s, seed: 0, resourceDeck: [], monkDeck: [], actions: [], log: [] };
    for (const action of result.plan) {
      pending.push({ expected: publicStateKey(state), action });
      state = applySimulationAction(state, action);
      if (transactionEnded(state, s)) break;
    }
    return pending.shift()!.action;
  };
}
