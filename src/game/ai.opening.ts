import { CELLS } from './data.ts';
import { price } from './engine.ts';
import type { Action, GameState } from './types.ts';

// A short rollout can undervalue the options lost by crossing the market before
// building anything. Use a soft opportunity cost, not a maximum travel distance.
// Count only useful purchases affordable without selling privilege cards; empty
// spaces and unaffordable tiles must not make an otherwise necessary jump worse.
export function openingOpportunityPenalty(
  s: GameState,
  plan: Action[],
  ranked: { action: Action; value: number }[],
): number {
  const p = s.players[s.turn];
  const move = plan.find((a) => a.type === 'move');
  if (s.round !== 1 || Object.keys(p.garden).length || !move) return 0;
  const skipped = ranked.filter(({ action, value }) => {
    if (action.type !== 'move' || action.space >= move.space || value <= 0) return false;
    const space = s.market[action.space];
    return (
      space &&
      (space.type === 'resource' || space.type === 'monk') &&
      space.tiles.some((tile) =>
        CELLS.some(
          (cell) => cell.side !== 'shed' && price(s, tile, cell.id, action.space) <= p.coins,
        ),
      )
    );
  });
  // Limit and discount the foregone options: we cannot assume that every stop
  // could be funded or would survive opponents' turns. Scale to the tree reward.
  return (
    skipped
      .map((r) => r.value)
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((sum, value) => sum + value, 0) *
    (0.35 / 35)
  );
}
