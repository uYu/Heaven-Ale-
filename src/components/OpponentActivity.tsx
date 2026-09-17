import { Pause, Play, Eye, ChevronDown } from 'lucide-react';
import type { Activity } from '../game/activity.ts';
import { PLAYER_COLORS } from '../game/data.ts';
import type { GameState } from '../game/types.ts';

export function OpponentActivity({
  state,
  events,
  paused,
  onPause,
  onInspect,
}: {
  state: GameState;
  events: Activity[];
  paused: boolean;
  onPause: () => void;
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
        <span className="activity-caption">
          {paused
            ? '对局已暂停'
            : state.turn === 0
              ? '对手行动记录'
              : `${state.players[state.turn].name}正在行动`}
        </span>
        <button className="text-button" onClick={onPause}>
          {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? '继续对局' : '暂停'}
        </button>
      </div>
      <details className="activity-disclosure">
        <summary>
          <span>{latest ? latest.text : '尚无对手行动，等待第一步酿造。'}</span>
          <span className="activity-expand">
            详情 <ChevronDown size={14} />
          </span>
        </summary>
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
      </details>
    </section>
  );
}
