import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Check,
  Circle,
  FlaskConical,
  Flower2,
  LockKeyhole,
  Sprout,
  TreePine,
  Wheat,
  Droplets,
} from 'lucide-react';
import {
  CARD_INFO,
  RESOURCE_COLORS,
  RESOURCE_NAMES,
  SCORE_PAIRS,
  masterLevel,
  slotName,
} from '../game/data.ts';
import { BrewerIcon, MonkIcon, MONK_COLORS, MONK_LABELS } from './MonkIcon.tsx';
import { scoreOptions } from '../game/engine.ts';
import type { Action, GameState, Player, Slot } from '../game/types.ts';

export function trackPoint(position: number) {
  if (position <= 0) return { x: 74, y: 126 - position * 66 };
  if (position <= 12) return { x: 74 + (position - 1) * 68, y: 60 };
  if (position <= 14) return { x: 822, y: 60 + (position - 12) * 74 };
  return { x: 822 - (position - 14) * 68, y: 208 };
}
const icons = [TreePine, FlaskConical, Flower2, Droplets, Wheat];
function ResourceMark({ index, size = 18 }: { index: number; size?: number }) {
  const Icon = index === 5 ? BrewerIcon : icons[index];
  return <Icon size={size} aria-hidden="true" />;
}
const startPositions = [0, -2, -4, -6, -8, -10];
function positionText(position: number) {
  return position < 1 ? `起始段 ${position} · 距 1 还差 ${1 - position} 步` : `第 ${position} 格`;
}
const masterStages = [
  { min: -10, max: 0, label: '未到 1' },
  { min: 1, max: 4, label: '1–4 格' },
  { min: 5, max: 8, label: '5–8 格' },
  { min: 9, max: 11, label: '9–11 格' },
  { min: 12, max: 14, label: '12–14 格' },
  { min: 15, max: 17, label: '15–17 格' },
  { min: 18, max: 19, label: '18–19 格' },
  { min: 20, max: 20, label: '20 格' },
];
const stageFills = [
  '#e9e6da',
  '#ead39f',
  '#d9dfb4',
  '#bcd5c7',
  '#b8d5df',
  '#c8c4e0',
  '#ddc0ce',
  '#efbf98',
];
const stageEdges = [
  '#928b76',
  '#997135',
  '#7c8438',
  '#3e7e64',
  '#397889',
  '#726197',
  '#965776',
  '#ab6238',
];
function stageIndex(position: number) {
  return masterStages.findIndex((s) => position >= s.min && position <= s.max);
}
export function ProductionBoard({
  player,
  before,
  children,
}: {
  player: Player;
  before?: Player;
  children: ReactNode;
}) {
  const positions = [...player.resources, player.master],
    oldPositions = before ? [...before.resources, before.master] : positions;
  const colors = [...RESOURCE_COLORS, '#ae5146'],
    names = [...RESOURCE_NAMES, '酿酒师'];
  const level = masterLevel(player.master),
    path = Array.from({ length: 31 }, (_, i) => trackPoint(i - 10))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  return (
    <section className="production-board" aria-label={`${player.name}的生产轨道`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE BREWING TRACK</span>
          <h2>
            生产轨道 <span>五种资源与酿酒师共用 · 沿箭头前进</span>
          </h2>
        </div>
        <div className="track-current-level">
          兑换 <b>{level.rate}:1</b>
          <i />
          计分 <b>×{level.multiplier}</b>
        </div>
      </div>
      <details className="exchange-guide" aria-label="酿酒师兑换与计分档位">
        <summary className="exchange-current">
          <ResourceMark index={5} />
          <strong>酿酒师在 {player.master} 格</strong>
          <span>
            当前兑换 <b>{level.rate}:1</b> · 计分 <b>×{level.multiplier}</b>
          </span>
          <small className="exchange-toggle">兑换规则</small>
        </summary>
        <div className="exchange-stages">
          {masterStages.map((stage) => {
            const value = masterLevel(stage.min),
              active = player.master >= stage.min && player.master <= stage.max;
            return (
              <div
                key={stage.min}
                className={active ? 'active' : ''}
                aria-current={active ? 'step' : undefined}
              >
                <small>{stage.label}</small>
                <strong>{value.rate}:1</strong>
                <span>计分 ×{value.multiplier}</span>
                <em>{active ? '当前档位' : '酿酒师位置'}</em>
              </div>
            );
          })}
        </div>
        <p>
          <b>n:1</b>：终局将领先资源合计后退 n 步，换最落后资源前进 1 步。<b>×倍率</b>
          ：平衡后的最低资源位置 × 倍率，得到生产分（最低未到 1 时为 0 分）。
        </p>
      </details>
      <div className="mobile-production" aria-label="资源位置表">
        <div className="mobile-production-grid">
          <div className="mobile-track-row mobile-track-numbers">
            <span className="mobile-track-name">位置 →</span>
            {Array.from({ length: 31 }, (_, i) => (
              <span key={i}>{i - 10}</span>
            ))}
          </div>
          {positions.map((pos, i) => (
            <div
              className="mobile-track-row"
              key={i}
              style={{ '--marker': colors[i] } as CSSProperties}
            >
              <span className="mobile-track-name">
                <ResourceMark index={i} />
                {names[i]}
                <b>{pos}</b>
              </span>
              {Array.from({ length: 31 }, (_, n) => (
                <span
                  key={n}
                  style={
                    {
                      '--band-fill': stageFills[stageIndex(n - 10)],
                      borderLeft: masterStages.some((s) => s.min === n - 10)
                        ? `2px solid ${stageEdges[stageIndex(n - 10)]}`
                        : undefined,
                    } as CSSProperties
                  }
                  className={`${n - 10 === pos ? 'has-marker' : ''} ${oldPositions[i] !== pos && n - 10 === oldPositions[i] ? 'was-marker' : ''}`}
                  title={`${names[i]} · ${n - 10}`}
                >
                  {n - 10 === pos ? <ResourceMark index={i} size={16} /> : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="player-mat-canvas">
        <svg
          viewBox="0 0 900 980"
          className="physical-track"
          role="img"
          aria-label={`生产轨道，${names.map((name, i) => `${name}${positionText(positions[i])}`).join('；')}`}
        >
          <defs>
            <pattern id="woodgrain" width="26" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M0 4Q8 0 26 5M0 8Q12 3 26 8"
                fill="none"
                stroke="#ad8966"
                strokeOpacity=".09"
              />
            </pattern>
            <marker
              id="track-arrow"
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
            >
              <path d="M0 0L5 2.5 0 5Z" fill="#968165" />
            </marker>
          </defs>
          <rect x="34" y="16" width="828" height="233" rx="16" fill="#e4d7bb" />
          <rect x="36" y="80" width="77" height="760" rx="12" fill="#e4d7bb" />
          <rect x="118" y="105" width="668" height="60" rx="6" fill="#faf7ed" />
          <polyline points={path} fill="none" stroke="#b5a485" strokeWidth="4" />
          {Array.from({ length: 31 }, (_, i) => i - 10).map((n) => {
            const { x, y } = trackPoint(n),
              start = startPositions.indexOf(n),
              occupied = positions.includes(n),
              band = stageIndex(n);
            return (
              <g key={n} className="production-space" data-position={n}>
                <title>
                  {n >= 1
                    ? `第 ${n} 格 · 酿酒师兑换 ${masterLevel(n).rate}:1，倍率 ×${masterLevel(n).multiplier}`
                    : `起始段 ${n}${start >= 0 ? ` · ${names[start]}起点` : ''}`}
                </title>
                <rect
                  x={x - 29}
                  y={y - (n <= 0 ? 15 : 31)}
                  width="58"
                  height={n <= 0 ? 30 : 62}
                  rx={n <= 0 ? 10 : 5}
                  fill={stageFills[band]}
                  stroke={stageEdges[band]}
                  strokeWidth={occupied ? 2.5 : 1.3}
                />
                {n > 0 && (
                  <rect
                    x={x - 27}
                    y={y - 29}
                    width="54"
                    height="58"
                    rx="4"
                    fill="url(#woodgrain)"
                  />
                )}
                <text
                  x={n <= 0 ? x - 20 : x}
                  y={n <= 0 ? y + 4 : y - 12}
                  textAnchor={n <= 0 ? 'start' : 'middle'}
                  fill={n <= 0 ? '#999687' : '#705c40'}
                  fontSize={n <= 0 ? 9 : 18}
                  fontFamily="Georgia,serif"
                >
                  {n}
                </text>
                {start >= 0 && (
                  <text
                    x={x + 20}
                    y={y + 4}
                    textAnchor="middle"
                    fontSize="8"
                    fill={colors[start]}
                    opacity=".65"
                  >
                    起
                  </text>
                )}
                {n > 0 && n < 12 && (
                  <path d={`M${x + 30} ${y}h6`} stroke="#968165" markerEnd="url(#track-arrow)" />
                )}
                {n < 0 && <path d={`M${x} ${y - 15}v-3`} stroke="#968165" />}
              </g>
            );
          })}
          <path
            d="M822 92v14M822 165v9M793 208h-8M74 108V96"
            stroke="#968165"
            fill="none"
            markerEnd="url(#track-arrow)"
          />
          {[
            { from: 1, to: 4 },
            { from: 5, to: 8 },
            { from: 9, to: 11 },
          ].map(({ from, to }) => {
            const left = trackPoint(from).x - 29,
              right = trackPoint(to).x + 29,
              center = (left + right) / 2,
              band = stageIndex(from),
              value = masterLevel(from);
            return (
              <g key={from} className="track-band" data-range={`${from}-${to}`}>
                <path
                  d={`M${left} 93v7H${right}v-7M${center} 100v7`}
                  fill="none"
                  stroke={stageEdges[band]}
                  strokeWidth="2.5"
                />
                <rect
                  x={left}
                  y="108"
                  width={right - left}
                  height="47"
                  rx="5"
                  fill={stageFills[band]}
                  stroke={stageEdges[band]}
                />
                <text
                  x={center}
                  y="125"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="#514b38"
                >
                  {from}–{to} 格
                </text>
                <text
                  x={center}
                  y="146"
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="700"
                  fill="#514b38"
                >
                  {value.rate}:1 · ×{value.multiplier}
                </text>
              </g>
            );
          })}
          {[5, 9, 12].map((n) => {
            const x = trackPoint(n).x - 34;
            return <path key={n} d={`M${x} 23v72`} stroke="#64573f" strokeWidth="3" />;
          })}
          <path d="M788 22h69v222h-69" fill="none" stroke={stageEdges[4]} strokeWidth="3" />
          <text
            x="821"
            y="12"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill={stageEdges[4]}
          >
            12–14 格 · 2:1 · ×4
          </text>
          {[
            { from: 15, to: 17 },
            { from: 18, to: 19 },
            { from: 20, to: 20 },
          ].map(({ from, to }) => {
            const left = trackPoint(to).x - 29,
              right = trackPoint(from).x + 29,
              center = (left + right) / 2,
              band = stageIndex(from),
              value = masterLevel(from);
            return (
              <g key={from} className="track-band" data-range={`${from}-${to}`}>
                <path
                  d={`M${left} 241v7H${right}v-7`}
                  fill="none"
                  stroke={stageEdges[band]}
                  strokeWidth="2.5"
                />
                <text
                  x={center}
                  y="265"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={stageEdges[band]}
                >
                  {from === to ? `${from} 格` : `${from}–${to} 格`} · {value.rate}:1 · ×
                  {value.multiplier}
                </text>
                <path d={`M${right + 5} 175v66`} stroke="#64573f" strokeWidth="3" />
              </g>
            );
          })}
          <text x="136" y="191" fontSize="12" fill="#8f967c">
            起始段：5:1 · ×2
          </text>
          <text x="136" y="210" fontSize="10" fill="#9a9f8e">
            资源未到达 1，终局生产分为 0
          </text>
          {oldPositions.map((pos, i) => {
            if (pos === positions[i]) return null;
            const point = trackPoint(pos);
            return (
              <g key={`old${i}`} opacity=".65">
                <rect
                  x={point.x - 12}
                  y={point.y - 5}
                  width="24"
                  height="20"
                  rx="3"
                  fill="none"
                  stroke={colors[i]}
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
                <title>
                  {names[i]}操作前位置：{pos}
                </title>
              </g>
            );
          })}
          {positions.map((pos, i) => {
            const point = trackPoint(pos),
              colocated = positions.map((n, id) => ({ n, id })).filter((p) => p.n === pos),
              order = colocated.findIndex((p) => p.id === i),
              count = colocated.length;
            const tokenSize = count === 1 ? 28 : count === 2 ? 25 : 18;
            const x =
                point.x +
                (count === 1
                  ? 0
                  : ((order % 3) - (Math.min(count, 3) - 1) / 2) * (count === 2 ? 27 : 19)),
              y =
                point.y + (pos > 0 ? 6 : 0) + (count > 3 ? (Math.floor(order / 3) - 0.5) * 19 : 0);
            const MarkerIcon = i === 5 ? BrewerIcon : icons[i];
            return (
              <g
                key={i}
                className="production-marker"
                data-marker={names[i]}
                data-position={pos}
                transform={`translate(${x},${y})`}
              >
                <title>
                  {names[i]}：{positionText(pos)}
                </title>
                <rect
                  x={-tokenSize / 2}
                  y={-tokenSize / 2}
                  width={tokenSize}
                  height={tokenSize}
                  rx={i === 5 ? tokenSize / 2 : 3}
                  fill={colors[i]}
                  stroke="#fff8e8"
                  strokeWidth="1.3"
                />
                <MarkerIcon
                  x={-tokenSize * 0.38}
                  y={-tokenSize * 0.38}
                  width={tokenSize * 0.76}
                  height={tokenSize * 0.76}
                  color="#fffaf0"
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </svg>
        <div className="mat-garden">{children}</div>
      </div>
      <div className="mat-token-key">
        {positions.map((pos, i) => (
          <span key={i} style={{ color: colors[i] }}>
            <ResourceMark index={i} size={16} />
            {names[i]} <b>{pos}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
function ScoreSymbol({ slot }: { slot: Slot }) {
  if (slot === 'number') return <span className="number-symbol">1–5</span>;
  if (slot[0] === 'm')
    return (
      <>
        <MonkIcon monk={Number(slot[1])} size={25} />
        <b>{['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][Number(slot[1])]}</b>
      </>
    );
  const Icon = icons[Number(slot[1])];
  return <Icon size={28} />;
}
export function ScoringBoard({
  player,
  state,
  dispatch,
  disabled,
}: {
  player: Player;
  state: GameState;
  dispatch: (action: Action) => void;
  disabled: boolean;
}) {
  const [numberOpen, setNumberOpen] = useState(false);
  const options =
    state.phase.kind === 'score' && state.turn === 0 && player.id === 0 && !disabled
      ? scoreOptions(state, state.phase.space)
      : [];
  const choose = (slot: Slot) => {
    if (slot === 'number') {
      setNumberOpen(!numberOpen);
      return;
    }
    dispatch({ type: 'score', slot });
  };
  return (
    <section className="physical-scoring" aria-label={`${player.name}的计分板`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">SCORING & PRIVILEGES</span>
          <h2>计分与特权</h2>
        </div>
        <span className="disc-counter">
          <Circle size={12} /> {player.scored.length} / 10
        </span>
      </div>
      <p className="scoring-hint">圆片落入凹槽后即用过。每组两格填满，可获得一次特权。</p>
      <div className="physical-pairs">
        {SCORE_PAIRS.map((pair, index) => {
          const reward = player.privileges[index],
            complete = pair.every((slot) => player.scored.includes(slot));
          return (
            <div className={`physical-pair ${complete ? 'completed' : ''}`} key={index}>
              <div className="scoring-sockets">
                {pair.map((slot) => {
                  const used = player.scored.includes(slot),
                    available = options.some((o) => o.slot === slot),
                    color =
                      slot[0] === 'r'
                        ? RESOURCE_COLORS[Number(slot[1])]
                        : slot === 'number'
                          ? '#a9955e'
                          : MONK_COLORS[Number(slot[1])];
                  return (
                    <button
                      className={`scoring-socket ${used ? 'filled' : ''} ${available ? 'available' : ''}`}
                      style={{ '--socket': color } as CSSProperties}
                      disabled={!available}
                      key={slot}
                      onClick={() => choose(slot)}
                      aria-label={`${slotName(slot)}计分位，${used ? '已使用' : available ? '可计分' : '未使用'}`}
                      title={`${slotName(slot)} · ${used ? '本局已使用' : available ? '点击预览计分' : '整局只能使用一次'}`}
                    >
                      <span className="socket-type">
                        {slot === 'number' ? 'A' : slot[0] === 'r' ? 'C' : 'B'}
                      </span>
                      <span className="socket-art">
                        <ScoreSymbol slot={slot} />
                        {used && (
                          <span className="placed-disc">
                            <Check size={19} />
                          </span>
                        )}
                      </span>
                      <span className="socket-label">
                        {slot === 'number'
                          ? '同一肥力'
                          : slot[0] === 'm'
                            ? MONK_LABELS[Number(slot[1])]
                            : RESOURCE_NAMES[Number(slot[1])]}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="pair-connector">
                <span />
                <Sprout size={15} />
                <span />
              </div>
              <div className={`privilege-pocket ${reward && reward !== 'skip' ? 'claimed' : ''}`}>
                <small>特权 {['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'][index]}</small>
                {reward && reward !== 'skip' ? (
                  <>
                    <Check size={16} />
                    <b>{CARD_INFO[reward].name}</b>
                  </>
                ) : reward === 'skip' ? (
                  <>
                    <LockKeyhole size={16} />
                    <b>已放弃</b>
                  </>
                ) : (
                  <>
                    <span className="empty-card-icon">✧</span>
                    <span>{complete ? '等待选择特权' : '完成此配对'}</span>
                  </>
                )}
                {reward && reward !== 'skip' && (
                  <span className="pocket-description">{CARD_INFO[reward].text}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {numberOpen && options.some((o) => o.slot === 'number') && (
        <div className="fertility-choice">
          <strong>选择要激活的肥力</strong>
          <div>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                disabled={!options.some((o) => o.slot === 'number' && o.value === value)}
                onClick={() => {
                  dispatch({ type: 'score', slot: 'number', value });
                  setNumberOpen(false);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="scoring-key">
        <span>
          <b>A</b> 按肥力
        </span>
        <span>
          <b>B</b> 触发修士
        </span>
        <span>
          <b>C</b> 按资源
        </span>
      </div>
    </section>
  );
}
