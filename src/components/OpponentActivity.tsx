import { Pause, Play, Eye } from 'lucide-react';
import type { Activity } from '../game/activity.ts';
import { PLAYER_COLORS } from '../game/data.ts';
import type { GameState } from '../game/types.ts';

export function OpponentActivity({
  state,
  events,
  paused,
  speed,
  onPause,
  onSpeed,
  onInspect,
}: {
  state: GameState;
  events: Activity[];
  paused: boolean;
  speed: number;
  onPause: () => void;
  onSpeed: (speed: number) => void;
  onInspect: (player: number) => void;
}) {
  const latest = events[0];
  return (
    <section
      id="opponent-activity"
      tabIndex={-1}
      className="opponent-activity"
      aria-label="对手行动播报"
    >
      <div className="activity-heading">
        <div>
          <strong>对手行动</strong>
          <span>
            {paused
              ? '已暂停，可以慢慢查看'
              : state.turn === 0
                ? '轮到你了，行动记录仍保留'
                : `${state.players[state.turn].name}正在行动`}
          </span>
        </div>
        <div className="activity-controls">
          <select
            aria-label="对手行动展示速度"
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
          >
            <option value={2400}>慢速 · 2.4 秒</option>
            <option value={1200}>从容 · 1.2 秒</option>
            <option value={650}>标准 · 0.65 秒</option>
            <option value={100}>快速 · 0.1 秒</option>
          </select>
          <button className="secondary" onClick={onPause}>
            {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? '继续对局' : '暂停查看'}
          </button>
        </div>
      </div>
      {latest ? (
        <>
          <article
            className="activity-latest"
            style={{ borderLeftColor: PLAYER_COLORS[latest.player] }}
          >
            <div className="activity-meta">
              <strong>{state.players[latest.player].name}</strong>
              <span>第 {latest.round} 轮 · 最近一步</span>
            </div>
            <p>{latest.text}</p>
            {!!latest.changes.length && (
              <div className="activity-changes">
                {latest.changes.map((change) => (
                  <span key={change}>{change}</span>
                ))}
              </div>
            )}
            <button className="text-button" onClick={() => onInspect(latest.player)}>
              <Eye size={14} />
              查看{state.players[latest.player].name}的花园
            </button>
          </article>
          <details className="activity-history">
            <summary>回看最近 {events.length} 步对手行动</summary>
            <ol>
              {events.map((event) => (
                <li key={event.id}>
                  <div className="activity-meta">
                    <strong>{state.players[event.player].name}</strong>
                    <span>第 {event.round} 轮</span>
                  </div>
                  <p>{event.text}</p>
                  {!!event.changes.length && <small>{event.changes.join(' · ')}</small>}
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : (
        <p className="activity-empty">
          尚无对手行动记录。对手开始行动后，这里会逐步展示他们的移动、购买和收益。
        </p>
      )}
    </section>
  );
}
