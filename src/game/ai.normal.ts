import { CELLS, SCORE_PAIRS, TRACK_END, masterLevel, neighbours } from './data.ts';
import {
  activate,
  advanceResource,
  calculateResult,
  claimable,
  legalActions,
  price,
  scoreOptions,
  shedOptions,
  shedTier,
} from './engine.ts';
import type { Action, GameState, Player, Tile } from './types.ts';

function resourceWeight(p: Player, color: number) {
  return (
    0.72 +
    Math.max(0, 5 - p.resources[color]) * 0.085 +
    (p.resources[color] === Math.min(...p.resources) ? 0.2 : 0)
  );
}
export function delta(before: Player, after: Player, round: number) {
  const cash = before.coins < 8 ? 0.8 : before.coins < 16 ? 0.5 : 0.24;
  return (
    (after.coins - before.coins) * cash +
    (after.master - before.master) * 0.9 +
    (masterLevel(after.master).multiplier - masterLevel(before.master).multiplier) *
      Math.max(1, Math.min(...before.resources)) *
      0.6 +
    (masterLevel(before.master).rate - masterLevel(after.master).rate) * 0.8 +
    after.resources.reduce(
      (n, v, c) => n + (v - before.resources[c]) * resourceWeight(before, c),
      0,
    ) +
    (round >= 5 ? (calculateResult(after).total - calculateResult(before).total) * 0.9 : 0)
  );
}
function purchaseValue(s: GameState, p: Player, space: number, tile: Tile, cell: number) {
  const c = CELLS[cell],
    cost = price(s, tile, cell, space),
    shadow = c.side === 'shade',
    round = s.round;
  const around = neighbours(cell).filter((n) => p.garden[n]),
    monks = around.filter((n) => p.garden[n].kind === 'monk');
  let value = 0;
  if (tile.kind === 'resource') {
    const remainingTriggers =
      (!p.scored.includes(`r${tile.color}`) ? 1 : 0) +
      (!p.scored.includes('number') ? 0.55 : 0) +
      monks.filter((n) => {
        const t = p.garden[n];
        return t.kind === 'monk' && !p.scored.includes(`m${t.monk}`);
      }).length *
        0.75;
    const incomeTiles = Object.entries(p.garden).filter(
      ([id, t]) => CELLS[Number(id)].side === 'shade' && t.kind === 'resource',
    ).length;
    const yieldWeight = shadow
      ? p.coins < 12 || incomeTiles < 3
        ? 1.1
        : 0.42
      : resourceWeight(p, tile.color);
    value = tile.value * yieldWeight * (0.5 + remainingTriggers * 0.72) + 1.2;
    if (round === 6 && remainingTriggers === 0) value -= 4;
  } else {
    value =
      1.8 +
      around.reduce((n, id) => {
        const t = p.garden[id];
        return n + (t.kind === 'resource' ? t.value * 0.65 : 1.5);
      }, 0);
    if (p.scored.includes(`m${tile.monk}`)) value *= 0.45;
    value += monks.length * 1.1;
  }
  for (const n of neighbours(cell))
    if (CELLS[n]?.side === 'shed' && p.sheds[n] === undefined) {
      const filled = neighbours(n).filter((id) => p.garden[id]);
      value += 0.2 + filled.length * 0.28;
      if (filled.length === 5) {
        const sum = filled.reduce(
          (v, id) => {
            const t = p.garden[id];
            return v + (t.kind === 'resource' ? t.value : 0);
          },
          tile.kind === 'resource' ? tile.value : 0,
        );
        const tier = shedTier(sum);
        const after = structuredClone(p);
        after.master = Math.min(20, after.master + [6, 3, 1, 1, 0][tier]);
        after.garden[cell] = tile;
        value +=
          delta(p, after, round) +
          Math.max(
            ...shedOptions(n, tier).map((cells) => {
              const reward = structuredClone(after);
              cells.forEach((id) => activate(reward, id));
              return delta(after, reward, round);
            }),
          );
      }
    }
  const reserve = round <= 4 ? 4 : 1;
  value -= cost * (p.coins - cost < reserve ? 1.1 : p.coins < 15 ? 0.65 : 0.38);
  if (cost > p.coins) value -= Math.ceil((cost - p.coins) / 3) * 3.5;
  return value;
}
function scoreValue(s: GameState, p: Player, option: { slot: string; value?: number }) {
  const after = structuredClone(p);
  for (const [id, t] of Object.entries(p.garden)) {
    const cell = Number(id);
    if (option.slot === 'number' && t.kind === 'resource' && t.value === option.value)
      activate(after, cell);
    if (option.slot[0] === 'r' && t.kind === 'resource' && t.color === Number(option.slot[1]))
      activate(after, cell);
    if (option.slot[0] === 'm' && t.kind === 'monk' && t.monk === Number(option.slot[1]))
      neighbours(cell).forEach((n) => activate(after, n));
  }
  const pair = SCORE_PAIRS.find((v) => v.includes(option.slot as never));
  const pairValue = pair?.some((slot) => p.scored.includes(slot)) && p.cards.length ? 4 : 0;
  const opportunityCost = (7 - s.round) * 0.8;
  return delta(p, after, s.round) + pairValue - opportunityCost;
}
export function rankActions(s: GameState): { action: Action; value: number }[] {
  const p = s.players[s.turn],
    actions = legalActions(s),
    regular = actions.filter((a) => a.type !== 'emergency');
  if (!actions.length) throw new Error('AI 没有合法行动。');
  const emergency = actions
    .filter((a) => a.type === 'emergency')
    .sort(
      (a, b) =>
        ['barrel', 'color', 'lowest', 'master', 'coins'].indexOf(a.card) -
        ['barrel', 'color', 'lowest', 'master', 'coins'].indexOf(b.card),
    );
  if (s.round === 6 && s.phase.kind === 'home' && emergency.length)
    return [{ action: emergency[0], value: 0 }];
  if (
    s.phase.kind === 'buy' &&
    !regular.some((a) => a.type === 'buy') &&
    !regular.some((a) => a.type === 'endBuy')
  )
    return [{ action: emergency[0], value: 0 }];
  const scored = actions.map((action, order) => {
    let value = -1000;
    if (action.type === 'emergency') {
      const retained = { coins: 4.8, master: 4.5, lowest: 3.5, color: 2.5, barrel: 1.8 }[
        action.card
      ];
      value = 3 * (p.coins < 5 ? 1.1 : 0.3) - retained;
    }
    if (action.type === 'move') {
      if (action.space === TRACK_END) value = 0.3;
      else {
        const space = s.market[action.space];
        if (space.type === 'resource' || space.type === 'monk') {
          value = -100;
          for (const tile of space.tiles)
            for (const c of CELLS)
              if (
                c.side !== 'shed' &&
                !p.garden[c.id] &&
                price(s, tile, c.id, action.space) <= p.coins + 3 * p.cards.length
              )
                value = Math.max(value, purchaseValue(s, p, action.space, tile, c.id));
        } else if (space.type === 'score')
          value = Math.max(...scoreOptions(s, action.space).map((o) => scoreValue(s, p, o)));
        else
          value = claimable(s).reduce((sum, i) => sum + (s.barrelSupply[i] === 2 ? 4.5 : 2.5), 0);
        value -= (action.space - p.position - 1) * (s.round < 5 ? 0.12 : 0.08);
      }
    }
    if (action.type === 'buy' && s.phase.kind === 'buy')
      value = purchaseValue(
        s,
        p,
        s.phase.space,
        s.market[s.phase.space].tiles.find((t) => t.id === action.tile)!,
        action.cell,
      );
    if (action.type === 'endBuy') value = 0;
    if (action.type === 'score') value = scoreValue(s, p, action);
    if (action.type === 'shed') {
      const after = structuredClone(p);
      action.cells.forEach((c) => activate(after, c));
      value = delta(p, after, s.round);
    }
    if (action.type === 'privilege') {
      const after = structuredClone(p);
      if (action.card === 'coins') after.coins += 12;
      if (action.card === 'master') after.master = Math.min(20, after.master + 5);
      if (action.card === 'color')
        advanceResource(
          after,
          action.color!,
          Object.values(p.garden).filter((t) => t.kind === 'resource' && t.color === action.color)
            .length,
        );
      if (action.card === 'lowest') advanceResource(after, action.color!, p.scored.length);
      value = delta(p, after, s.round);
      if (action.card === 'barrel') value = p.barrels.length + (6 - s.round) * 0.5;
      if (action.card === 'skip') value = -2;
    }
    if (action.type === 'home') {
      const after = structuredClone(p);
      if (action.slot === 1) after.master = Math.min(20, after.master + 1);
      if (action.slot === 2) advanceResource(after, action.color!, 2);
      if (action.slot === 3) after.coins += 2;
      value = action.slot === 0 ? (s.round === 6 ? 1.4 : 2.4) : delta(p, after, s.round);
    }
    return { action, value: value + Math.sin((s.seed % 997) + order * 13 + p.id * 7) * 0.035 };
  });
  scored.sort((a, b) => b.value - a.value);
  return scored;
}

export function chooseAction(s: GameState): Action {
  return rankActions(s)[0].action;
}
