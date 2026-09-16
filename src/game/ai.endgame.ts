import { roundsForPlayers } from './data.ts';
import { applySimulationAction, calculateResult, legalActions } from './engine.ts';
import type { Action, GameState } from './types.ts';

export interface EndgameResult {
  plan: Action[];
  value: number;
  nodes: number;
  solved: boolean;
}

// Once everyone else has returned, the remaining public game is a deterministic
// puzzle. At home the player's own score is also final, regardless of opponents.
export function solveEndgame(input: GameState, limit: number): EndgameResult | undefined {
  const seat = input.turn;
  if (
    input.round !== roundsForPlayers(input.players.length) ||
    input.phase.kind === 'finished' ||
    (input.phase.kind !== 'home' && input.players.some((p, i) => i !== seat && p.home === null))
  )
    return;
  let nodes = 0;
  const memo = new Map<string, { plan: Action[]; value: number }>();
  const visit = (s: GameState): { plan: Action[]; value: number } | undefined => {
    if (s.players[seat].home !== null)
      return { plan: [], value: calculateResult(s.players[seat]).total };
    const identity = JSON.stringify([s.players[seat], s.phase, s.market, s.barrelSupply]);
    const cached = memo.get(identity);
    if (cached) return cached;
    let best: { plan: Action[]; value: number } | undefined;
    let actions = legalActions(s);
    // Unused cards have no final value. At home selling all of them cannot hurt,
    // and canonical sale order avoids enumerating equivalent permutations.
    if (s.phase.kind === 'home') {
      const sale = actions.find((a) => a.type === 'emergency');
      if (sale) actions = [sale];
    }
    for (const action of actions) {
      if (nodes >= limit) return;
      nodes++;
      const child = visit(applySimulationAction(s, action));
      if (!child) return;
      if (!best || child.value > best.value)
        best = { plan: [action, ...child.plan], value: child.value };
    }
    if (best) memo.set(identity, best);
    return best;
  };
  const result = visit({ ...input, seed: 0, resourceDeck: [], monkDeck: [], actions: [], log: [] });
  return { plan: result?.plan ?? [], value: result?.value ?? 0, nodes, solved: !!result };
}
