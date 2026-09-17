# 困难 AI 首步远跳修正

## 复现与判断

四位玩家全部使用默认预算的 `createTreeAgent()`，从 `createGame(seed)` 开始执行，记录各玩家第一次 `move`。市场共 27 格，下表为用户可见的 1 起始编号；第 28 格表示回家。

| 种子 | 修正前四位首步   | 修正后四位首步  |
| ---- | ---------------- | --------------- |
| 6    | 10 / 9 / 15 / 13 | 1 / 2 / 3 / 5   |
| 8    | 18 / 23 / 13 / 9 | 1 / 5 / 3 / 6   |
| 14   | 19 / 17 / 2 / 10 | 2 / 3 / 19 / 22 |
| 16   | 3 / 2 / 18 / 22  | 3 / 2 / 8 / 10  |

以目的地第 15 格及以后为远跳，次数从 7/16 降到 2/16。每组按各自策略连续执行，因此后续座位看到的市场可能不同。这是四个开发种子的行为复现，不是 16 个独立样本，也不是胜率验证。

搜索首步时通常只有八十多次完整模拟，分配给最多 36 个候选，每个候选往往只有两三次。后续普通策略每跳过一格只扣 0.12 分，且终局模拟依赖该策略。近处建设的机会价值可能被低估；不能仅凭模拟选中远跳就认为远跳经过了充分验证。

## 修正范围

仅第一轮、花园尚为空时，对搜索分支加入软机会成本。统计目的地之前估值为正、当前现金足够购买的资源或修士位置，取价值最高的三个，合计乘 0.35，再除以 35 转到搜索收益量级，从该分支回传收益中扣除。该权重是启发式修正，并非对损失分数的精确估计。

空位置、没有正收益的位置、需要出售特权卡才能购买的位置不计入；已开始建设或后续轮次不应用。保留所有原有候选，收益足够高的远跳仍可获选。预算、未知牌抽样和正式规则不变，普通策略及冻结的旧困难源码不变。`TreeResult.value` 是修正后的平均搜索收益，不应解释为胜率。

曾尝试只修改模拟中的普通策略，但仍出现空花园直接回家的选择，未采用该方案。

## 回归检查

`tests/ai-opening.test.ts` 覆盖跳过有用购买、回家、空位置、现金不足、非正收益、修正作用阶段，以及种子 8 首步不再跨过半圈且确实购买板块。

验证结果：新增及 MCTS 专项共 9 项通过；完整测试首次为 84/86 通过，另外两项 HTTP 测试因沙箱禁止监听本地端口而失败，允许本地监听后单独重跑 2/2 通过。TypeScript 与 Vite 生产构建通过。

复现当前四座首步：

```sh
node --experimental-strip-types --input-type=module <<'JS'
import { createGame, applyAction } from './src/game/engine.ts';
import { createTreeAgent } from './src/game/ai.mcts.ts';
for (const seed of [6, 8, 14, 16]) {
  let s = createGame(seed);
  const agents = s.players.map(() => createTreeAgent());
  const moves = new Map();
  while (moves.size < 4) {
    const seat = s.turn;
    const action = agents[seat](s);
    if (action.type === 'move' && !moves.has(seat)) moves.set(seat, action.space + 1);
    s = applyAction(s, action);
  }
  console.log(seed, [...moves.entries()]);
}
JS
```

尚未执行修正版本的大规模独立整局胜率对照，不能沿用旧版本的历史胜率作为本次修正的成绩。
