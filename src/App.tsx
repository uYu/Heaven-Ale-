import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, SVGProps } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Coins,
  Download,
  Flag,
  FlaskConical,
  Flower2,
  Home,
  Leaf,
  List,
  LoaderCircle,
  Moon,
  Pause,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
  Sprout,
  Sun,
  TreePine,
  Trophy,
  Upload,
  UserRound,
  Users,
  Undo2,
  RotateCcw,
  Wheat,
  Wine,
  X,
  Droplets,
} from 'lucide-react';
import {
  roundsForPlayers,
  BARREL_GOALS,
  CARD_INFO,
  CELLS,
  HOME_NAMES,
  PLAYER_COLORS,
  RESOURCE_COLORS,
  RESOURCE_NAMES,
  TRACK_END,
  neighbours,
  slotName,
} from './game/data.ts';
import {
  calculateResult,
  canVisit,
  claimable,
  createGame,
  goalMet,
  legalActions,
  price,
  scoreOptions,
  shedOptions,
  tileName,
} from './game/engine.ts';
import { describeActivity } from './game/activity.ts';
import type { Activity } from './game/activity.ts';
import { OpponentActivity } from './components/OpponentActivity.tsx';
import { privilegePreview } from './game/preview.ts';
import { deserializeSession, SAVE_KEY, serializeSession } from './game/storage.ts';
import {
  advanceComputer,
  confirmTurn,
  inspectSession,
  resetTurn,
  stageAction,
  undoAction,
} from './game/session.ts';
import { BrewerIcon, MonkIcon, MONK_COLORS } from './components/MonkIcon.tsx';
import { useRoadMotion, usePlacementMotion } from './hooks/useBoardMotion.ts';
import { BoardViewport } from './components/BoardViewport.tsx';
import { ProductionBoard, ScoringBoard } from './components/PlayerBoards.tsx';
import type { Action, GameState, Player, Tile } from './game/types.ts';
import type { Difficulty } from './game/ai.ts';

import type { TurnSession } from './game/session.ts';
import { ReplayLibrary } from './components/ReplayLibrary.tsx';
import { CloudStatus } from './components/CloudStatus.tsx';
import { attachRecording, enqueueRecording, startReplaySync } from './replay/sync.ts';
import { StartingPositions } from './components/StartingPositions.tsx';
import { MainMenu } from './components/MainMenu.tsx';
import { loadPreferences, savePreferences } from './game/preferences.ts';

const resourceIcons = [TreePine, FlaskConical, Flower2, Droplets, Wheat];
function ResourceIcon({
  color,
  size = 18,
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'color'> & { color: number; size?: number }) {
  const Icon = resourceIcons[color];
  return <Icon size={size} strokeWidth={1.7} {...props} />;
}
const PLAYER_MARKS = ['你', '本', '克', '安'];
function Pawn({
  player,
  small = false,
  map = false,
  selected = false,
  name,
  position,
}: {
  player: number;
  small?: boolean;
  map?: boolean;
  selected?: boolean;
  name?: string;
  position?: number;
}) {
  return (
    <span
      className={`pawn ${small ? 'small' : ''} ${map ? 'map-pawn' : ''} ${selected ? 'is-viewed' : ''}`}
      title={name ? `${name}${selected ? ' · 正在查看' : ''}` : undefined}
      aria-label={name}
      data-road-pawn={map ? player : undefined}
      data-road-position={position === undefined ? undefined : position + 1}
      style={{ '--player': PLAYER_COLORS[player] } as CSSProperties}
    >
      {map ? <b>{PLAYER_MARKS[player]}</b> : <UserRound size={small ? 10 : 15} />}
    </span>
  );
}
function TileBadge({ tile, compact = false }: { tile: Tile; compact?: boolean }) {
  return (
    <span
      className={`tile-badge ${tile.kind} ${compact ? 'compact' : ''}`}
      style={
        {
          '--tile': tile.kind === 'resource' ? RESOURCE_COLORS[tile.color] : MONK_COLORS[tile.monk],
        } as CSSProperties
      }
    >
      {tile.kind === 'resource' ? (
        <>
          <ResourceIcon color={tile.color} size={compact ? 17 : 22} />
          <b>{tile.value}</b>
        </>
      ) : (
        <>
          <MonkIcon monk={tile.monk} size={compact ? 18 : 24} />
          <b>{['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][tile.monk]}</b>
        </>
      )}
    </span>
  );
}
function trackPosition(index: number) {
  if (index <= 9) return { gridColumn: index + 1, gridRow: 1 };
  if (index <= 14) return { gridColumn: 10, gridRow: index - 8 };
  if (index <= 23) return { gridColumn: 24 - index, gridRow: 6 };
  return { gridColumn: 1, gridRow: 29 - index };
}
function roadPosition(index: number): CSSProperties {
  const column = index <= 3 ? index + 1 : index <= 14 ? 4 : index <= 17 ? 18 - index : 1;
  const row = index <= 3 ? 1 : index <= 14 ? index - 2 : index <= 17 ? 12 : 29 - index;
  return { ...trackPosition(index), '--road-column': column, '--road-row': row } as CSSProperties;
}
function roadDirection(index: number) {
  return index < 3 ? 'right' : index < 14 ? 'down' : index < 17 ? 'left' : 'up';
}
function HomeRewards({
  state,
  onChoose,
}: {
  state: GameState;
  onChoose?: (action: Action) => void;
}) {
  // The direct-return picker previews the move too: leaving frees our starting slot.
  const startingSlots =
    onChoose && state.phase.kind === 'move'
      ? state.startingSlots?.map((slot, id) => (id === state.turn ? null : slot))
      : state.startingSlots;
  const options = legalActions({ ...state, startingSlots, phase: { kind: 'home' } }).filter(
    (action) => action.type === 'home',
  );
  return (
    <div className={`home-rewards ${onChoose ? 'is-selecting' : ''}`} aria-label="修道院剩余奖励">
      {HOME_NAMES.map((name, slot) => {
        const owner = state.players.find(
          (player) => player.home === slot || startingSlots?.[player.id] === slot,
        );
        const choices = options.filter((action) => action.type === 'home' && action.slot === slot);
        return (
          <div className={`home-reward ${owner ? 'is-taken' : ''}`} key={slot}>
            <strong>{name}</strong>
            <small>
              {owner ? `${owner.name}已领取` : choices.length ? '可领取' : '最后返回须选先手'}
            </small>
            {onChoose &&
              (slot === 2 ? (
                <div className="home-resource-choices">
                  {RESOURCE_NAMES.map((resource, color) => (
                    <button
                      className="secondary"
                      key={resource}
                      disabled={
                        !choices.some((action) => action.type === 'home' && action.color === color)
                      }
                      onClick={() => onChoose({ type: 'home', slot, color })}
                    >
                      <ResourceIcon color={color} size={16} />
                      {resource} +2
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className="secondary"
                  disabled={!choices.length}
                  onClick={() => onChoose({ type: 'home', slot })}
                >
                  选择{name}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
function Market({
  state,
  dispatch,
  paused,
  viewedPlayer,
  onHome,
}: {
  state: GameState;
  dispatch: (a: Action) => void;
  paused: boolean;
  viewedPlayer: number;
  onHome: () => void;
}) {
  const roadRef = useRef<HTMLDivElement>(null);
  useRoadMotion(roadRef, String(state.seed), state.players.map((p) => p.position).join(','));
  const human = state.turn === 0 && !paused,
    p = state.players[state.turn];
  return (
    <section id="market-area" tabIndex={-1} className="market-wrap">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE MONASTERY ROAD</span>
          <h2>
            修道院之路 <span>顺时针前进，选择你的机遇</span>
          </h2>
        </div>
        <span className="board-legend">
          <span className="legend-dot" /> 可前往 <span className="legend-dot purple" /> 计分
        </span>
      </div>
      <HomeRewards state={state} />
      <BoardViewport label="修道院道路">
        <div className="market-board" ref={roadRef}>
          <div className="board-center">
            <div className="table-center-title">
              <Wine size={20} />
              <strong>酒桶目标</strong>
              <span>大桶 4 分 · 小桶 2 分 · 到酒桶格领取</span>
            </div>
            <div className="table-barrels">
              {BARREL_GOALS.map((goal, i) => {
                const owned = state.players[0].barrels.some((b) => b.goal === i),
                  met = goalMet(state.players[0], i);
                return (
                  <div
                    key={i}
                    className={`table-barrel ${owned ? 'owned' : met ? 'ready' : ''}`}
                    title={`${goal} · ${owned ? '你已领取' : met ? '你已达成，前往酒桶格领取' : '尚未达成'}`}
                  >
                    <span className="barrel-goal-index">{String(i + 1).padStart(2, '0')}</span>
                    <div className="barrel-tokens">
                      <span className={state.barrelSupply[i] === 2 ? '' : 'taken'}>4</span>
                      <span className={state.barrelSupply[i] > 0 ? '' : 'taken'}>2</span>
                    </div>
                    <strong>{goal}</strong>
                    <small>{owned ? '✓ 已领取' : met ? '✓ 已达成' : '待达成'}</small>
                  </div>
                );
              })}
            </div>
            <div className="table-rounds">
              <strong>轮次</strong>
              {Array.from({ length: roundsForPlayers(state.players.length) }, (_, i) => i + 1).map(
                (n) => (
                  <span
                    key={n}
                    className={n === state.round ? 'current' : n < state.round ? 'past' : ''}
                  >
                    {n}
                  </span>
                ),
              )}
              <small>顺时针沿外圈前进 →</small>
            </div>
          </div>
          <button
            className={`track-space home-space ${human && canVisit(state, TRACK_END) ? 'available' : ''}`}
            data-road-step={0}
            data-direction={roadDirection(0)}
            style={roadPosition(0)}
            onClick={onHome}
            disabled={!human || !canVisit(state, TRACK_END)}
            title="返回修道院，领取起点奖励并结束本轮"
            aria-label="返回修道院"
          >
            <Home size={24} />
            <span>修道院</span>
            <div className="space-pawns">
              {state.players
                .filter((p) => p.position === -1 || p.position === TRACK_END)
                .map((p) => (
                  <Pawn
                    key={p.id}
                    player={p.id}
                    map
                    selected={viewedPlayer === p.id}
                    name={p.name}
                    position={p.position}
                  />
                ))}
            </div>
          </button>
          {state.market.map((space, index) => {
            const available = human && canVisit(state, index),
              occupants = state.players.filter((p) => p.position === index),
              selected = p.position === index && state.phase.kind !== 'move';
            const title =
              space.type === 'resource'
                ? `${space.tiles.map(tileName).join('、') || '资源已售罄'}`
                : space.type === 'monk'
                  ? `${space.tiles.map(tileName).join('、') || '修士已售罄'}：阴面 ${space.cost} / 阳面 ${space.cost! * 2} 金币`
                  : space.type === 'score'
                    ? `${space.scoring} 类计分${space.disc ? `（剩余 ${Number(space.disc)} 枚）` : '（已取走）'}`
                    : '领取所有已达成的可用酒桶';
            return (
              <button
                key={index}
                className={`track-space ${space.type} ${available ? 'available' : ''} ${selected ? 'selected' : ''} ${(!space.tiles.length && ['resource', 'monk'].includes(space.type)) || (space.type === 'score' && !space.disc) ? 'depleted' : ''}`}
                data-road-step={index + 1}
                data-direction={roadDirection(index + 1)}
                style={roadPosition(index + 1)}
                disabled={!available}
                onClick={() => dispatch({ type: 'move', space: index })}
                title={`${index + 1} · ${title}`}
                aria-label={`第${index + 1}格 ${title}`}
              >
                <span className="space-index">{String(index + 1).padStart(2, '0')}</span>
                {space.type === 'resource' || space.type === 'monk' ? (
                  space.tiles.length ? (
                    <TileBadge tile={space.tiles[space.tiles.length - 1]} compact />
                  ) : (
                    <span className="empty-tile">◇</span>
                  )
                ) : space.type === 'score' ? (
                  <span className="scoring-disc">
                    {space.scoring === 'ABC' ? '✦' : space.scoring}
                  </span>
                ) : (
                  <Wine className="barrel-icon" size={25} />
                )}
                <span className="space-caption">
                  {space.type === 'resource'
                    ? '资源'
                    : space.type === 'monk'
                      ? `${space.cost} 金币起`
                      : space.type === 'score'
                        ? space.scoring === 'ABC'
                          ? '任意计分'
                          : `${space.scoring} 类计分`
                        : '酒桶奖励'}
                </span>
                {space.tiles.length > 1 && (
                  <span className="stack-count">{space.tiles.length}</span>
                )}
                {space.type === 'score' && Number(space.disc) > 1 && (
                  <span className="stack-count" aria-label={`剩余 ${space.disc} 枚计分圆片`}>
                    {Number(space.disc)}
                  </span>
                )}
                <div className="space-pawns">
                  {occupants.map((p) => (
                    <Pawn
                      key={p.id}
                      player={p.id}
                      map
                      selected={viewedPlayer === p.id}
                      name={p.name}
                      position={p.position}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </BoardViewport>
      <div className="board-footnote">
        <ArrowRight size={13} /> 可以跳过任意格，但本轮不能后退。
        <span>
          <Users size={13} /> 多位玩家可以停在同一格
        </span>
      </div>
      <details className="market-inventory">
        <summary>
          查看市场全部板块 <span>购买前查看每一叠资源与修士</span>
          <ChevronDown size={13} />
        </summary>
        <div className="inventory-grid">
          {state.market.map(
            (space, index) =>
              (space.type === 'resource' || space.type === 'monk') && (
                <div className="inventory-space" key={index}>
                  <span className="inventory-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    {space.tiles.map((t) => (
                      <span className="inventory-tile" key={t.id}>
                        <TileBadge tile={t} compact />
                        <span>{tileName(t)}</span>
                      </span>
                    ))}
                    {!space.tiles.length && <small>已售罄</small>}
                    {space.type === 'monk' && (
                      <small>
                        阴面 {space.cost} / 阳面 {space.cost! * 2} 金币
                      </small>
                    )}
                  </div>
                  <button
                    className="text-button"
                    disabled={!human || !canVisit(state, index)}
                    onClick={() => dispatch({ type: 'move', space: index })}
                    aria-label={`前往市场第${index + 1}格`}
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>
              ),
          )}
        </div>
      </details>
    </section>
  );
}
function scrollToArea(id: string) {
  const target = document.getElementById(id);
  target?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'start',
  });
  target?.focus({ preventScroll: true });
}

function PurchasePicker({
  state,
  selectedTile,
  onSelect,
}: {
  state: GameState;
  selectedTile: string | null;
  onSelect: (id: string) => void;
}) {
  const phase = state.phase;
  if (phase.kind !== 'buy') return null;
  const player = state.players[0];
  return (
    <div className="shop-tiles" aria-label="选择购买板块">
      {state.market[phase.space].tiles.map((tile) => {
        const empty = CELLS.filter((cell) => cell.side !== 'shed' && !player.garden[cell.id]);
        const affordable = empty.some(
          (cell) => price(state, tile, cell.id, phase.space) <= player.coins,
        );
        const cost = tile.kind === 'resource' ? tile.value : state.market[phase.space].cost!;
        return (
          <button
            key={tile.id}
            className={selectedTile === tile.id ? 'chosen' : ''}
            disabled={!affordable}
            aria-pressed={selectedTile === tile.id}
            aria-label={`选择${tileName(tile)}，阳面 ${cost * 2} 金币，阴面 ${cost} 金币${!affordable ? '，无法放置' : ''}`}
            onClick={() => onSelect(tile.id)}
          >
            <TileBadge tile={tile} />
            <span>{tileName(tile)}</span>
            <small>
              <Sun size={12} />
              {cost * 2}
              <Moon size={12} />
              {cost}
            </small>
            <span className="tile-availability">
              {!empty.length
                ? '花园已满'
                : !affordable
                  ? '金币不足'
                  : selectedTile === tile.id
                    ? '已选 · 点击空地'
                    : '选择板块'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
function AnimatedGardenCell({
  identity,
  value,
  ...props
}: SVGProps<SVGGElement> & { identity: string; value: string }) {
  const ref = useRef<SVGGElement>(null);
  usePlacementMotion(ref, identity, value);
  return <g ref={ref} {...props} />;
}

function Garden({
  player,
  state,
  selectedTile,
  dispatch,
  selectedCells,
  setSelectedCells,
  paused,
}: {
  player: Player;
  state: GameState;
  selectedTile: string | null;
  dispatch: (a: Action) => void;
  selectedCells: number[];
  setSelectedCells: (a: number[]) => void;
  paused: boolean;
}) {
  const phase = state.phase,
    active = state.turn === 0 && player.id === 0 && !paused,
    tile =
      phase.kind === 'buy'
        ? state.market[phase.space].tiles.find((t) => t.id === selectedTile)
        : null;
  const shedNeighbours = phase.kind === 'shed' && active ? neighbours(phase.cell) : [];
  const enabled = (id: number) =>
    !!(
      active &&
      ((tile &&
        phase.kind === 'buy' &&
        CELLS[id].side !== 'shed' &&
        !player.garden[id] &&
        price(state, tile, id, phase.space) <= player.coins) ||
        shedNeighbours.includes(id))
    );
  const chooseCell = (id: number) => {
    if (!enabled(id)) return;
    if (phase.kind === 'buy' && tile) dispatch({ type: 'buy', tile: tile.id, cell: id });
    else if (phase.kind === 'shed')
      setSelectedCells(
        selectedCells.includes(id) ? selectedCells.filter((x) => x !== id) : [...selectedCells, id],
      );
  };
  const points = Array.from(
    { length: 6 },
    (_, i) =>
      `${Math.cos(((i * 60 - 30) * Math.PI) / 180) * 24},${Math.sin(((i * 60 - 30) * Math.PI) / 180) * 24}`,
  ).join(' ');
  return (
    <div className="garden-content">
      <div className="garden-legend">
        <span>
          <Sun size={16} /> 阳面 <small>双倍费用 · 生产资源</small>
        </span>
        <span>
          <Moon size={15} /> 阴面 <small>原价费用 · 获得金币</small>
        </span>
      </div>
      <svg
        viewBox="0 0 380 315"
        className="garden-svg"
        role="group"
        aria-label={`${player.name}的花园`}
      >
        <defs>
          <linearGradient id="gardenGlow">
            <stop stopColor="#e6cb83" stopOpacity=".25" />
            <stop offset=".5" stopColor="#f8f5e8" stopOpacity=".1" />
            <stop offset="1" stopColor="#708871" stopOpacity=".18" />
          </linearGradient>
        </defs>
        <ellipse cx="190" cy="175" rx="176" ry="136" fill="url(#gardenGlow)" />
        {CELLS.map((c) => {
          const t = player.garden[c.id],
            shed = player.sheds[c.id],
            selectable = enabled(c.id),
            selected = selectedCells.includes(c.id),
            color =
              t?.kind === 'resource'
                ? RESOURCE_COLORS[t.color]
                : t?.kind === 'monk'
                  ? MONK_COLORS[t.monk]
                  : '#8d7995';
          return (
            <AnimatedGardenCell
              identity={`${state.seed}:${player.id}`}
              value={`${t?.id ?? 'empty'}:${shed ?? 'empty'}`}
              key={c.id}
              transform={`translate(${190 + c.x * 21.4},${36 + c.y * 37})`}
              role={selectable ? 'button' : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-label={`花园第${c.id + 1}格，${c.side === 'shed' ? '棚屋' : c.side === 'sun' ? '阳面' : '阴面'}${t ? `，${tileName(t)}` : '，空地'}${tile && phase.kind === 'buy' && c.side !== 'shed' && !t ? `，费用 ${price(state, tile, c.id, phase.space)} 金币${!selectable ? '，不可放置' : ''}` : ''}`}
              aria-pressed={selectable && phase.kind === 'shed' ? selected : undefined}
              onClick={() => chooseCell(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  chooseCell(c.id);
                }
              }}
              className={`garden-cell ${selectable ? 'selectable' : ''} ${selected ? 'chosen' : ''}`}
            >
              <title>
                {c.side === 'shed'
                  ? shed === undefined
                    ? '围满六边后获得棚屋奖励'
                    : `${shed} 类棚屋（已激活）`
                  : t
                    ? `${tileName(t)} · ${c.side === 'sun' ? '阳面' : '阴面'}`
                    : tile && phase.kind === 'buy'
                      ? `放置费用 ${price(state, tile, c.id, phase.space)} 金币`
                      : '空闲花园格'}
              </title>
              <polygon
                points={points}
                fill={
                  t
                    ? color
                    : c.side === 'shed'
                      ? '#d8dac4'
                      : c.side === 'sun'
                        ? '#f1e7c6'
                        : '#dbe3d4'
                }
                stroke={selected ? '#d39c37' : selectable ? '#4c8063' : '#f8f6ec'}
                strokeWidth={selected || selectable ? 2 : 2.5}
              />
              {t ? (
                <>
                  <>
                    {t.kind === 'resource' ? (
                      <ResourceIcon
                        color={t.color}
                        x={-10}
                        y={-18}
                        width={20}
                        height={20}
                        stroke="#fff9e9"
                        strokeWidth={2}
                      />
                    ) : (
                      <MonkIcon
                        monk={t.monk}
                        x={-10}
                        y={-18}
                        width={20}
                        height={20}
                        color="#fff9e9"
                        strokeWidth={2}
                      />
                    )}
                  </>
                  <text
                    x="0"
                    y="12"
                    dominantBaseline="central"
                    textAnchor="middle"
                    className="hex-number"
                  >
                    {t.kind === 'resource' ? t.value : ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][t.monk]}
                  </text>
                </>
              ) : c.side === 'shed' ? (
                <>
                  <path
                    d="M-9 4V-5L0-11 9-5V4Z M-12-4 0-14 12-4"
                    fill="none"
                    stroke="#849275"
                    strokeWidth="1.5"
                  />
                  <text y="16" textAnchor="middle" fill="#788568" fontSize="10">
                    {shed !== undefined ? `${shed} 类` : '棚屋'}
                  </text>
                </>
              ) : selectable ? (
                <text y="5" textAnchor="middle" fill="#537c5a" fontSize={tile ? '12' : '19'}>
                  {tile && phase.kind === 'buy' ? price(state, tile, c.id, phase.space) : '+'}
                </text>
              ) : (
                <circle r="1.7" fill={c.side === 'sun' ? '#cbbb8d' : '#a5b79b'} />
              )}
              {selected && <circle cx="14" cy="-14" r="5" fill="#efbe61" />}
            </AnimatedGardenCell>
          );
        })}
      </svg>
      <div className="garden-footer">
        <span>
          <Sprout size={14} />
          {Object.keys(player.garden).length} / 30 已种植
        </span>
        <span>
          <Home size={14} />
          {Object.keys(player.sheds).length} / 7 棚屋
        </span>
      </div>
    </div>
  );
}
function Rules() {
  return (
    <div className="rules-content">
      <span className="eyebrow">A LITTLE GUIDANCE</span>
      <h2>酿一杯好酒，从这里开始</h2>
      <p>
        你与 1–3 位 AI 各自经营一座修道院。2 人玩 3 轮、3 人玩 4 轮、4 人玩 6
        轮。在竞争中，积累金币、规划花园，让五种资源与酿酒师共同成长。
      </p>
      <p>
        开局先随机确定座次与先手。先手占据先手位，没有即时奖励；其余玩家逆时针选择剩余起始位置，领取酿酒师
        +1、任选一种资源 +2 或金币 +2。2、3
        人局也保留全部四个位置。选择完成后，从先手开始顺时针行动。
      </p>
      <div className="rules-grid">
        {[
          [
            '00',
            '预操作与撤回',
            '你的移动、购买、计分、棚屋、特权与起点奖励均先预览。可撤回一步或重做本回合；完成全部选择后点击“确认本回合”才交给 AI。刷新也会保存待确认操作。',
          ],
          [
            '01',
            '沿路前行',
            '每回合在公共道路上顺时针前进任意距离，并执行落点行动。不能原地停留或后退；已经没有货物、无法计分或无法领取酒桶的位置不能进入。',
          ],
          [
            '02',
            '阳面与阴面',
            '在资源或修士格必须至少购买一块，也可以继续购买该格剩余板块。资源费用为肥力值；修士费用由道路格决定。阳面支付双倍费用，激活时推进资源；阴面支付原价，激活时获得金币。',
          ],
          [
            '03',
            '抓住计分机会',
            'A 类按一个肥力数字激活资源；B 类触发一种修士，逐个激活其全部邻接板块；C 类按一种资源颜色激活。任意计分可选以上任一种。修士被邻居激活时只推进酿酒师 1 步，不会继续连锁触发。',
          ],
          [
            '04',
            '围合棚屋',
            '围满棚屋周围六格，按资源肥力之和领奖：0–7 酿酒师 +6；8–11 酿酒师 +3、激活 1 格；12–17 酿酒师 +1、激活相对 2 格；18–23 酿酒师 +1、激活交错 3 格；24+ 任意激活 4 格。修士不计肥力。',
          ],
          [
            '05',
            '特权与酒桶',
            '完成一对计分位，可立即使用一张特权卡；放弃后不能补领。回合内也可出售未使用特权卡换 3 金币。到达酒桶格时，领取所有已满足且自己尚未领取的目标：先领取大桶 4 分，其次小桶 2 分。',
          ],
          [
            '06',
            '回家与换轮',
            '返回起点可选择下轮先手、酿酒师 +1、任一资源 +2 或金币 +2，每位只能选未占用的位置。最后一人返回时，若先手位仍空缺则必须选择先手。全部返回后补充市场并进入下一轮。',
          ],
          [
            '07',
            '最终结算',
            '最后一轮结束，先按酿酒师兑换率消耗领先资源，补足最落后的资源；再以每 10 金币推进最落后资源 1 步。最落后资源的正数位置乘以倍率，加上酒桶、酒桶特权与先手 1 分。并列最高分共享胜利。',
          ],
          [
            '08',
            '读懂生产轨道',
            '生产轨道起点不同：木材 0、酵母 −2、啤酒花 −4、水 −6、大麦 −8，酿酒师 −10。尚未到达 1 的资源终局按 0 分处理。资源超过 20 的每一步换为 1 金币；酿酒师停在 20。',
          ],
        ].map(([n, title, text]) => (
          <article key={n}>
            <span>{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
      <h3>酿酒师兑换表</h3>
      <table>
        <thead>
          <tr>
            <th>酿酒师位置</th>
            <th>兑换率</th>
            <th>倍率</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['未到 1', '5 : 1', '×2'],
            ['1–4', '4 : 1', '×3'],
            ['5–8', '3 : 1', '×3'],
            ['9–11', '3 : 1', '×4'],
            ['12–14', '2 : 1', '×4'],
            ['15–17', '2 : 1', '×5'],
            ['18–19', '2 : 1', '×6'],
            ['20', '1 : 1', '×6'],
          ].map((row) => (
            <tr key={row[0]}>
              {row.map((v) => (
                <td key={v}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        新局随机排列座次与先手，其他玩家按逆座次自动获得起始奖励。旧存档沿用原先的座次。图形与中文界面为本项目重新制作。
        <a href="https://www.rulespal.com/heaven-and-ale/rulebook" target="_blank" rel="noreferrer">
          查看基础版规则 ↗
        </a>
      </p>
    </div>
  );
}
function Results({ state }: { state: GameState }) {
  const results = state.players.map(calculateResult).sort((a, b) => b.total - a.total),
    highest = results[0].total;
  return (
    <div className="results">
      <div className="results-hero">
        <Trophy size={38} />
        <span className="eyebrow">THE FINEST ALE</span>
        <h2>
          {results
            .filter((r) => r.total === highest)
            .map((r) => state.players[r.player].name)
            .join('、')}
          {results.filter((r) => r.total === highest).length > 1 ? '并列获胜' : '酿出了最佳佳酿'}
        </h2>
        <p>悉心耕耘，终得醇香。每一分都有迹可循。</p>
      </div>
      <div className="result-cards">
        {results.map((r, i) => (
          <article key={r.player} className={r.total === highest ? 'winner' : ''}>
            <span className="rank">{r.total === highest ? '优胜' : `0${i + 1}`}</span>
            <Pawn player={r.player} />
            <h3>{state.players[r.player].name}</h3>
            <strong className="total-score">
              {r.total}
              <small>分</small>
            </strong>
            <dl>
              <dt>生产得分</dt>
              <dd>
                {r.minimum} × {r.multiplier} = {r.production}
              </dd>
              <dt>酒桶得分</dt>
              <dd>+{r.barrels}</dd>
              <dt>酒桶特权</dt>
              <dd>+{r.privilege}</dd>
              <dt>终局先手</dt>
              <dd>+{r.first}</dd>
            </dl>
          </article>
        ))}
      </div>
      {results.map((r) => (
        <details className="result-detail" key={r.player}>
          <summary>
            {state.players[r.player].name}的资源结算{' '}
            <span>
              {r.rate} : 1 兑换 · 使用 {r.coinsSpent} 金币 <ChevronDown size={15} />
            </span>
          </summary>
          <table>
            <thead>
              <tr>
                <th>资源</th>
                <th>结算前</th>
                <th>资源兑换后</th>
                <th>金币补步后</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCE_NAMES.map((name, i) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{r.before[i]}</td>
                  <td>{r.afterExchange[i]}</td>
                  <td>{r.afterCoins[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            完成 {r.exchanges.length} 次资源兑换；最低资源位置为 {r.minimum}，乘以酿酒师倍率{' '}
            {r.multiplier}，得到 {r.production} 生产分。
          </p>
          {r.exchanges.length > 0 && (
            <div className="exchange-list">
              {r.exchanges.map((e, i) => (
                <span key={i}>
                  {i + 1}. {e.from.map((c) => RESOURCE_NAMES[c]).join(' + ')} →{' '}
                  {RESOURCE_NAMES[e.to]} +1
                </span>
              ))}
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
function BarrelCollection({
  barrels,
  title,
  emptyText,
}: {
  barrels: Player['barrels'];
  title: string;
  emptyText?: string;
}) {
  return (
    <section className="barrel-collection" aria-label={title}>
      <div className="barrel-collection-heading">
        <h3>
          <Wine size={17} />
          {title}
        </h3>
        <span>
          {barrels.length} 桶 · {barrels.reduce((sum, b) => sum + b.points, 0)} 分
        </span>
      </div>
      {barrels.length ? (
        <ul>
          {barrels.map((b) => (
            <li key={b.goal}>
              <span className="collected-barrel">{b.points}</span>
              <div>
                <strong>{BARREL_GOALS[b.goal]}</strong>
                <small>
                  目标 {String(b.goal + 1).padStart(2, '0')} · {b.points === 4 ? '大桶' : '小桶'} ·{' '}
                  {b.points} 分
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyText ?? '尚未领取酒桶。'}</p>
      )}
      <small className="barrel-points-note">仅计酒桶基础分，酒桶特权加分在终局另计。</small>
    </section>
  );
}
function ActionPanel({
  state,
  dispatch,
  onGarden,
  onHome,
  selectedCells,
  paused,
  onResume,
  ready,
  draftCount,
  onUndo,
  onReset,
  onConfirm,
  before,
}: {
  state: GameState;
  dispatch: (a: Action) => void;
  onGarden: () => void;
  onHome: () => void;
  selectedCells: number[];
  paused: boolean;
  onResume: () => void;
  ready: boolean;
  draftCount: number;
  onUndo: () => void;
  onReset: () => void;
  onConfirm: () => void;
  before: Player;
}) {
  const phase = state.phase,
    p = state.players[state.turn],
    human = state.turn === 0,
    options = legalActions(state),
    phaseLabels: Record<string, string> = {
      setup: '选择起始修道院位置',
      move: '选择前进的位置',
      buy: '购入与种植',
      score: '选择计分方式',
      shed: '领取棚屋奖励',
      privilege: '选择特权奖励',
      home: '返回修道院',
      finished: '佳酿已成',
    };
  return (
    <aside className="action-sidebar" id="current-action" tabIndex={-1}>
      <section className="action-panel">
        <div className="action-panel-top">
          <span className="eyebrow">
            {phase.kind === 'finished' ? 'GAME COMPLETE' : human ? 'YOUR TURN' : 'OPPONENT TURN'}
          </span>
          <span className={`live-indicator ${!human ? 'ai' : ''}`} />
        </div>
        <h2>
          {phase.kind === 'finished'
            ? '本局酿造已完成'
            : human
              ? ready
                ? '确认本回合'
                : phaseLabels[phase.kind]
              : `${p.name}正在思考`}
        </h2>
        {human && phase.kind !== 'finished' && (draftCount > 0 || selectedCells.length > 0) && (
          <div className="turn-draft-controls">
            <span>
              {draftCount ? `${draftCount} 步待确认 · AI 正在等待` : '确认前，所有操作都可撤回'}
            </span>
            <div>
              <button
                className="secondary"
                disabled={!draftCount && !selectedCells.length}
                onClick={onUndo}
              >
                <Undo2 size={14} />
                撤回一步
              </button>
              <button
                className="text-button"
                disabled={!draftCount && !selectedCells.length}
                onClick={onReset}
              >
                <RotateCcw size={13} />
                重做本回合
              </button>
            </div>
          </div>
        )}
        {ready ? (
          <div className="turn-review">
            <p>检查花园、棋子位置和计分圆片。确认后才会提交结果并交给下一位玩家。</p>
            <dl>
              <dt>金币</dt>
              <dd>
                {before.coins} → {p.coins}
              </dd>
              <dt>种植板块</dt>
              <dd>
                {Object.keys(before.garden).length} → {Object.keys(p.garden).length}
              </dd>
              <dt>酿酒师</dt>
              <dd>
                {before.master} → {p.master}
              </dd>
              {RESOURCE_NAMES.map(
                (name, i) =>
                  p.resources[i] !== before.resources[i] && (
                    <div className="review-row" key={name}>
                      <dt>{name}</dt>
                      <dd>
                        {before.resources[i]} → {p.resources[i]}
                      </dd>
                    </div>
                  ),
              )}
              <dt>已用计分位</dt>
              <dd>
                {before.scored.length} → {p.scored.length}
              </dd>
              <dt>酒桶</dt>
              <dd>
                {before.barrels.length} → {p.barrels.length}
              </dd>
            </dl>
            {p.barrels.some((b) => !before.barrels.some((old) => old.goal === b.goal)) && (
              <BarrelCollection
                title="本回合新领取（待确认）"
                barrels={p.barrels.filter(
                  (b) => !before.barrels.some((old) => old.goal === b.goal),
                )}
              />
            )}
            <button className="primary full" disabled={paused} onClick={onConfirm}>
              <Check size={16} />
              确认本回合
            </button>
            {paused && (
              <button className="text-button full" onClick={onResume}>
                继续对局
              </button>
            )}
          </div>
        ) : phase.kind === 'finished' ? (
          <p>查看结算明细，回顾这次修道院之旅。</p>
        ) : paused ? (
          <div className="thinking">
            <Pause size={27} />
            <p>对局已暂停</p>
            <button className="primary" onClick={onResume}>
              <Play size={15} />
              继续对局
            </button>
          </div>
        ) : !human ? (
          <div className="thinking">
            <div className="thinking-avatar">
              <Pawn player={state.turn} />
              <LoaderCircle className="spin" size={39} />
            </div>
            <p>{phaseLabels[phase.kind]}</p>
            <small>你可以查看任意玩家的花园与资源。</small>
          </div>
        ) : (
          <>
            {phase.kind === 'move' && (
              <>
                <p>点击道路上高亮的格子，执行相应行动。你可以跳过格子，但不能后退。</p>
                <div className="action-tip">
                  <Sprout size={23} />
                  <div>
                    <strong>
                      {state.round <= 2
                        ? '先让花园运转起来'
                        : state.round <= 4
                          ? '让布局带来回报'
                          : '把收获变成佳酿'}
                    </strong>
                    <span>
                      {state.round <= 2
                        ? '阴面提供金币，阳面推进资源。别忘了预留下一次购买的钱。'
                        : state.round <= 4
                          ? '相邻修士与围合棚屋能带来额外激活，留意尚未使用的计分位。'
                          : '检查最落后的资源、可领取的酒桶，以及最后的计分机会。'}
                    </span>
                  </div>
                </div>
                <div className="turn-position">
                  <span>当前位置</span>
                  <b>{p.position < 0 ? '修道院起点' : `道路第 ${p.position + 1} 格`}</b>
                </div>
                <button className="secondary full" onClick={onHome}>
                  返回修道院，结束本轮 <ArrowRight size={15} />
                </button>
              </>
            )}
            {phase.kind === 'buy' && (
              <>
                <p>
                  在花园上方选择板块，再点空地种植。
                  {phase.bought
                    ? '你可以继续购买同格板块，或在底部确认并结束回合。'
                    : '本次至少需要购买一块。'}
                </p>
                <button className="secondary full" onClick={onGarden}>
                  <Sprout size={16} /> 选择板块并放入花园
                </button>
                {!state.market[phase.space].tiles.length && (
                  <div className="empty-state small">
                    <Check size={22} />
                    此处板块已全部售出
                  </div>
                )}
                <div className="wallet-note">
                  <Coins size={15} />
                  可用金币 <b>{p.coins}</b>
                  <span>已购 {phase.bought} 块</span>
                </div>
                {!options.some((a) => a.type === 'buy') && !phase.bought && (
                  <p className="warning">当前金币不足。出售下方未使用的特权卡，每张获得 3 金币。</p>
                )}
              </>
            )}
            {phase.kind === 'score' && (
              <>
                <p>选择要激活的板块。该计分位本局使用后不能再次使用。</p>
                <div className="choice-list">
                  {scoreOptions(state, phase.space).map((o) => (
                    <button
                      key={`${o.slot}${o.value}`}
                      onClick={() => dispatch({ type: 'score', ...o })}
                    >
                      <span className="choice-icon">
                        {o.slot[0] === 'm' ? (
                          <MonkIcon
                            monk={Number(o.slot[1])}
                            size={20}
                            color={MONK_COLORS[Number(o.slot[1])]}
                          />
                        ) : o.slot[0] === 'r' ? (
                          <ResourceIcon color={Number(o.slot[1])} size={22} />
                        ) : (
                          <b className="fertility-symbol">{o.value}</b>
                        )}
                      </span>
                      <span>
                        {slotName(o.slot, o.value)}
                        <small>
                          {o.slot[0] === 'm'
                            ? '触发该类修士的所有邻接板块'
                            : '激活所有符合条件的资源板块'}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {phase.kind === 'shed' && (
              <>
                <p>
                  {phase.tier === 1
                    ? '选择一块相邻板块。'
                    : phase.tier === 2
                      ? '选择位于相对两边的两块板块。'
                      : phase.tier === 3
                        ? '选择互不相邻的三块板块。'
                        : '选择任意四块相邻板块。'}
                  已获得酿酒师奖励，接下来立即激活所选板块。
                </p>
                <div className="shed-counter">
                  已选 <b>{selectedCells.length}</b> / {phase.tier}
                </div>
                <button
                  className="primary full"
                  disabled={
                    !shedOptions(phase.cell, phase.tier).some(
                      (a) =>
                        [...a].sort((a, b) => a - b).join(',') ===
                        [...selectedCells].sort((a, b) => a - b).join(','),
                    )
                  }
                  onClick={() => dispatch({ type: 'shed', cells: selectedCells })}
                >
                  预览激活
                </button>
                <details className="alternative-options">
                  <summary>或直接选择一组方向</summary>
                  <div className="choice-list">
                    {shedOptions(phase.cell, phase.tier).map((cells, i) => (
                      <button key={i} onClick={() => dispatch({ type: 'shed', cells })}>
                        {cells.map((c) => tileName(p.garden[c])).join(' + ')}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                </details>
              </>
            )}
            {phase.kind === 'privilege' && (
              <>
                <p>完成了一对计分位！选择一张未使用的特权卡，立即获得奖励。</p>
                <div className="choice-list privilege-options">
                  {options
                    .filter((a) => a.type === 'privilege' && a.card !== 'skip')
                    .map(
                      (a, i) =>
                        a.type === 'privilege' &&
                        a.card !== 'skip' && (
                          <button key={i} onClick={() => dispatch(a)}>
                            <span>
                              <b>
                                {CARD_INFO[a.card].name}
                                {a.color !== undefined ? ` · ${RESOURCE_NAMES[a.color]}` : ''}
                              </b>
                              <strong className="privilege-benefit">
                                {privilegePreview(state, a)}
                              </strong>
                              <small>{CARD_INFO[a.card].text}</small>
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ),
                    )}
                </div>
                <button
                  className="text-button full"
                  onClick={() => dispatch({ type: 'privilege', card: 'skip' })}
                >
                  放弃本次特权（不可补领）
                </button>
              </>
            )}
            {phase.kind === 'home' && (
              <>
                <p>选择一个尚未被占用的起点奖励。确认本回合后正式返回。</p>
                <div className="choice-list">
                  {options
                    .filter((a) => a.type === 'home')
                    .map(
                      (a, i) =>
                        a.type === 'home' && (
                          <button key={i} onClick={() => dispatch(a)}>
                            <span className="choice-icon">
                              {a.slot === 0 ? (
                                <Flag size={17} />
                              ) : a.slot === 1 ? (
                                <BrewerIcon size={20} />
                              ) : a.slot === 2 ? (
                                <ResourceIcon color={a.color!} size={17} />
                              ) : (
                                <Coins size={17} />
                              )}
                            </span>
                            <span>
                              {a.slot === 2 ? `${RESOURCE_NAMES[a.color!]} +2` : HOME_NAMES[a.slot]}
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ),
                    )}
                </div>
              </>
            )}
          </>
        )}
        {human && !ready && phase.kind !== 'finished' && phase.kind !== 'setup' && !paused && (
          <details className="emergency">
            <summary>
              <Coins size={15} />
              应急金币{' '}
              <span>
                {p.cards.length} 张可用 <ChevronDown size={13} />
              </span>
            </summary>
            <p>出售一张未使用的特权卡，获得 3 金币。确认本回合后，售出的卡不能再领取奖励。</p>
            {p.cards.map((card) => (
              <button
                className="sell-card"
                key={card}
                title={CARD_INFO[card].text}
                onClick={() => dispatch({ type: 'emergency', card })}
              >
                <span>{CARD_INFO[card].name}</span>
                <b>出售 +3</b>
              </button>
            ))}
            {!p.cards.length && <small>没有可出售的特权卡。</small>}
          </details>
        )}
      </section>
      <section className="side-journal">
        <div className="small-heading">
          <List size={15} />
          最近行动
        </div>
        {state.log
          .slice(-4)
          .reverse()
          .map((entry) => (
            <div className="mini-log" key={entry.id}>
              <span
                className="log-dot"
                style={{
                  background: entry.player === null ? '#c6bda9' : PLAYER_COLORS[entry.player],
                }}
              />
              <p>
                <b>{entry.player === null ? '修道院纪事' : state.players[entry.player].name}</b>
                {entry.text}
              </p>
            </div>
          ))}
      </section>
      <div className="side-quote">
        “耐心耕耘，佳酿自成。”<span>— 修道院手札</span>
      </div>
    </aside>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,a[href],[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function savedOpponentActivity(state: GameState): Activity[] {
  return state.log
    .filter((entry) => entry.player !== null && entry.player !== 0)
    .slice(-12)
    .reverse()
    .map((entry) => ({
      id: -entry.id - 1,
      player: entry.player!,
      round: entry.round,
      text: entry.text,
      changes: [],
    }));
}

function replayRoute() {
  if (location.hash === '#replays') return '';
  const match = /^#replay\/([0-9a-f-]{36})$/i.exec(location.hash);
  return match ? match[1] : null;
}
function ReplayBoard({ state }: { state: GameState }) {
  const [viewed, setViewed] = useState(0);
  const player = state.players[viewed] ?? state.players[0];
  return (
    <>
      {state.phase.kind === 'finished' && <Results state={state} />}
      <Market state={state} dispatch={() => {}} paused viewedPlayer={viewed} onHome={() => {}} />
      <div className="replay-player-tabs" aria-label="回放玩家视角">
        {state.players.map((p) => (
          <button
            className="secondary"
            key={p.id}
            aria-pressed={viewed === p.id}
            onClick={() => setViewed(p.id)}
          >
            {p.name} · {p.coins} 金币
          </button>
        ))}
      </div>
      <BoardViewport label="回放花园与生产计分板">
        <div className="player-mat garden-and-production">
          <ProductionBoard player={player}>
            <Garden
              player={player}
              state={state}
              selectedTile={null}
              dispatch={() => {}}
              selectedCells={[]}
              setSelectedCells={() => {}}
              paused
            />
          </ProductionBoard>
          <ScoringBoard player={player} state={state} dispatch={() => {}} disabled />
        </div>
      </BoardViewport>
      <div className="privilege-hand">
        <span>未使用的特权</span>
        {player.cards.map((card) => (
          <span className="hand-card" key={card} title={CARD_INFO[card].text}>
            {CARD_INFO[card].name}
          </span>
        ))}
        {!player.cards.length && <small>所有特权均已使用或出售</small>}
      </div>
      <BarrelCollection title="已领取酒桶" barrels={player.barrels} />
    </>
  );
}
export default function App() {
  const [replay, setReplay] = useState<string | null>(replayRoute);
  const latestSession = useRef<TurnSession | undefined>(undefined);
  useEffect(() => {
    startReplaySync();
    const update = () => {
      setReplay(replayRoute());
      setActive(false);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const [active, setActive] = useState(false);
  const [menuNotice, setMenuNotice] = useState('');
  const [boot, setBoot] = useState<{
    session: TurnSession;
    restored: boolean;
    error?: string;
    difficulty?: Difficulty;
  } | null>(null);
  if (replay !== null)
    return (
      <ReplayLibrary
        key={replay}
        initialId={replay || undefined}
        onExit={() => {
          history.replaceState(null, '', location.pathname + location.search);
          setReplay(null);
          setActive(false);
        }}
        renderBoard={(state) => <ReplayBoard state={state} />}
      />
    );
  return active && boot ? (
    <GameApp
      boot={boot}
      onSessionChange={(session) => {
        latestSession.current = session;
      }}
      onLeave={(session, notice = '') => {
        setMenuNotice(notice);
        setBoot({ session, restored: true });
        setActive(false);
      }}
    />
  ) : (
    <MainMenu
      rules={<Rules />}
      current={latestSession.current ?? boot?.session}
      onReplays={() => {
        location.hash = 'replays';
      }}
      notice={menuNotice}
      onLaunch={(session, restored, difficulty) => {
        setMenuNotice('');
        latestSession.current = session;
        setBoot({ session, restored, difficulty });
        setActive(true);
      }}
    />
  );
}

function GameApp({
  boot,
  onLeave,
  onSessionChange,
}: {
  onSessionChange: (session: TurnSession) => void;
  boot: { session: TurnSession; restored: boolean; error?: string; difficulty?: Difficulty };
  onLeave: (session: TurnSession, notice?: string) => void;
}) {
  const [session, setSession] = useState(() => attachRecording(boot.session)),
    [view, setView] = useState<'table' | 'goals' | 'journal' | 'rules'>('table'),
    [gardenPlayer, setGardenPlayer] = useState(0);
  const { visible: state, ready } = useMemo(() => inspectSession(session), [session]);
  const [opponentEvents, setOpponentEvents] = useState<Activity[]>(() =>
    savedOpponentActivity(boot.session.committed),
  );
  useEffect(() => {
    onSessionChange(session);
  }, [session]);
  useEffect(() => {
    if (session.replayId) enqueueRecording(session.committed, session.replayId);
  }, [session.committed, session.replayId]);
  const previousCommitted = useRef(session.committed);
  useEffect(() => {
    const before = previousCommitted.current;
    const after = session.committed;
    previousCommitted.current = after;
    if (before === after) return;
    if (before.seed !== after.seed || after.revision < before.revision) {
      setOpponentEvents(savedOpponentActivity(after));
      return;
    }
    if (before.turn !== 0 && after.revision === before.revision + 1) {
      const action = after.actions[after.actions.length - 1];
      if (action.type === 'endBuy') return;
      const event = describeActivity(before, after, action);
      setOpponentEvents((events) => [event, ...events].slice(0, 12));
    }
  }, [session.committed]);
  const [newPlayerCount, setNewPlayerCount] = useState<2 | 3 | 4>(
    state.players.length as 2 | 3 | 4,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    () => boot.difficulty ?? loadPreferences().difficulty,
  );
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>(
    () => loadPreferences().difficulty,
  );
  const aiRequest = useRef(0);
  const [selectedTile, setSelectedTile] = useState<string | null>(null),
    [selectedCells, setSelectedCells] = useState<number[]>([]),
    [paused, setPaused] = useState(false),
    [speed, setSpeed] = useState(() => loadPreferences().speed);
  const [modal, setModal] = useState<'settings' | 'new' | 'home' | null>(null),
    [toast, setToast] = useState(
      boot.error || (boot.restored ? '已恢复上次对局，可以继续酿造。' : ''),
    ),
    [saveStatus, setSaveStatus] = useState('已自动保存'),
    [saveEnabled, setSaveEnabled] = useState(!boot.error),
    [logFilter, setLogFilter] = useState('all');
  useEffect(() => {
    if (!savePreferences(difficulty, speed)) setToast('设置无法保存，下次打开可能恢复默认值。');
  }, [difficulty, speed]);
  const worker = useRef<Worker | null>(null),
    importInput = useRef<HTMLInputElement>(null);
  const dispatch = (action: Action) => {
    setSession((previous) => {
      try {
        return stageAction(previous, action);
      } catch (error) {
        setToast(error instanceof Error ? error.message : '操作失败，请重试。');
        return previous;
      }
    });
  };
  const undo = () => {
    if (selectedCells.length) {
      setSelectedCells((c) => c.slice(0, -1));
      return;
    }
    setSession(undoAction);
  };
  const reset = () => {
    setSelectedCells([]);
    setSession(resetTurn);
  };
  const confirm = () => {
    setSession((s) => (inspectSession(s).ready ? confirmTurn(s) : s));
    setToast(state.phase.kind === 'setup' ? '起始位置已确认。' : '本回合已确认。');
  };
  const confirmPurchase = () => {
    try {
      const completed = confirmTurn(stageAction(session, { type: 'endBuy' }));
      setSession(completed);
      setToast('购买已确认，本回合结束。');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '请先完成当前奖励选择。');
    }
  };
  useEffect(() => {
    worker.current = new Worker(new URL('./game/ai.worker.ts', import.meta.url), {
      type: 'module',
    });
    return () => {
      worker.current?.terminate();
    };
  }, []);
  useEffect(() => {
    if (
      session.draft.length ||
      state.turn === 0 ||
      state.phase.kind === 'finished' ||
      paused ||
      modal ||
      !worker.current
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const start = performance.now();
    const w = worker.current,
      requestId = ++aiRequest.current;
    w.onmessage = (
      event: MessageEvent<{ revision: number; requestId: number; action?: Action; error?: string }>,
    ) => {
      if (cancelled || event.data.requestId !== requestId || event.data.revision !== state.revision)
        return;
      if (event.data.error || !event.data.action) {
        setPaused(true);
        setToast(`AI 暂停：${event.data.error || '未返回行动'}。可点击继续重试。`);
        return;
      }
      const action = event.data.action;
      timer = setTimeout(
        () => {
          if (!cancelled)
            setSession((s) => {
              if (s.draft.length || s.committed.revision !== event.data.revision) return s;
              try {
                return advanceComputer(s, action);
              } catch (e) {
                setPaused(true);
                setToast(`AI 行动失败：${e instanceof Error ? e.message : '请重试'}`);
                return s;
              }
            });
        },
        Math.max(0, speed - (performance.now() - start)),
      );
    };
    w.onerror = () => {
      if (!cancelled) {
        setPaused(true);
        setToast('AI 工作线程中断，请刷新页面后从自动存档继续。');
      }
    };
    w.postMessage({ state, difficulty, requestId });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      w.onmessage = null;
    };
  }, [state, session, paused, speed, modal, difficulty]);
  useEffect(() => {
    if (!saveEnabled) {
      setSaveStatus('旧存档已保留');
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, serializeSession(session));
      setSaveStatus(session.draft.length ? '预操作已保存' : '已自动保存');
    } catch {
      setSaveStatus('保存失败 · 请导出备份');
    }
  }, [session, saveEnabled]);
  useEffect(() => {
    setSelectedCells([]);
    const phase = state.phase;
    if (phase.kind === 'buy') {
      setSelectedTile((previous) =>
        state.market[phase.space].tiles.some(
          (t) =>
            t.id === previous &&
            CELLS.some(
              (c) =>
                c.side !== 'shed' &&
                !state.players[0].garden[c.id] &&
                price(state, t, c.id, phase.space) <= state.players[0].coins,
            ),
        )
          ? previous
          : (state.market[phase.space].tiles.find((t) =>
              CELLS.some(
                (c) =>
                  c.side !== 'shed' &&
                  !state.players[0].garden[c.id] &&
                  price(state, t, c.id, phase.space) <= state.players[0].coins,
              ),
            )?.id ?? null),
      );
    } else setSelectedTile(null);
    if (state.turn === 0 && ['buy', 'shed'].includes(phase.kind)) setGardenPlayer(0);
  }, [state]);
  useEffect(() => {
    if (view !== 'table' || state.turn !== 0 || paused || modal) return;
    if (ready) return;
    if (state.phase.kind === 'buy') scrollToArea('purchase-area');
    else if (state.phase.kind === 'shed') scrollToArea('garden-area');
  }, [state.phase.kind, state.turn, ready, view, paused, modal]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const download = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportSave = () => {
    download(serializeSession(session), `天堂与美酒-第${state.round}轮-${state.seed}.json`);
    setToast('对局存档已导出。');
  };
  const importSave = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('存档文件过大。');
      const restored = deserializeSession(await file.text());
      previousCommitted.current = restored.committed;
      setOpponentEvents(savedOpponentActivity(restored.committed));
      setSession(attachRecording({ ...restored, replayId: undefined }));
      setSaveEnabled(true);
      setPaused(false);
      setModal(null);
      setView('table');
      setGardenPlayer(0);
      setToast('存档导入成功。');
    } catch (e) {
      setToast(`导入失败：${e instanceof Error ? e.message : '存档无效'}。当前对局未改变。`);
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };
  const newGame = () => {
    setDifficulty(newDifficulty);
    setOpponentEvents([]);
    const game = createGame(undefined, {
      playerCount: newPlayerCount,
      randomStart: true,
      chooseStartingPositions: true,
    });
    setSession(attachRecording({ committed: game, draft: [] }));
    setSaveEnabled(true);
    setPaused(false);
    setModal(null);
    setView('table');
    setGardenPlayer(0);
    setToast(`${newPlayerCount} 人对局开始，${game.players[game.turn].name}先手。`);
  };
  const inspectPlayer = (id: number) => {
    setGardenPlayer(id);
    setView('table');
    requestAnimationFrame(() => scrollToArea(id === 0 ? 'garden-area' : `player-board-${id}`));
  };
  const player = state.players[0],
    finished = state.phase.kind === 'finished',
    purchaseDone =
      state.turn === 0 && state.phase.kind === 'buy' && state.phase.bought > 0 && !selectedTile,
    showTurnDock =
      view === 'table' &&
      state.turn === 0 &&
      state.phase.kind !== 'setup' &&
      (state.phase.kind === 'buy' || ready);
  return (
    <div
      className={`app-shell ${view === 'table' ? 'tabletop-mode' : ''} ${showTurnDock ? 'has-turn-dock' : ''}`}
    >
      <nav className="rail" aria-label="主导航">
        <button className="brand-mark" onClick={() => setView('table')} aria-label="返回棋盘">
          <Home size={25} />
          <span>H&A</span>
        </button>
        <div className="rail-links">
          {(
            [
              { id: 'table', label: '棋盘', icon: Sprout },
              { id: 'goals', label: '酒桶', icon: Wine },
              { id: 'journal', label: '手札', icon: BookOpen },
              { id: 'rules', label: '规则', icon: CircleHelp },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? 'active' : ''}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          EST.
          <br />
          1516
        </div>
      </nav>
      <div className="page-shell">
        <header className="topbar">
          <div className="wordmark">
            天堂与美酒 <span>HEAVEN & ALE</span>
          </div>
          <div className="topbar-actions">
            <span className="save-status">
              <ShieldCheck size={14} />
              {saveStatus}
            </span>
            <button
              className="text-button"
              aria-label="对局菜单"
              onClick={() => setModal('settings')}
            >
              <Settings2 size={15} />
              <span>对局菜单</span>
            </button>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <div className="breadcrumb">
                修道院 <ChevronRight size={11} />{' '}
                {view === 'table'
                  ? `${state.players.length} 人对局`
                  : view === 'goals'
                    ? '酒桶目标'
                    : view === 'journal'
                      ? '行动手札'
                      : '游戏规则'}
              </div>
              <h1>
                {view === 'table'
                  ? '一方花园，一杯佳酿。'
                  : view === 'goals'
                    ? '让成就装满酒桶。'
                    : view === 'journal'
                      ? '每一步，都有回响。'
                      : '从第一粒大麦开始。'}
              </h1>
              <p>
                {view === 'table'
                  ? `经营你的修道院，在 ${roundsForPlayers(state.players.length)} 轮时光里酿出最好的啤酒。`
                  : view === 'goals'
                    ? '达成目标后，前往道路上的酒桶格领取奖励。'
                    : view === 'journal'
                      ? '记录每一次种植、收获与抉择。'
                      : '熟悉规则，在阳光与树荫间找到自己的节奏。'}
              </p>
            </div>
            <div className="session-meta">
              <span className="session-pill">
                <span /> 本地对局 · 你 + {state.players.length - 1} 位 AI
              </span>
              <div className="round-progress">
                {Array.from({ length: roundsForPlayers(state.players.length) }, (_, i) => (
                  <span key={i} className={i < state.round ? 'filled' : ''} />
                ))}
                <b>
                  {state.round} / {roundsForPlayers(state.players.length)} 轮
                </b>
              </div>
            </div>
          </div>
          <CloudStatus id={session.replayId} />
          {boot.error && !saveEnabled && (
            <div className="warning-banner">
              旧存档无法读取，当前局尚未自动保存。
              <button
                onClick={() => download(localStorage.getItem(SAVE_KEY) || '{}', '旧存档备份.json')}
              >
                导出旧存档
              </button>
              <button onClick={() => setSaveEnabled(true)}>保存当前新局</button>
            </div>
          )}
          {view === 'table' && state.phase.kind === 'setup' && (
            <StartingPositions
              state={state}
              ready={ready}
              paused={paused || !!modal}
              dispatch={dispatch}
              confirm={confirm}
              undo={undo}
            />
          )}
          <div className={`players-row players-count-${state.players.length}`}>
            {state.players.map((p) => (
              <button
                className={`player-card ${state.turn === p.id && !finished ? 'current' : ''} ${gardenPlayer === p.id ? 'viewing' : ''}`}
                key={p.id}
                onClick={() => inspectPlayer(p.id)}
                style={{ '--player': PLAYER_COLORS[p.id] } as CSSProperties}
                aria-label={`查看${p.name}的花园`}
                aria-pressed={gardenPlayer === p.id}
              >
                <div className="player-card-top">
                  <div className="player-avatar">
                    <span className="player-monogram">{PLAYER_MARKS[p.id]}</span>
                  </div>
                  <div>
                    <strong>
                      {p.name}
                      {p.id === 0 && <span>你的修道院</span>}
                    </strong>
                    <small>
                      {p.id === 0
                        ? '修道院长'
                        : ['', '沉稳的经营者', '细心的园艺师', '老练的酿酒师'][p.id]}
                    </small>
                  </div>
                  <span className={`player-status ${state.turn === p.id ? 'active' : ''}`}>
                    {finished
                      ? '已结算'
                      : p.home !== null
                        ? '已返回'
                        : state.turn === p.id
                          ? '行动中'
                          : p.id === 0
                            ? '你'
                            : 'AI'}
                  </span>
                </div>
                {gardenPlayer === p.id && (
                  <span className="viewing-label">
                    <Check size={12} /> 查看中
                  </span>
                )}
                <div className="player-card-stats">
                  <span>
                    <Coins size={15} />
                    <b>{p.coins}</b>
                    <small>金币</small>
                  </span>
                  <span>
                    <Wine size={15} />
                    <b>{p.barrels.length}</b>
                    <small>酒桶</small>
                  </span>
                  <span>
                    <Sprout size={15} />
                    <b>{Object.keys(p.garden).length}</b>
                    <small>板块</small>
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="seating-order" aria-label="行动座次">
            行动座次：
            {(state.turnOrder ?? state.players.map((p) => p.id)).map((id, index) => (
              <span key={id}>
                {index > 0 && ' → '}
                {state.players[id].name}
                {index === 0 && '（开局先手）'}
              </span>
            ))}
          </div>
          {view === 'table' && !finished && (
            <div className="turn-navigation" aria-label="当前回合导航">
              <div
                className={`navigation-round${state.round === roundsForPlayers(state.players.length) ? ' is-final' : ''}`}
                aria-live="polite"
                aria-label={`第 ${state.round} 轮，共 ${roundsForPlayers(state.players.length)} 轮${state.round === roundsForPlayers(state.players.length) ? '，最后一轮' : ''}`}
              >
                <span className="navigation-round-label">
                  {state.round === roundsForPlayers(state.players.length) ? '最后一轮' : '当前轮次'}
                </span>
                <span className="navigation-round-value" aria-hidden="true">
                  <b>{state.round}</b>
                  <span> / {roundsForPlayers(state.players.length)} 轮</span>
                </span>
                <span className="navigation-round-steps" aria-hidden="true">
                  {Array.from({ length: roundsForPlayers(state.players.length) }, (_, index) => (
                    <i key={index} className={index < state.round ? 'reached' : ''} />
                  ))}
                </span>
              </div>
              <div className="navigation-status" aria-live="polite">
                <strong>
                  {paused
                    ? '对局已暂停'
                    : state.turn !== 0
                      ? `${state.players[state.turn].name}正在行动`
                      : ready
                        ? '检查结果，确认本回合'
                        : state.phase.kind === 'setup'
                          ? '选择起始修道院位置'
                          : state.phase.kind === 'move'
                            ? '轮到你了 · 选择道路位置'
                            : state.phase.kind === 'buy'
                              ? purchaseDone
                                ? '购买完成 · 在底部确认本回合'
                                : '选择板块 → 点击花园空地'
                              : '完成当前奖励选择'}
                </strong>
                <small className="navigation-activity" title={opponentEvents[0]?.text}>
                  {session.draft.length
                    ? `${session.draft.length} 步待确认，可撤回`
                    : opponentEvents[0]
                      ? `${state.players[opponentEvents[0].player].name}：${opponentEvents[0].text}`
                      : state.phase.kind === 'setup'
                        ? '请在上方选择起始位置，确认前可重选'
                        : '点击高亮道路开始行动，确认前可撤回'}
                </small>
              </div>
              {!showTurnDock && (
                <button
                  className="primary"
                  onClick={() => {
                    const target =
                      state.phase.kind === 'setup'
                        ? 'starting-positions'
                        : state.turn !== 0
                          ? 'opponent-activity'
                          : paused
                            ? 'current-action'
                            : state.phase.kind === 'move'
                              ? 'market-area'
                              : state.phase.kind === 'shed'
                                ? 'garden-area'
                                : 'current-action';
                    if (target === 'garden-area') setGardenPlayer(0);
                    scrollToArea(target);
                  }}
                >
                  {state.turn !== 0
                    ? '查看对手行动'
                    : !paused && state.phase.kind === 'move'
                      ? '选择道路'
                      : '查看操作'}
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {view === 'table' && (
            <OpponentActivity
              state={state}
              events={opponentEvents}
              paused={paused}
              onPause={() => setPaused((value) => !value)}
              onInspect={inspectPlayer}
            />
          )}
          {view === 'table' && (
            <div className="game-layout">
              <div className="game-main">
                {finished && <Results state={state} />}
                <Market
                  state={state}
                  dispatch={dispatch}
                  paused={paused || ready}
                  onHome={() => {
                    if (state.phase.kind !== 'setup') setModal('home');
                  }}
                  viewedPlayer={gardenPlayer}
                />
                <div className="garden-section" id="garden-area" tabIndex={-1}>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">YOUR LITTLE CLOISTER</span>
                      <h2>
                        {player.name === '你' ? '我的' : `${player.name}的`}花园{' '}
                        <span>每一块土地，都值得悉心规划。</span>
                      </h2>
                    </div>
                  </div>
                  {state.turn === 0 && state.phase.kind === 'buy' && !paused && !ready && (
                    <div className="garden-purchase" id="purchase-area" tabIndex={-1}>
                      <div className="purchase-heading">
                        <strong>选一块板块，再点花园空地</strong>
                        <span>
                          <Coins size={15} /> {state.players[0].coins} 金币
                        </span>
                      </div>
                      <PurchasePicker
                        state={state}
                        selectedTile={selectedTile}
                        onSelect={(id) => {
                          setSelectedTile(id);
                          setGardenPlayer(0);
                        }}
                      />
                      {!selectedTile && (
                        <p className="purchase-empty" role="status">
                          {state.market[state.phase.space].tiles.length
                            ? '当前没有可放置的板块。可在操作栏出售特权补充金币，或在已购买后结束购买。'
                            : '此处板块已售完，在底部确认即可结束回合。'}
                        </p>
                      )}
                      <div className="purchase-heading">
                        <small>空地数字为费用 · 放置后可撤回</small>
                      </div>
                    </div>
                  )}
                  <BoardViewport label="花园与生产计分板">
                    <div className="garden-and-production player-mat">
                      <ProductionBoard
                        player={player}
                        before={session.draft.length ? session.committed.players[0] : undefined}
                      >
                        <Garden
                          player={player}
                          state={state}
                          selectedTile={selectedTile}
                          dispatch={dispatch}
                          selectedCells={selectedCells}
                          setSelectedCells={setSelectedCells}
                          paused={paused || ready}
                        />
                      </ProductionBoard>
                      <ScoringBoard
                        player={player}
                        state={state}
                        dispatch={dispatch}
                        disabled={paused || ready}
                      />
                    </div>
                  </BoardViewport>
                  <div className="privilege-hand">
                    <span>
                      <BookOpen size={15} />
                      未使用的特权
                    </span>
                    {player.cards.map((card) => (
                      <span key={card} className="hand-card" title={CARD_INFO[card].text}>
                        {CARD_INFO[card].name}
                      </span>
                    ))}
                    {!player.cards.length && <small>所有特权卡均已使用或出售</small>}
                  </div>
                  <BarrelCollection
                    title={session.draft.length ? '已领取酒桶（含待确认）' : '已领取酒桶'}
                    barrels={player.barrels}
                  />
                </div>
              </div>
              <ActionPanel
                onHome={() => {
                  if (state.phase.kind !== 'setup') setModal('home');
                }}
                state={state}
                dispatch={dispatch}
                onGarden={() => {
                  setGardenPlayer(0);
                  scrollToArea('purchase-area');
                }}
                selectedCells={selectedCells}
                paused={paused}
                onResume={() => setPaused(false)}
                ready={ready}
                draftCount={session.draft.length}
                onUndo={undo}
                onReset={reset}
                onConfirm={confirm}
                before={session.committed.players[0]}
              />
            </div>
          )}
          {view === 'table' && (
            <div className="opponent-boards">
              <div className="section-heading">
                <h2>
                  其他修道院 <span>依次查看对手的完整个人板</span>
                </h2>
                <button className="text-button" onClick={() => inspectPlayer(0)}>
                  回到我的花园
                </button>
              </div>
              {state.players
                .filter((opponent) => opponent.id !== 0)
                .map((opponent) => (
                  <section
                    className="garden-section opponent-board"
                    id={`player-board-${opponent.id}`}
                    tabIndex={-1}
                    key={opponent.id}
                  >
                    <div className="section-heading">
                      <h2>
                        <Pawn player={opponent.id} small /> {opponent.name}的修道院
                      </h2>
                      <span className="opponent-board-stats">
                        {opponent.coins} 金币 · {opponent.barrels.length} 酒桶 ·{' '}
                        {Object.keys(opponent.garden).length} 板块
                      </span>
                    </div>
                    <BoardViewport label={`${opponent.name}的完整个人板`}>
                      <div className="garden-and-production player-mat">
                        <ProductionBoard player={opponent}>
                          <Garden
                            player={opponent}
                            state={state}
                            selectedTile={null}
                            dispatch={dispatch}
                            selectedCells={[]}
                            setSelectedCells={setSelectedCells}
                            paused={true}
                          />
                        </ProductionBoard>
                        <ScoringBoard
                          player={opponent}
                          state={state}
                          dispatch={dispatch}
                          disabled={true}
                        />
                      </div>
                    </BoardViewport>
                    <div className="privilege-hand">
                      <span>未使用的特权</span>
                      {opponent.cards.map((card) => (
                        <span key={card} className="hand-card" title={CARD_INFO[card].text}>
                          {CARD_INFO[card].name}
                        </span>
                      ))}
                      {!opponent.cards.length && <small>所有特权卡均已使用或出售</small>}
                    </div>
                    <BarrelCollection title="已领取酒桶" barrels={opponent.barrels} />
                  </section>
                ))}
            </div>
          )}
          {view === 'goals' && (
            <section className="goals-section">
              <div className="section-heading">
                <h2>十二种酿酒成就</h2>
                <span className="muted">每个目标每人至多领取一次 · 大桶 4 分 / 小桶 2 分</span>
              </div>
              <div className="goals-grid">
                {BARREL_GOALS.map((goal, i) => (
                  <article
                    className={`goal-card ${goalMet(state.players[0], i) ? 'achieved' : ''}`}
                    key={i}
                  >
                    <span className="goal-number">{String(i + 1).padStart(2, '0')}</span>
                    <div className="goal-barrel">
                      <Wine size={31} />
                    </div>
                    <h3>{goal}</h3>
                    <div className="goal-supply">
                      <span className={state.barrelSupply[i] === 2 ? 'available' : ''}>
                        大桶 · 4 分
                      </span>
                      <span className={state.barrelSupply[i] > 0 ? 'available' : ''}>
                        小桶 · 2 分
                      </span>
                    </div>
                    <div className="goal-owners">
                      {state.players.map((p) => {
                        const owned = p.barrels.find((b) => b.goal === i);
                        return (
                          <span
                            key={p.id}
                            title={`${p.name}：${owned ? `已领取 ${owned.points} 分` : goalMet(p, i) ? '已达成，尚未领取' : '尚未达成'}`}
                          >
                            <Pawn player={p.id} small />
                            {owned ? (
                              <b>{owned.points}分</b>
                            ) : goalMet(p, i) ? (
                              <Check size={13} />
                            ) : (
                              <i>·</i>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {claimable(state, state.players[0]).includes(i) && (
                      <div className="goal-ready">
                        <Check size={12} />
                        你已达成，可前往酒桶格领取
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {view === 'journal' && (
            <section className="journal">
              <div className="section-heading">
                <h2>
                  修道院行动手札 <span>{state.log.length} 条记录</span>
                </h2>
                <select
                  aria-label="筛选行动玩家"
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                >
                  <option value="all">所有玩家</option>
                  {state.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {state.log
                .filter((e) => logFilter === 'all' || String(e.player) === logFilter)
                .slice()
                .reverse()
                .map((entry) => (
                  <div className="journal-row" key={entry.id}>
                    <span className="journal-round">第 {entry.round} 轮</span>
                    {entry.player !== null ? (
                      <Pawn player={entry.player} />
                    ) : (
                      <span className="system-icon">
                        <Home size={15} />
                      </span>
                    )}
                    <div>
                      <strong>
                        {entry.player === null ? '修道院纪事' : state.players[entry.player].name}
                      </strong>
                      <p>{entry.text}</p>
                    </div>
                    <small>#{String(entry.id + 1).padStart(3, '0')}</small>
                  </div>
                ))}
            </section>
          )}
          {view === 'rules' && <Rules />}
          <footer>
            <span>
              <Leaf size={13} /> HEAVEN & ALE <i /> 慢慢耕耘，好好酿酒。
            </span>
            <span>
              基础版 · {state.players.length} 人 {roundsForPlayers(state.players.length)} 轮
            </span>
          </footer>
        </main>
      </div>
      {showTurnDock && (
        <section className="turn-dock" aria-label="本回合结果与确认">
          <div className="turn-dock-summary" aria-live="polite">
            <strong>{ready ? '本回合结果' : '本次购买'}</strong>
            <div className="turn-dock-changes">
              <span>
                金币{' '}
                <b>
                  {session.committed.players[0].coins} → {state.players[0].coins}
                </b>
              </span>
              <span>
                种植{' '}
                <b>
                  {Object.keys(session.committed.players[0].garden).length} →{' '}
                  {Object.keys(state.players[0].garden).length}
                </b>
              </span>
              {state.players[0].master !== session.committed.players[0].master && (
                <span>
                  酿酒师{' '}
                  <b>
                    {session.committed.players[0].master} → {state.players[0].master}
                  </b>
                </span>
              )}
              {RESOURCE_NAMES.map(
                (name, index) =>
                  state.players[0].resources[index] !==
                    session.committed.players[0].resources[index] && (
                    <span key={name}>
                      {name}{' '}
                      <b>
                        {session.committed.players[0].resources[index]} →{' '}
                        {state.players[0].resources[index]}
                      </b>
                    </span>
                  ),
              )}
              {state.players[0].scored.length !== session.committed.players[0].scored.length && (
                <span>
                  已用计分位{' '}
                  <b>
                    {session.committed.players[0].scored.length} → {state.players[0].scored.length}
                  </b>
                </span>
              )}
              {state.players[0].barrels.length !== session.committed.players[0].barrels.length && (
                <span>
                  酒桶{' '}
                  <b>
                    {session.committed.players[0].barrels.length} →{' '}
                    {state.players[0].barrels.length}
                  </b>
                </span>
              )}
            </div>
            <small>
              {paused
                ? '对局已暂停，继续后可确认'
                : ready
                  ? '确认后交给下一位玩家'
                  : state.phase.kind === 'buy' && !state.phase.bought
                    ? '至少种植一块后即可确认'
                    : '可以继续种植，确认后交给下一位玩家'}
            </small>
          </div>
          <div className="turn-dock-actions">
            <button className="secondary" disabled={!session.draft.length} onClick={undo}>
              <Undo2 size={15} /> 撤回
            </button>
            {paused ? (
              <button className="primary" onClick={() => setPaused(false)}>
                <Play size={15} />
                继续对局
              </button>
            ) : (
              <button
                className="primary"
                disabled={!ready && (state.phase.kind !== 'buy' || !state.phase.bought)}
                onClick={ready ? confirm : confirmPurchase}
              >
                <Check size={16} />
                {ready ? '确认本回合' : '确认购买并结束回合'}
              </button>
            )}
          </div>
        </section>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => void importSave(e.target.files?.[0])}
      />
      {(modal === 'home' ||
        (view === 'table' && state.turn === 0 && state.phase.kind === 'home' && !ready)) && (
        <Modal
          title="返回修道院 · 选择奖励"
          onClose={() => {
            setModal(null);
            if (state.phase.kind === 'home') undo();
          }}
        >
          <p className="home-reward-help">选好奖励后，在底部确认本回合。关闭窗口可继续规划道路。</p>
          <HomeRewards
            state={state}
            onChoose={(action) => {
              try {
                const arrived =
                  state.phase.kind === 'home'
                    ? session
                    : stageAction(session, { type: 'move', space: TRACK_END });
                setSession(stageAction(arrived, action));
                setModal(null);
              } catch (error) {
                setToast(error instanceof Error ? error.message : '请选择可用奖励。');
              }
            }}
          />
        </Modal>
      )}
      {modal === 'settings' && (
        <Modal title="对局菜单" onClose={() => setModal(null)}>
          <div className="settings-content">
            <div className="setting-row">
              <div>
                <strong>AI 难度</strong>
                <p>对所有 AI 对手生效，从下一次决策开始。设置会保存在当前浏览器。</p>
              </div>
              <select
                aria-label="AI 难度"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option value="baseline">基线 · 原版 AI</option>
                <option value="normal">普通 · 改进评估</option>
                <option value="hard">困难 · 搜索与终局模拟</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>AI 行动速度</strong>
                <p>调整每一步行动的展示间隔。</p>
              </div>
              <select
                aria-label="AI 行动速度"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={2400}>慢速 · 2.4 秒</option>
                <option value={1200}>从容 · 1.2 秒</option>
                <option value={650}>标准 · 0.65 秒</option>
                <option value={100}>快速 · 0.1 秒</option>
              </select>
            </div>
            <div className="setting-row">
              <div>
                <strong>{paused ? '对局已暂停' : '暂停对局'}</strong>
                <p>暂停后可以安心阅读棋盘与规则。</p>
              </div>
              <button className="secondary" onClick={() => setPaused(!paused)}>
                {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? '继续' : '暂停'}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>保存与恢复</strong>
                <p>
                  正式对局与待确认操作都会自动保存，刷新后仍可撤回。导入会替换当前对局，建议先导出备份。
                </p>
              </div>
            </div>
            <div className="save-buttons">
              <button className="secondary" onClick={exportSave}>
                <Download size={16} />
                导出存档
              </button>
              <button className="secondary" onClick={() => importInput.current?.click()}>
                <Upload size={16} />
                导入存档
              </button>
            </div>
            <div className="setting-row new-session-row">
              <div>
                <strong>开启新对局</strong>
                <p>选择人数与难度，重新开始酿造。</p>
              </div>
              <button
                className="new-game-button"
                aria-label="新的一局"
                onClick={() => {
                  setNewDifficulty(difficulty);
                  setNewPlayerCount(state.players.length as 2 | 3 | 4);
                  setModal('new');
                }}
              >
                <Plus size={15} />
                <span>新的一局</span>
              </button>
            </div>
            <button
              className="secondary full"
              onClick={() => {
                try {
                  localStorage.setItem(SAVE_KEY, serializeSession(session));
                  onLeave(session);
                } catch {
                  setToast('保存失败，请先导出存档。也可以保留内存中的对局返回菜单。');
                  setSaveStatus('保存失败 · 请导出备份');
                }
              }}
            >
              <Home size={15} /> 保存并返回主菜单
            </button>
            {saveStatus.startsWith('保存失败') && (
              <button
                className="secondary full"
                onClick={() =>
                  onLeave(
                    session,
                    '当前进度未能写入浏览器存档，仅保留在本次页面中。请导出备份，刷新可能丢失进度。',
                  )
                }
              >
                返回主菜单（仅保留本次页面中的进度）
              </button>
            )}
            <p className="seed-label">
              对局种子：{state.seed} · 已执行 {state.revision} 个行动
            </p>
            <button className="primary full" onClick={() => setModal(null)}>
              回到修道院 <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {modal === 'new' && (
        <Modal title="开启新的一局" onClose={() => setModal(null)}>
          <div className="new-game-modal">
            <div className="new-game-illustration">
              <Sprout size={44} />
            </div>
            <h3>新的土地，新的佳酿。</h3>
            <fieldset className="player-count-options">
              <legend>对局人数（包含你）</legend>
              {([2, 3, 4] as const).map((count) => (
                <label key={count} className={newPlayerCount === count ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="player-count"
                    value={count}
                    checked={newPlayerCount === count}
                    onChange={() => setNewPlayerCount(count)}
                  />
                  <strong>{count} 人</strong>
                  <span>你 + {count - 1} 位 AI</span>
                  <small>{roundsForPlayers(count)} 轮</small>
                </label>
              ))}
            </fieldset>
            <div className="new-game-difficulty">
              <label htmlFor="new-game-difficulty">对手难度</label>
              <select
                id="new-game-difficulty"
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value as Difficulty)}
                aria-describedby="new-game-difficulty-help"
              >
                <option value="baseline">基线 · 原版 AI</option>
                <option value="normal">普通 · 改进评估</option>
                <option value="hard">困难 · 搜索与终局模拟</option>
              </select>
              <small id="new-game-difficulty-help">
                对本局所有 AI 生效，包括随机先手的对手。开局后仍可在对局设置中调整。
              </small>
            </div>
            <p>
              开局随机排列座次和先手，后续按座次轮流行动；每轮返回起点可争取下一轮先手。当前自动存档会被替换。
            </p>
            <button className="secondary full" onClick={exportSave}>
              <Download size={16} />
              先导出当前对局
            </button>
            <button className="primary full" onClick={newGame}>
              <Plus size={16} />
              开始新的一局
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
