import type { Cell, MarketSpace, Privilege, Slot } from './types.ts';
export const RESOURCE_NAMES = ['木材', '酵母', '啤酒花', '水', '大麦'];
export const RESOURCE_COLORS = ['#926346', '#9b929f', '#6a8750', '#588aa0', '#c19945'];
export const MONK_NAMES = ['园丁修士', '酒窖修士', '学者修士', '管家修士'];
export const PLAYER_COLORS = ['#36765d', '#bc8652', '#7286b0', '#ac7281'];
export const PRIVILEGES: Privilege[] = ['color', 'lowest', 'barrel', 'coins', 'master'];
export const CARD_INFO: Record<Privilege, { name: string; text: string }> = {
  color: { name: '丰收祝福', text: '选择一种资源，按花园中该色板块数量推进对应资源。' },
  lowest: { name: '扶助弱者', text: '选择最落后的资源，推进等同于已使用计分圆片数量的步数。' },
  barrel: { name: '酒桶嘉奖', text: '终局时，每个已获得的酒桶额外 +1 分。' },
  coins: { name: '修道院资助', text: '立即获得 12 枚金币。' },
  master: { name: '酿酒传承', text: '酿酒师立即前进 5 步。' },
};
export const SCORE_PAIRS: Slot[][] = [
  ['number', 'r0'],
  ['r1', 'r2'],
  ['r3', 'r4'],
  ['m0', 'm1'],
  ['m2', 'm3'],
];
export const HOME_NAMES = ['下轮先手', '酿酒师 +1', '任一资源 +2', '金币 +2'];
export const BARREL_GOALS = [
  '酿酒师到达 1',
  '五种资源均到达 1',
  '六块肥力 1 的资源',
  '六块肥力 5 的资源',
  '四种修士全部计分',
  '五种资源全部计分',
  '三个同类棚屋',
  '四种不同棚屋',
  '任一资源到达 20',
  '使用三张特权卡',
  '填满十五格阳面',
  '填满十五格阴面',
];
// Original board: 2 / 3 / 6 / 7 / 6 / 7 / 6 cells, seven fixed sheds.
// Doubled horizontal coordinates make all six neighbours integral.
const rows = [
  [-1, 1],
  [-2, 0, 2],
  [-5, -3, -1, 1, 3, 5],
  [-6, -4, -2, 0, 2, 4, 6],
  [-5, -3, -1, 1, 3, 5],
  [-6, -4, -2, 0, 2, 4, 6],
  [-5, -3, -1, 1, 3, 5],
];
export const CELLS: Cell[] = rows
  .flatMap((xs, y) => xs.map((x) => ({ x, y })))
  .map((c, id) => ({
    ...c,
    id,
    side:
      (c.y === 1 && c.x === 0) || ([3, 5].includes(c.y) && [-4, 0, 4].includes(c.x))
        ? 'shed'
        : c.x < 0
          ? 'sun'
          : 'shade',
  }));
export const DIRECTIONS = [
  [2, 0],
  [1, 1],
  [-1, 1],
  [-2, 0],
  [-1, -1],
  [1, -1],
];
const ADJACENCY = CELLS.map((c) =>
  DIRECTIONS.map(([dx, dy]) => CELLS.find((n) => n.x === c.x + dx && n.y === c.y + dy)?.id ?? -1),
);
export function neighbours(cell: number): number[] {
  return [...ADJACENCY[cell]];
}
const track = [
  'R',
  'R',
  'M4',
  'SA',
  'R',
  'R',
  'SB',
  'R',
  'R',
  'M3',
  'R',
  'SC',
  'R',
  'K',
  'R',
  'SABC',
  'R',
  'M2',
  'R',
  'SABC',
  'R',
  'R',
  'R',
  'SABC',
  'M1',
  'K',
  'R',
];
export const TRACK_END = track.length;
export function makeMarket(): MarketSpace[] {
  return track.map((v) => ({
    type: v === 'R' ? 'resource' : v[0] === 'M' ? 'monk' : v === 'K' ? 'barrel' : 'score',
    cost: v[0] === 'M' ? Number(v[1]) : undefined,
    scoring: v[0] === 'S' ? (v.slice(1) as 'A' | 'B' | 'C' | 'ABC') : undefined,
    tiles: [],
    disc: false,
  }));
}
export function masterLevel(pos: number): { rate: number; multiplier: number } {
  if (pos >= 20) return { rate: 1, multiplier: 6 };
  if (pos >= 18) return { rate: 2, multiplier: 6 };
  if (pos >= 15) return { rate: 2, multiplier: 5 };
  if (pos >= 12) return { rate: 2, multiplier: 4 };
  if (pos >= 9) return { rate: 3, multiplier: 4 };
  if (pos >= 5) return { rate: 3, multiplier: 3 };
  if (pos >= 1) return { rate: 4, multiplier: 3 };
  return { rate: 5, multiplier: 2 };
}
export function slotName(slot: Slot, value?: number) {
  return slot === 'number'
    ? `肥力${value ? ` ${value}` : ''}`
    : slot[0] === 'r'
      ? RESOURCE_NAMES[Number(slot[1])]
      : MONK_NAMES[Number(slot[1])];
}
