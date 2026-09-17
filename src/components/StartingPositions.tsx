import { Check, Sprout, Undo2 } from 'lucide-react';
import { HOME_NAMES, RESOURCE_NAMES } from '../game/data.ts';
import { legalActions } from '../game/engine.ts';
import type { Action, GameState } from '../game/types.ts';

export function StartingPositions({
  state,
  ready,
  paused,
  dispatch,
  confirm,
  undo,
}: {
  state: GameState;
  ready: boolean;
  paused: boolean;
  dispatch: (action: Action) => void;
  confirm: () => void;
  undo: () => void;
}) {
  const order = state.turnOrder!;
  const pending = ready ? state.actions.at(-1) : undefined;
  const human = state.turn === 0 && !paused && !ready;
  const actions = human ? legalActions(state) : [];
  return (
    <section
      id="starting-positions"
      tabIndex={-1}
      className="starting-positions"
      aria-label="选择起始修道院位置"
    >
      <span className="eyebrow">BEFORE THE FIRST HARVEST</span>
      <h2>
        <Sprout size={23} /> 选择起始修道院位置
      </h2>
      <p>
        {state.players[order[0]].name}
        为先手，已占据先手位，不领取即时奖励。其余玩家逆时针选择不同的位置，随后按顺时针开始游戏。
      </p>
      <p>
        选择顺序：
        {order
          .slice(1)
          .reverse()
          .map((id) => state.players[id].name)
          .join(' → ')}
      </p>
      <strong role="status">
        {paused
          ? '对局已暂停'
          : ready
            ? '检查奖励，确认起始位置'
            : state.turn === 0
              ? '轮到你选择起始奖励'
              : `${state.players[state.turn].name}正在选择起始位置`}
      </strong>
      {pending?.type === 'start' && (
        <p className="starting-selected">
          已选奖励：
          {pending.slot === 2 ? `${RESOURCE_NAMES[pending.color!]} +2` : HOME_NAMES[pending.slot]}
          （确认后生效）
        </p>
      )}
      <div className="starting-position-grid">
        {HOME_NAMES.map((name, slot) => {
          const owner = state.startingSlots?.indexOf(slot) ?? -1;
          return (
            <div className={`starting-position ${owner >= 0 ? 'taken' : ''}`} key={slot}>
              <h3>{slot === 0 ? '先手位' : name}</h3>
              <p>
                {owner >= 0
                  ? `${state.players[owner].name}${ready && owner === 0 ? ' · 待确认' : '已选择'}`
                  : '空闲位置'}
              </p>
              {slot === 0 ? (
                <small>无即时奖励 · 首个行动</small>
              ) : slot === 2 ? (
                <div className="home-resource-choices">
                  {RESOURCE_NAMES.map((resource, color) => (
                    <button
                      className="secondary"
                      key={resource}
                      disabled={
                        !actions.some(
                          (a) => a.type === 'start' && a.slot === slot && a.color === color,
                        )
                      }
                      onClick={() => dispatch({ type: 'start', slot, color })}
                    >
                      {resource} +2
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className="secondary"
                  disabled={!actions.some((a) => a.type === 'start' && a.slot === slot)}
                  onClick={() => dispatch({ type: 'start', slot })}
                >
                  选择{name}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {ready && (
        <div className="save-buttons">
          <button className="secondary" onClick={undo}>
            <Undo2 size={16} /> 重新选择
          </button>
          <button className="primary" disabled={paused} onClick={confirm}>
            <Check size={16} /> 确认起始位置
          </button>
        </div>
      )}
    </section>
  );
}
