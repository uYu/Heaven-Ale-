import { applyAction } from './engine.ts';
import { RESOURCE_NAMES } from './data.ts';
import type { Action, GameState } from './types.ts';

/** Evaluate a choice through the rules engine without modifying the live game. */
export function privilegePreview(
  state: GameState,
  action: Extract<Action, { type: 'privilege' }>,
): string {
  const before = state.players[state.turn];
  const after = applyAction(state, action).players[before.id];
  if (action.card === 'color' || action.card === 'lowest') {
    const color = action.color!,
      from = before.resources[color],
      to = after.resources[color];
    const overflow = after.coins - before.coins;
    const steps = to - from + overflow;
    const basis =
      action.card === 'color'
        ? `该色板块 ${steps} 块（阳面＋阴面）`
        : `已用计分圆片 ${before.scored.length} 个`;
    return `${RESOURCE_NAMES[color]}前进 ${to - from} 步：${from} → ${to}${overflow ? `；超出 20 的 ${overflow} 步换为 ${overflow} 金币` : ''}。依据：${basis}。`;
  }
  if (action.card === 'master')
    return `酿酒师前进 ${after.master - before.master} 步：${before.master} → ${after.master}${after.master - before.master < 5 ? '（最多到 20，超出部分不换金币）' : ''}。`;
  if (action.card === 'coins')
    return `立即获得 ${after.coins - before.coins} 金币：${before.coins} → ${after.coins}。`;
  if (action.card === 'barrel')
    return `终局每个酒桶额外 +1 分；按目前 ${before.barrels.length} 个酒桶预计 +${before.barrels.length} 分，之后获得的酒桶也计入。`;
  return '放弃本次特权，无收益。';
}
