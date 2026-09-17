import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Trophy,
} from 'lucide-react';
import { createTimeline, validateRecord } from '../replay/model.ts';
import type { PublicReplay, ReplaySummary } from '../replay/model.ts';
import type { GameState } from '../game/types.ts';
import '../replay.css';

async function getJSON<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '回放服务暂不可用。');
  return body;
}
export function ReplayLibrary({
  initialId,
  onExit,
  renderBoard,
}: {
  initialId?: string;
  onExit: () => void;
  renderBoard: (state: GameState) => ReactNode;
}) {
  const [id, setId] = useState(initialId);
  const [page, setPage] = useState(1);
  const [players, setPlayers] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<ReplaySummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [replay, setReplay] = useState<PublicReplay | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setReplay(null);
    setItems([]);
    const task = id
      ? getJSON<PublicReplay>(`/api/replays/${encodeURIComponent(id)}`, abort.signal).then(
          (value) => {
            const { record, state } = validateRecord(value.record);
            if (state.phase.kind !== 'finished') throw new Error('此对局尚未结束。');
            if (!abort.signal.aborted) setReplay({ ...value, record });
          },
        )
      : getJSON<{ items: ReplaySummary[]; hasMore: boolean }>(
          `/api/replays?page=${page}${players ? `&players=${players}` : ''}`,
          abort.signal,
        ).then((value) => {
          if (!abort.signal.aborted) {
            setItems(value.items);
            setHasMore(value.hasMore);
          }
        });
    task
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error && !/JSON|Unexpected token/.test(reason.message)
              ? reason.message
              : '回放服务尚未连接，请确认服务端已启动。',
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, page, players, refresh]);
  const open = (next?: string) => {
    setId(next);
    window.history.replaceState(null, '', next ? `#replay/${next}` : '#replays');
    window.scrollTo(0, 0);
  };
  return (
    <div className="replay-shell">
      <header className="replay-header">
        <button className="secondary" onClick={() => (id ? open() : onExit())}>
          <ArrowLeft size={16} />
          {id ? '所有回放' : '返回主菜单'}
        </button>
        <span>HEAVEN & ALE · PUBLIC ARCHIVE</span>
      </header>
      <main>
        <div className="replay-heading">
          <div>
            <span className="eyebrow">THE MONASTERY ARCHIVE</span>
            <h1>{id ? '重访一场酿造' : '公开对局回放'}</h1>
            <p>浏览所有玩家已完成的对局，逐步查看每一次选择。观看回放不会改变你的本地对局。</p>
          </div>
          {!id && (
            <label>
              对局人数
              <select
                aria-label="筛选回放人数"
                value={players}
                onChange={(e) => {
                  setPlayers(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部人数</option>
                <option value="2">2 人</option>
                <option value="3">3 人</option>
                <option value="4">4 人</option>
              </select>
            </label>
          )}
        </div>
        {loading && <p role="status">正在读取回放…</p>}
        {error && (
          <div className="replay-empty" role="alert">
            <p>{error}</p>
            <button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
              <RefreshCw size={16} />
              重新连接
            </button>
          </div>
        )}
        {!loading && !error && !id && (
          <>
            {!items.length && (
              <div className="replay-empty">
                <Trophy size={32} />
                <h2>还没有已公开的对局</h2>
                <p>完成一场游戏并成功上传后，它就会出现在这里。进行中的对局不会公开。</p>
              </div>
            )}
            <div className="replay-list">
              {items.map((item) => (
                <article className="replay-card" key={item.id}>
                  <span className="eyebrow">
                    {item.playerCount} 人对局 · {item.actionCount} 步
                  </span>
                  <h2>修道院纪事 · {item.id.slice(0, 8)}</h2>
                  <p>{new Date(item.publishedAt).toLocaleString('zh-CN')}</p>
                  <div className="replay-scores">
                    {item.scores.map((score, index) => (
                      <span key={index}>
                        {score.name}
                        <b>{score.total} 分</b>
                      </span>
                    ))}
                  </div>
                  <button className="primary" onClick={() => open(item.id)}>
                    <Play size={16} />
                    观看回放
                    <ArrowRight size={16} />
                  </button>
                </article>
              ))}
            </div>
            <div className="replay-pagination">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((n) => n - 1)}
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                className="secondary"
                disabled={!hasMore}
                onClick={() => setPage((n) => n + 1)}
              >
                下一页
              </button>
            </div>
          </>
        )}
        {replay && !loading && !error && (
          <ReplayPlayer key={replay.id} replay={replay} renderBoard={renderBoard} />
        )}
      </main>
    </div>
  );
}
function ReplayPlayer({
  replay,
  renderBoard,
}: {
  replay: PublicReplay;
  renderBoard: (state: GameState) => ReactNode;
}) {
  const timeline = useMemo(() => createTimeline(replay.record), [replay.record]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [copied, setCopied] = useState('');
  const total = replay.record.actions.length;
  const state = useMemo(() => {
    const at = timeline.at(step);
    return { ...at, players: at.players.map((p) => (p.id === 0 ? { ...p, name: '玩家' } : p)) };
  }, [timeline, step]);
  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((n) => n + 1), speed);
    return () => clearTimeout(timer);
  }, [step, playing, speed, total]);
  const seek = (next: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(total, next)));
  };
  return (
    <>
      <section className="replay-controls" aria-label="回放控制">
        <div className="replay-toolbar">
          <button
            className="secondary"
            aria-label="回到开局"
            disabled={step === 0}
            onClick={() => seek(0)}
          >
            <SkipBack size={17} />
          </button>
          <button className="secondary" disabled={step === 0} onClick={() => seek(step - 1)}>
            上一步
          </button>
          <button
            className="primary"
            onClick={() => {
              if (step === total) setStep(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? '暂停回放' : '播放回放'}
          </button>
          <button className="secondary" disabled={step === total} onClick={() => seek(step + 1)}>
            下一步
          </button>
          <button
            className="secondary"
            aria-label="跳到结局"
            disabled={step === total}
            onClick={() => seek(total)}
          >
            <SkipForward size={17} />
          </button>
          <select
            aria-label="回放速度"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={2000}>0.5×</option>
            <option value={1000}>1×</option>
            <option value={500}>2×</option>
            <option value={250}>4×</option>
          </select>
        </div>
        <label className="replay-progress">
          第 {step} / {total} 步 · 第 {state.round} 轮
          <input
            type="range"
            aria-label="回放进度"
            min={0}
            max={total}
            value={step}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </label>
        <p role="status">
          {step
            ? `${state.players[timeline.activities[step - 1].player].name}：${timeline.activities[step - 1].text}`
            : '开局准备：尚未执行任何行动。'}
        </p>
        {!!step && <small>{timeline.activities[step - 1].changes.join(' · ')}</small>}
        <div className="replay-toolbar">
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}${location.pathname}#replay/${replay.id}`,
                );
                setCopied('链接已复制');
              } catch {
                setCopied('请复制浏览器地址栏中的链接');
              }
            }}
          >
            <Copy size={15} />
            复制回放链接
          </button>
          <span role="status">{copied}</span>
        </div>
      </section>
      <details className="replay-action-list">
        <summary>行动目录 · 点击跳转</summary>
        <ol>
          {timeline.activities.map((activity, index) => (
            <li key={index}>
              <button
                aria-current={step === index + 1 ? 'step' : undefined}
                onClick={() => seek(index + 1)}
              >
                第 {activity.round} 轮 · {state.players[activity.player].name}：{activity.text}
              </button>
            </li>
          ))}
        </ol>
      </details>
      <div className="replay-board">{renderBoard(state)}</div>
    </>
  );
}
