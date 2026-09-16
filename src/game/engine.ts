import {
  roundsForPlayers,
  BARREL_GOALS,
  CARD_INFO,
  CELLS,
  HOME_NAMES,
  MONK_NAMES,
  PRIVILEGES,
  RESOURCE_NAMES,
  SCORE_PAIRS,
  TRACK_END,
  makeMarket,
  masterLevel,
  neighbours,
  slotName,
} from './data.ts';
import type {
  Action,
  BuyPhase,
  GameSetup,
  GameState,
  Player,
  Resource,
  Result,
  Slot,
  Tile,
} from './types.ts';

export function createGame(seed = Date.now() >>> 0, setup?: GameSetup): GameState {
  const count = setup?.playerCount ?? 4;
  requireRule(
    [2, 3, 4].includes(count) && (!setup || typeof setup.randomStart === 'boolean'),
    '人数必须为 2–4 人。',
  );
  let random = seed >>> 0;
  const next = () => {
    random = (random + 0x6d2b79f5) | 0;
    let t = Math.imul(random ^ (random >>> 15), 1 | random);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const resourceDeck: Tile[] = [],
    monkDeck: Tile[] = [];
  for (let era = 0; era < 2; era++) {
    const resources: Tile[] = [],
      monks: Tile[] = [];
    for (let color = 0; color < 5; color++)
      for (let value = 1; value <= 5; value++)
        for (let copy = 0; copy < 2; copy++)
          resources.push({
            id: `r${era}${color}${value}${copy}`,
            kind: 'resource',
            color: color as Resource,
            value,
          });
    for (let monk = 0; monk < 4; monk++)
      for (let copy = 0; copy < 3; copy++)
        monks.push({ id: `m${era}${monk}${copy}`, kind: 'monk', monk });
    resourceDeck.push(...shuffle(resources));
    monkDeck.push(...shuffle(monks));
  }
  const players: Player[] = ['你', '本笃', '克拉拉', '安瑟伦'].slice(0, count).map((name, id) => ({
    id,
    name,
    coins: 25,
    resources: [0, -2, -4, -6, -8],
    master: -10,
    garden: {},
    sheds: {},
    scored: [],
    cards: [...PRIVILEGES],
    privileges: {},
    barrels: [],
    position: -1,
    home: null,
  }));
  const order = players.map((p) => p.id);
  if (setup?.randomStart) shuffle(order);
  // Starting rewards are selected in reverse seating order, using the existing local convention.
  const rewards: string[] = [];
  order
    .slice(1)
    .reverse()
    .forEach((id, index) => {
      if (index === 0) {
        players[id].master++;
        rewards.push(`${players[id].name}获得酿酒师 +1`);
      } else if (index === 1) {
        players[id].resources[4] += 2;
        rewards.push(`${players[id].name}获得大麦 +2`);
      } else {
        players[id].coins += 2;
        rewards.push(`${players[id].name}获得金币 +2`);
      }
    });
  monkDeck.splice(roundsForPlayers(count) * 4);
  const s: GameState = {
    ...(setup ? { setup: { ...setup }, turnOrder: order } : {}),
    version: 1,
    seed: seed >>> 0,
    round: 1,
    turn: order[0],
    players,
    market: makeMarket(),
    resourceDeck,
    monkDeck,
    barrelSupply: Array(12).fill(2),
    phase: { kind: 'move' },
    log: [],
    actions: [],
    revision: 0,
  };
  refill(s);
  log(
    s,
    setup
      ? `${count} 人 ${roundsForPlayers(count)} 轮对局开始。行动座次：${order.map((id) => players[id].name).join(' → ')}；${players[order[0]].name}先手。${rewards.join('，')}。`
      : '六轮酿酒竞赛开始。你是起始玩家；安瑟伦获得酿酒师 +1，克拉拉获得大麦 +2，本笃获得金币 +2。',
    null,
  );
  return s;
}
function log(s: GameState, text: string, player: number | null = s.turn) {
  s.log.push({ id: s.log.length, round: s.round, player, text });
}
function refill(s: GameState) {
  for (const space of s.market) {
    if (space.type === 'resource') {
      const tile = s.resourceDeck.shift();
      if (tile) space.tiles.push(tile);
    }
    if (space.type === 'monk') {
      const tile = s.monkDeck.shift();
      if (tile) space.tiles.push(tile);
    }
    if (space.type === 'score')
      space.disc =
        s.players.length < 4 &&
        s.round === roundsForPlayers(s.players.length) &&
        (space.scoring === 'B' ||
          space.scoring === 'C' ||
          (s.players.length === 3 &&
            s.market.indexOf(space) === s.market.findIndex((m) => m.scoring === 'ABC')))
          ? 2
          : true;
  }
}
export function advanceResource(p: Player, color: number, steps: number) {
  const next = p.resources[color] + steps;
  p.coins += Math.max(0, next - 20);
  p.resources[color] = Math.min(20, next);
}
export function activate(p: Player, cell: number) {
  const tile = p.garden[cell];
  if (!tile) return;
  if (tile.kind === 'monk') p.master = Math.min(20, p.master + 1);
  else if (CELLS[cell].side === 'shade') p.coins += tile.value;
  else advanceResource(p, tile.color, tile.value);
}
export function tileName(t: Tile) {
  return t.kind === 'resource' ? `${RESOURCE_NAMES[t.color]} ${t.value}` : MONK_NAMES[t.monk];
}
export function price(s: GameState, tile: Tile, cell: number, space: number) {
  return (
    (tile.kind === 'resource' ? tile.value : s.market[space].cost!) *
    (CELLS[cell].side === 'sun' ? 2 : 1)
  );
}
export function scoreOptions(s: GameState, space: number): { slot: Slot; value?: number }[] {
  const p = s.players[s.turn],
    scoring = s.market[space]?.scoring,
    tiles = Object.values(p.garden),
    result: { slot: Slot; value?: number }[] = [];
  if (!scoring) return result;
  if (scoring.includes('A') && !p.scored.includes('number'))
    for (let value = 1; value <= 5; value++)
      if (tiles.some((t) => t.kind === 'resource' && t.value === value))
        result.push({ slot: 'number', value });
  if (scoring.includes('B'))
    for (let n = 0; n < 4; n++)
      if (!p.scored.includes(`m${n}`) && tiles.some((t) => t.kind === 'monk' && t.monk === n))
        result.push({ slot: `m${n}` });
  if (scoring.includes('C'))
    for (let n = 0; n < 5; n++)
      if (!p.scored.includes(`r${n}`) && tiles.some((t) => t.kind === 'resource' && t.color === n))
        result.push({ slot: `r${n}` });
  return result;
}
export function goalMet(p: Player, goal: number) {
  const tiles = Object.values(p.garden),
    sheds = Object.values(p.sheds);
  switch (goal) {
    case 0:
      return p.master >= 1;
    case 1:
      return p.resources.every((n) => n >= 1);
    case 2:
      return tiles.filter((t) => t.kind === 'resource' && t.value === 1).length >= 6;
    case 3:
      return tiles.filter((t) => t.kind === 'resource' && t.value === 5).length >= 6;
    case 4:
      return p.scored.filter((x) => x.startsWith('m')).length === 4;
    case 5:
      return p.scored.filter((x) => x.startsWith('r')).length === 5;
    case 6:
      return sheds.some((t) => sheds.filter((n) => n === t).length >= 3);
    case 7:
      return new Set(sheds).size >= 4;
    case 8:
      return p.resources.some((n) => n >= 20);
    case 9:
      return Object.values(p.privileges).filter((x) => x !== 'skip').length >= 3;
    case 10:
      return CELLS.filter((c) => c.side === 'sun').every((c) => p.garden[c.id]);
    case 11:
      return CELLS.filter((c) => c.side === 'shade').every((c) => p.garden[c.id]);
    default:
      return false;
  }
}
export function claimable(s: GameState, p = s.players[s.turn]) {
  return BARREL_GOALS.map((_, i) => i).filter(
    (i) => s.barrelSupply[i] > 0 && !p.barrels.some((b) => b.goal === i) && goalMet(p, i),
  );
}
export function canVisit(s: GameState, index: number) {
  const p = s.players[s.turn];
  if (
    s.phase.kind !== 'move' ||
    p.home !== null ||
    index <= p.position ||
    index < 0 ||
    index > TRACK_END
  )
    return false;
  if (index === TRACK_END) return true;
  const space = s.market[index];
  if (space.type === 'barrel') return claimable(s).length > 0;
  if (space.type === 'score') return !!space.disc && scoreOptions(s, index).length > 0;
  return space.tiles.some((t) =>
    CELLS.some(
      (c) =>
        c.side !== 'shed' &&
        !p.garden[c.id] &&
        price(s, t, c.id, index) <= p.coins + 3 * p.cards.length,
    ),
  );
}
function nextTurn(s: GameState) {
  if (s.players.every((p) => p.home !== null)) {
    if (s.round === roundsForPlayers(s.players.length)) {
      s.phase = { kind: 'finished' };
      log(s, `所有修道院结束第 ${s.round} 轮，进入最终结算。`, null);
      return;
    }
    s.round++;
    s.turn = s.players.findIndex((p) => p.home === 0);
    for (const p of s.players) {
      p.position = -1;
      p.home = null;
    }
    refill(s);
    log(
      s,
      `第 ${s.round} 轮开始，${s.players[s.turn].name}先手。市场新增资源与修士，计分圆片补满。`,
      null,
    );
  } else {
    do {
      const order = s.turnOrder ?? s.players.map((p) => p.id);
      s.turn = order[(order.indexOf(s.turn) + 1) % order.length];
    } while (s.players[s.turn].home !== null);
  }
  s.phase = { kind: 'move' };
}
export function shedTier(sum: number) {
  return sum <= 7 ? 0 : sum <= 11 ? 1 : sum <= 17 ? 2 : sum <= 23 ? 3 : 4;
}
function beginShed(s: GameState, queue: number[], resume: BuyPhase) {
  if (!queue.length) {
    s.phase = resume;
    return;
  }
  const p = s.players[s.turn],
    [cell, ...rest] = queue;
  const sum = neighbours(cell).reduce((n, id) => {
      const t = p.garden[id];
      return n + (t?.kind === 'resource' ? t.value : 0);
    }, 0),
    tier = shedTier(sum);
  const steps = [6, 3, 1, 1, 0][tier];
  p.master = Math.min(20, p.master + steps);
  log(s, `围合棚屋：肥力合计 ${sum}，酿酒师前进 ${steps} 步，获得 ${tier} 类棚屋。`);
  if (tier === 0) {
    p.sheds[cell] = 0;
    beginShed(s, rest, resume);
  } else s.phase = { kind: 'shed', cell, tier, rest, resume };
}
export function shedOptions(cell: number, tier: number): number[][] {
  const ns = neighbours(cell);
  if (tier === 0) return [[]];
  if (tier === 1) return ns.map((n) => [n]);
  if (tier === 2) return [0, 1, 2].map((i) => [ns[i], ns[i + 3]]);
  if (tier === 3)
    return [
      [ns[0], ns[2], ns[4]],
      [ns[1], ns[3], ns[5]],
    ];
  const result: number[][] = [];
  for (let i = 0; i < 6; i++)
    for (let j = i + 1; j < 6; j++) result.push(ns.filter((_, k) => k !== i && k !== j));
  return result;
}
function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function applyAction(state: GameState, action: Action): GameState {
  return executeAction(structuredClone(state), action);
}

// Tiles are immutable rule data. Simulation clones every mutable container,
// shares tile values, and discards history; both paths use the same rule executor.
export function cloneSimulationState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      resources: [...p.resources],
      garden: { ...p.garden },
      sheds: { ...p.sheds },
      scored: [...p.scored],
      cards: [...p.cards],
      privileges: { ...p.privileges },
      barrels: p.barrels.map((b) => ({ ...b })),
    })),
    market: state.market.map((m) => ({ ...m, tiles: [...m.tiles] })),
    resourceDeck: [...state.resourceDeck],
    monkDeck: [...state.monkDeck],
    barrelSupply: [...state.barrelSupply],
    phase: structuredClone(state.phase),
    actions: [],
    log: [],
  };
}

export function applySimulationAction(state: GameState, action: Action): GameState {
  return executeAction(cloneSimulationState(state), action);
}

// Only for a private clone owned by a single rollout; never pass a live game state.
export function advanceSimulation(state: GameState, action: Action): GameState {
  state.actions = [];
  state.log = [];
  return executeAction(state, action);
}

function executeAction(s: GameState, action: Action): GameState {
  const p = s.players[s.turn];
  requireRule(s.phase.kind !== 'finished', '对局已经结束。');
  switch (action.type) {
    case 'emergency': {
      requireRule(p.cards.includes(action.card), '这张特权卡已经使用或出售。');
      p.cards.splice(p.cards.indexOf(action.card), 1);
      p.coins += 3;
      log(s, `出售「${CARD_INFO[action.card].name}」，获得 3 金币。`);
      break;
    }
    case 'move': {
      requireRule(canVisit(s, action.space), '不能前往该位置：只能前进，并且必须能执行对应行动。');
      p.position = action.space;
      if (action.space === TRACK_END) {
        s.phase = { kind: 'home' };
        break;
      }
      const space = s.market[action.space];
      if (space.type === 'resource' || space.type === 'monk')
        s.phase = { kind: 'buy', space: action.space, bought: 0 };
      else if (space.type === 'score') s.phase = { kind: 'score', space: action.space };
      else {
        const goals = claimable(s);
        for (const goal of goals) {
          const points = s.barrelSupply[goal] === 2 ? 4 : 2;
          s.barrelSupply[goal]--;
          p.barrels.push({ goal, points });
        }
        log(s, `前往酒桶区，领取 ${goals.map((g) => `「${BARREL_GOALS[g]}」`).join('、')}。`);
        nextTurn(s);
      }
      break;
    }
    case 'buy': {
      requireRule(s.phase.kind === 'buy', '当前不能购买板块。');
      const phase = s.phase,
        space = s.market[phase.space],
        tile = space.tiles.find((t) => t.id === action.tile),
        c = CELLS[action.cell];
      requireRule(
        tile && c && c.side !== 'shed' && !p.garden[action.cell],
        '请选择市场板块与空闲花园格。',
      );
      const cost = price(s, tile, action.cell, phase.space);
      requireRule(p.coins >= cost, '金币不足，可以出售未使用的特权卡获得应急金币。');
      p.coins -= cost;
      p.garden[action.cell] = tile;
      space.tiles.splice(space.tiles.indexOf(tile), 1);
      log(
        s,
        `在第 ${phase.space + 1} 格花费 ${cost} 金币，将${tileName(tile)}放入${c.side === 'sun' ? '阳面' : '阴面'}。`,
      );
      const queue = CELLS.filter(
        (c) =>
          c.side === 'shed' &&
          p.sheds[c.id] === undefined &&
          neighbours(c.id).every((n) => !!p.garden[n]),
      ).map((c) => c.id);
      beginShed(s, queue, { ...phase, bought: phase.bought + 1 });
      break;
    }
    case 'endBuy':
      requireRule(s.phase.kind === 'buy' && s.phase.bought > 0, '至少购买一块板块后才能结束。');
      nextTurn(s);
      break;
    case 'shed': {
      requireRule(s.phase.kind === 'shed', '当前没有棚屋奖励。');
      const phase = s.phase;
      const key = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');
      requireRule(
        shedOptions(phase.cell, phase.tier).some((c) => key(c) === key(action.cells)),
        '选择的激活方向不符合棚屋规则。',
      );
      p.sheds[phase.cell] = phase.tier;
      for (const cell of action.cells) activate(p, cell);
      log(s, `棚屋激活 ${action.cells.map((c) => tileName(p.garden[c])).join('、')}。`);
      beginShed(s, phase.rest, phase.resume);
      break;
    }
    case 'score': {
      requireRule(s.phase.kind === 'score', '当前不能使用计分圆片。');
      requireRule(
        scoreOptions(s, s.phase.space).some(
          (o) => o.slot === action.slot && o.value === action.value,
        ),
        '该计分位已使用，或没有对应板块。',
      );
      const before = { coins: p.coins, resources: [...p.resources], master: p.master };
      const scoringSpace = s.market[s.phase.space];
      scoringSpace.disc = Number(scoringSpace.disc) > 1 ? Number(scoringSpace.disc) - 1 : false;
      p.scored.push(action.slot);
      for (const [id, t] of Object.entries(p.garden)) {
        const cell = Number(id);
        if (action.slot === 'number' && t.kind === 'resource' && t.value === action.value)
          activate(p, cell);
        if (action.slot[0] === 'r' && t.kind === 'resource' && t.color === Number(action.slot[1]))
          activate(p, cell);
        if (action.slot[0] === 'm' && t.kind === 'monk' && t.monk === Number(action.slot[1]))
          for (const n of neighbours(cell)) activate(p, n);
      }
      const gains = [
        `金币 +${p.coins - before.coins}`,
        `酿酒师 +${p.master - before.master}`,
        ...p.resources.map((n, i) => `${RESOURCE_NAMES[i]} +${n - before.resources[i]}`),
      ].filter((x) => !x.endsWith('+0'));
      log(
        s,
        `使用「${slotName(action.slot, action.value)}」计分：${gains.join('，') || '无即时收益'}。`,
      );
      const pair = SCORE_PAIRS.findIndex((v) => v.includes(action.slot));
      if (
        SCORE_PAIRS[pair].every((slot) => p.scored.includes(slot)) &&
        p.privileges[pair] === undefined
      )
        s.phase = { kind: 'privilege', pair };
      else nextTurn(s);
      break;
    }
    case 'privilege': {
      requireRule(s.phase.kind === 'privilege', '当前没有特权奖励。');
      const card = action.card;
      requireRule(card === 'skip' || p.cards.includes(card), '这张特权卡不可用。');
      if (card === 'color' || card === 'lowest')
        requireRule(
          Number.isInteger(action.color) && action.color! >= 0 && action.color! < 5,
          '请选择资源。',
        );
      if (card === 'lowest')
        requireRule(
          p.resources[action.color!] === Math.min(...p.resources),
          '必须选择最落后的资源。',
        );
      p.privileges[s.phase.pair] = card;
      if (card !== 'skip') {
        p.cards.splice(p.cards.indexOf(card), 1);
        if (card === 'coins') p.coins += 12;
        if (card === 'master') p.master = Math.min(20, p.master + 5);
        if (card === 'color')
          advanceResource(
            p,
            action.color!,
            Object.values(p.garden).filter((t) => t.kind === 'resource' && t.color === action.color)
              .length,
          );
        if (card === 'lowest') advanceResource(p, action.color!, p.scored.length);
      }
      log(
        s,
        card === 'skip'
          ? '放弃本次特权奖励，该配对不能再次使用。'
          : `完成计分配对，使用「${CARD_INFO[card].name}」${action.color !== undefined ? `（${RESOURCE_NAMES[action.color]}）` : ''}。`,
      );
      nextTurn(s);
      break;
    }
    case 'home': {
      requireRule(s.phase.kind === 'home', '请先前往起点。');
      requireRule(
        Number.isInteger(action.slot) &&
          action.slot >= 0 &&
          action.slot < 4 &&
          !s.players.some((x) => x.home === action.slot),
        '该起点位置不可选。',
      );
      requireRule(
        !(
          s.players.filter((x) => x.home !== null).length === s.players.length - 1 &&
          !s.players.some((x) => x.home === 0)
        ) || action.slot === 0,
        '最后返回且先手位空缺时，必须选择先手位。',
      );
      if (action.slot === 2) {
        requireRule(
          Number.isInteger(action.color) && action.color! >= 0 && action.color! < 5,
          '请选择推进的资源。',
        );
        advanceResource(p, action.color!, 2);
      }
      if (action.slot === 1) p.master = Math.min(20, p.master + 1);
      if (action.slot === 3) p.coins += 2;
      p.home = action.slot;
      log(
        s,
        `返回修道院，选择「${HOME_NAMES[action.slot]}」${action.slot === 2 ? `（${RESOURCE_NAMES[action.color!]}）` : ''}，结束本轮。`,
      );
      nextTurn(s);
      break;
    }
    default:
      throw new Error('未知行动。');
  }
  s.actions.push(action);
  s.revision++;
  return s;
}
export function legalActions(s: GameState): Action[] {
  const p = s.players[s.turn],
    phase = s.phase,
    actions: Action[] = [];
  if (phase.kind === 'finished') return actions;
  for (const card of p.cards) actions.push({ type: 'emergency', card });
  if (phase.kind === 'move')
    for (let space = p.position + 1; space <= TRACK_END; space++)
      if (canVisit(s, space)) actions.push({ type: 'move', space });
  if (phase.kind === 'buy') {
    for (const tile of s.market[phase.space].tiles)
      for (const c of CELLS)
        if (c.side !== 'shed' && !p.garden[c.id] && price(s, tile, c.id, phase.space) <= p.coins)
          actions.push({ type: 'buy', tile: tile.id, cell: c.id });
    if (phase.bought) actions.push({ type: 'endBuy' });
  }
  if (phase.kind === 'score')
    for (const o of scoreOptions(s, phase.space)) actions.push({ type: 'score', ...o });
  if (phase.kind === 'shed')
    for (const cells of shedOptions(phase.cell, phase.tier)) actions.push({ type: 'shed', cells });
  if (phase.kind === 'privilege') {
    actions.push({ type: 'privilege', card: 'skip' });
    for (const card of p.cards) {
      if (card === 'color' || card === 'lowest') {
        for (let color = 0; color < 5; color++)
          if (card === 'color' || p.resources[color] === Math.min(...p.resources))
            actions.push({ type: 'privilege', card, color });
      } else actions.push({ type: 'privilege', card });
    }
  }
  if (phase.kind === 'home')
    for (let slot = 0; slot < 4; slot++) {
      if (s.players.some((x) => x.home === slot)) continue;
      if (
        slot !== 0 &&
        s.players.filter((x) => x.home !== null).length === s.players.length - 1 &&
        !s.players.some((x) => x.home === 0)
      )
        continue;
      if (slot === 2)
        for (let color = 0; color < 5; color++) actions.push({ type: 'home', slot, color });
      else actions.push({ type: 'home', slot });
    }
  return actions;
}
export function calculateResult(p: Player): Result {
  const { rate, multiplier } = masterLevel(p.master),
    resources = [...p.resources],
    exchanges: Result['exchanges'] = [];
  // Each exchange raises one currently lowest marker. No donor drops below its target.
  for (let step = 0; step < 200; step++) {
    const low = Math.min(...resources),
      to = resources.indexOf(low),
      target = low + 1;
    if (target > 20 || resources.reduce((sum, x) => sum + Math.max(0, x - target), 0) < rate) break;
    const from: number[] = [];
    for (let cost = 0; cost < rate; cost++) {
      const donor = resources.indexOf(Math.max(...resources));
      resources[donor]--;
      from.push(donor);
    }
    resources[to]++;
    exchanges.push({ from, to });
  }
  const afterExchange = [...resources];
  let coinsSpent = 0;
  for (let steps = Math.floor(p.coins / 10); steps > 0 && Math.min(...resources) < 20; steps--) {
    resources[resources.indexOf(Math.min(...resources))]++;
    coinsSpent += 10;
  }
  const minimum = Math.max(0, Math.min(...resources)),
    production = minimum * multiplier,
    barrels = p.barrels.reduce((sum, b) => sum + b.points, 0),
    privilege = Object.values(p.privileges).includes('barrel') ? p.barrels.length : 0,
    first = p.home === 0 ? 1 : 0;
  return {
    player: p.id,
    before: [...p.resources],
    afterExchange,
    afterCoins: resources,
    rate,
    multiplier,
    exchanges,
    coinsSpent,
    minimum,
    production,
    barrels,
    privilege,
    first,
    total: production + barrels + privilege + first,
  };
}
export function assertInvariants(s: GameState) {
  requireRule(
    [2, 3, 4].includes(s.players.length) &&
      s.turn >= 0 &&
      s.turn < s.players.length &&
      s.round >= 1 &&
      s.round <= roundsForPlayers(s.players.length),
    '对局结构异常。',
  );
  if (s.turnOrder)
    requireRule(
      s.turnOrder.length === s.players.length &&
        new Set(s.turnOrder).size === s.players.length &&
        s.turnOrder.every((id) => Number.isInteger(id) && id >= 0 && id < s.players.length),
      '行动座次异常。',
    );
  const totalTiles = 100 + roundsForPlayers(s.players.length) * 4;
  const ids: string[] = [...s.resourceDeck, ...s.monkDeck, ...s.market.flatMap((m) => m.tiles)].map(
    (t) => t.id,
  );
  for (const p of s.players) {
    requireRule(p.coins >= 0 && Number.isInteger(p.coins), '金币异常。');
    requireRule(
      p.master >= -10 && p.master <= 20 && p.resources.every((n) => n >= -10 && n <= 20),
      '生产轨道异常。',
    );
    requireRule(
      new Set(p.scored).size === p.scored.length && p.scored.length <= 10,
      '计分位重复。',
    );
    requireRule(new Set(p.cards).size === p.cards.length, '特权卡重复。');
    for (const [cell, tile] of Object.entries(p.garden)) {
      requireRule(CELLS[Number(cell)]?.side !== 'shed', '板块放在棚屋上。');
      ids.push(tile.id);
    }
    for (const cell of Object.keys(p.sheds))
      requireRule(
        neighbours(Number(cell)).every((n) => p.garden[n]),
        '未围合的棚屋。',
      );
  }
  requireRule(ids.length === totalTiles && new Set(ids).size === totalTiles, '板块丢失或重复。');
  for (let i = 0; i < 12; i++)
    requireRule(
      s.barrelSupply[i] + s.players.flatMap((p) => p.barrels).filter((b) => b.goal === i).length ===
        2,
      '酒桶数量异常。',
    );
}
