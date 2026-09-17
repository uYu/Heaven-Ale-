import { CARD_INFO, CELLS, HOME_NAMES, RESOURCE_NAMES, TRACK_END, slotName } from './data.ts';
import { tileName } from './engine.ts';
import type { Action, GameState } from './types.ts';

export interface Activity {
  id: number;
  player: number;
  round: number;
  text: string;
  changes: string[];
}

// Use the actor before the action: scoring and returning home can change the turn.
export function describeActivity(before: GameState, after: GameState, action: Action): Activity {
  const player = before.players[before.turn];
  const next = after.players[player.id];
  let text = '';
  switch (action.type) {
    case 'start':
      text = `选择起始位置：${action.slot === 2 ? `${RESOURCE_NAMES[action.color!]} +2` : HOME_NAMES[action.slot]}。`;
      break;
    case 'move': {
      const destination = before.market[action.space];
      const from = player.position < 0 ? '起点' : `第 ${player.position + 1} 格`;
      text =
        action.space === TRACK_END
          ? `从${from}返回修道院，准备选择起点奖励。`
          : `从${from}前进到第 ${action.space + 1} 格（${destination.type === 'score' ? `${destination.scoring} 类计分` : destination.type === 'barrel' ? '领取酒桶' : destination.type === 'monk' ? '购买修士' : '购买资源'}）。`;
      break;
    }
    case 'buy': {
      const tile = next.garden[action.cell];
      text = `购买${tileName(tile)}，放入花园第 ${action.cell + 1} 格（${CELLS[action.cell].side === 'sun' ? '阳面' : '阴面'}）。`;
      break;
    }
    case 'endBuy':
      text = '结束购买，完成本回合。';
      break;
    case 'score':
      text = `使用「${slotName(action.slot, action.value)}」计分，激活花园。`;
      break;
    case 'shed':
      text = `领取棚屋奖励${action.cells.length ? `，激活花园第 ${action.cells.map((c) => c + 1).join('、')} 格` : ''}。`;
      break;
    case 'privilege':
      text =
        action.card === 'skip'
          ? '放弃本次特权奖励。'
          : `使用「${CARD_INFO[action.card].name}」特权。`;
      break;
    case 'emergency':
      text = `出售「${CARD_INFO[action.card].name}」换取金币。`;
      break;
    case 'home':
      text = `选择起点奖励：${action.slot === 2 ? `${RESOURCE_NAMES[action.color!]} +2` : HOME_NAMES[action.slot]}，结束本轮。`;
      break;
  }
  const changes: string[] = [];
  const change = (name: string, old: number, value: number) => {
    if (old !== value)
      changes.push(`${name} ${value > old ? '+' : ''}${value - old}（${old} → ${value}）`);
  };
  change('金币', player.coins, next.coins);
  change('酿酒师', player.master, next.master);
  player.resources.forEach((value, i) => change(RESOURCE_NAMES[i], value, next.resources[i]));
  change('酒桶', player.barrels.length, next.barrels.length);
  return { id: after.revision, player: player.id, round: before.round, text, changes };
}
