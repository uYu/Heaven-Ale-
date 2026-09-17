import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  Leaf,
  Play,
  Plus,
  Settings2,
  Sprout,
  Upload,
  Users,
  Wine,
} from 'lucide-react';
import { createGame } from '../game/engine.ts';
import { roundsForPlayers } from '../game/data.ts';
import { deserializeSession, SAVE_KEY, serializeSession } from '../game/storage.ts';
import type { TurnSession } from '../game/session.ts';
import type { Difficulty } from '../game/ai.ts';
import { loadPreferences, savePreferences } from '../game/preferences.ts';
import '../menu.css';

function readSave(current?: TurnSession) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return {
      session: current ?? (raw ? deserializeSession(raw) : null),
      raw,
      savedAt: raw ? JSON.parse(raw).savedAt : null,
      error: '',
    };
  } catch {
    return {
      session: current ?? null,
      raw: null,
      savedAt: null,
      error: current
        ? '浏览器存储不可用，当前进度仅保留在本次页面中。'
        : '无法读取本地存档。原始数据会保留，直到你开始新局或导入存档。',
    };
  }
}
function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '天堂与美酒-存档.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function DifficultySelect({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}) {
  return (
    <select
      aria-label="AI 难度"
      value={value}
      onChange={(event) => onChange(event.target.value as Difficulty)}
    >
      <option value="baseline">基线 · 原版 AI</option>
      <option value="normal">普通 · 改进评估</option>
      <option value="hard">困难 · 搜索与终局模拟</option>
    </select>
  );
}
export function MainMenu({
  rules,
  current,
  notice,
  onLaunch,
  onReplays,
}: {
  onReplays: () => void;
  rules: ReactNode;
  current?: TurnSession;
  notice?: string;
  onLaunch: (session: TurnSession, restored: boolean, difficulty?: Difficulty) => void;
}) {
  const [page, setPage] = useState<'home' | 'start' | 'new' | 'rules' | 'settings'>('home');
  const [saved] = useState(() => readSave(current));
  const [preferences, setPreferences] = useState(loadPreferences);
  const [difficulty, setDifficulty] = useState(preferences.difficulty);
  const [count, setCount] = useState<2 | 3 | 4>(4);
  const [message, setMessage] = useState(notice || saved.error);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [page]);
  const updatePreferences = (next: typeof preferences) => {
    setPreferences(next);
    setDifficulty(next.difficulty);
    if (!savePreferences(next.difficulty, next.speed))
      setMessage('设置无法保存，本次页面仍可使用。');
  };
  const exportSave = () => {
    try {
      const raw = saved.session ? serializeSession(saved.session) : localStorage.getItem(SAVE_KEY);
      if (raw) download(raw);
      else setMessage('当前没有可以导出的存档。');
    } catch {
      setMessage('无法访问浏览器存档。');
    }
  };
  const importSave = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('文件过大');
      const session = deserializeSession(await file.text());
      if (
        (saved.session || saved.error) &&
        !window.confirm('导入将替换当前本地存档。确定导入并进入游戏？')
      )
        return;
      onLaunch({ ...session, replayId: undefined }, true);
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : '存档无效'}。`);
    } finally {
      if (input.current) input.current.value = '';
    }
  };
  const title = {
    home: '天堂与美酒',
    start: '继续你的酿造',
    new: '开启新的修道院',
    rules: '从第一粒大麦开始',
    settings: '让游戏合乎你的节奏',
  }[page];
  return (
    <div className={`main-menu ${page === 'rules' ? 'menu-wide' : ''}`}>
      <header className="menu-header">
        <span>
          <Sprout size={20} /> HEAVEN & ALE
        </span>
        <small>本地桌游 · 2–4 人</small>
      </header>
      <main className="menu-layout">
        <section className="menu-content">
          {page !== 'home' && (
            <button
              className="menu-back"
              onClick={() => setPage(page === 'new' && saved.session ? 'start' : 'home')}
            >
              <ArrowLeft size={16} /> 返回{page === 'new' && saved.session ? '开始游戏' : '主菜单'}
            </button>
          )}
          <span className="eyebrow">
            {page === 'home' ? 'A LITTLE CLOISTER. A GREAT ALE.' : 'THE MONASTERY'}
          </span>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {page === 'home' && (
            <>
              <p className="menu-subtitle">
                一方花园，一杯佳酿。
                <br />
                在阳光与树荫之间，经营属于你的修道院。
              </p>
              <div className="menu-actions">
                <button
                  className="menu-primary"
                  onClick={() => setPage(saved.session ? 'start' : 'new')}
                >
                  <Play size={20} /> 开始游戏 <ArrowRight size={18} />
                </button>
                <button onClick={onReplays}>
                  <Play size={20} />
                  公开对局回放
                  <ArrowRight size={16} />
                </button>
                <button onClick={() => setPage('rules')}>
                  <BookOpen size={20} /> 规则介绍 <ArrowRight size={16} />
                </button>
                <button onClick={() => setPage('settings')}>
                  <Settings2 size={20} /> 设置 <ArrowRight size={16} />
                </button>
              </div>
              <div className="menu-online">
                <Users size={17} />
                <span>联机对局</span>
                <small>敬请期待</small>
              </div>
              <p className="menu-footnote">无需账号 · 对局自动上传，结束后公开回放</p>
            </>
          )}
          {page === 'start' && saved.session && (
            <>
              <div className="menu-save-card">
                <span className="eyebrow">YOUR LAST VISIT</span>
                <h2>
                  {saved.session.committed.phase.kind === 'finished'
                    ? '上局已经酿成'
                    : '你的修道院正在等你'}
                </h2>
                <p>
                  {saved.session.committed.players.length} 人对局 · 第{' '}
                  {saved.session.committed.round} /{' '}
                  {roundsForPlayers(saved.session.committed.players.length)} 轮
                </p>
                {saved.session.draft.length > 0 && (
                  <p>{saved.session.draft.length} 步待确认操作，继续后仍可撤回</p>
                )}
                {saved.savedAt && !Number.isNaN(Date.parse(saved.savedAt)) && (
                  <small>上次保存：{new Date(saved.savedAt).toLocaleString('zh-CN')}</small>
                )}
              </div>
              <div className="menu-actions">
                <button className="menu-primary" onClick={() => onLaunch(saved.session!, true)}>
                  <Play size={19} />
                  {saved.session.committed.phase.kind === 'finished' ? '查看上局结果' : '继续游戏'}
                  <ArrowRight size={18} />
                </button>
                <button onClick={() => setPage('new')}>
                  <Plus size={19} /> 新建游戏 <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {page === 'new' && (
            <div className="menu-form">
              <p>选择同桌的对手，开始一段新的酿造时光。</p>
              <fieldset className="player-count-options">
                <legend>对局人数（包含你）</legend>
                {([2, 3, 4] as const).map((n) => (
                  <label className={count === n ? 'selected' : ''} key={n}>
                    <input
                      type="radio"
                      name="players"
                      checked={count === n}
                      onChange={() => setCount(n)}
                    />
                    <strong>{n} 人</strong>
                    <span>你 + {n - 1} 位 AI</span>
                    <small>{roundsForPlayers(n)} 轮</small>
                  </label>
                ))}
              </fieldset>
              <label className="menu-field">
                对手难度
                <DifficultySelect value={difficulty} onChange={setDifficulty} />
              </label>
              <p className="menu-footnote">
                随机座次与先手，随后逆时针选择起始位置。已确认行动自动保存到服务端，对局结束后所有人都可观看回放。
              </p>
              {(saved.session || saved.error) && (
                <div className="menu-save-card">
                  <p>开始新局将替换原来的自动存档。返回不会改变原对局。</p>
                  <button className="secondary" onClick={exportSave}>
                    <Download size={16} /> 先导出旧存档
                  </button>
                </div>
              )}
              <button
                className="menu-primary"
                onClick={() => {
                  savePreferences(difficulty, preferences.speed);
                  onLaunch(
                    {
                      committed: createGame(undefined, {
                        playerCount: count,
                        randomStart: true,
                        chooseStartingPositions: true,
                      }),
                      draft: [],
                    },
                    false,
                    difficulty,
                  );
                }}
              >
                <Sprout size={19} /> 开始新的一局 <ArrowRight size={18} />
              </button>
            </div>
          )}
          {page === 'rules' && <div className="menu-rules">{rules}</div>}
          {page === 'settings' && (
            <div className="menu-form">
              <label className="menu-field">
                默认 AI 难度
                <DifficultySelect
                  value={preferences.difficulty}
                  onChange={(value) => updatePreferences({ ...preferences, difficulty: value })}
                />
              </label>
              <label className="menu-field">
                AI 行动速度
                <select
                  value={preferences.speed}
                  onChange={(event) =>
                    updatePreferences({ ...preferences, speed: Number(event.target.value) })
                  }
                >
                  <option value={2400}>慢速 · 2.4 秒</option>
                  <option value={1200}>从容 · 1.2 秒</option>
                  <option value={650}>标准 · 0.65 秒</option>
                  <option value={100}>快速 · 0.1 秒</option>
                </select>
              </label>
              <div className="menu-save-card">
                <h2>存档与恢复</h2>
                <p>
                  进度保存在当前浏览器。换设备前可导出
                  JSON，再在另一台设备导入。清除浏览器数据会删除本地存档。
                </p>
                <div className="save-buttons">
                  <button className="secondary" onClick={exportSave}>
                    <Download size={16} /> 导出存档
                  </button>
                  <button className="secondary" onClick={() => input.current?.click()}>
                    <Upload size={16} /> 导入并进入游戏
                  </button>
                </div>
              </div>
            </div>
          )}
          {message && (
            <div className="menu-notice" role="status">
              {message}
              {saved.error && (
                <button className="secondary" onClick={exportSave}>
                  导出旧存档
                </button>
              )}
            </div>
          )}
        </section>
        {page !== 'rules' && (
          <aside className="menu-art" aria-hidden="true">
            <div className="menu-art-sun" />
            <div className="menu-arch">
              <div className="menu-art-title">
                THE
                <br />
                LITTLE
                <br />
                <em>CLOISTER</em>
              </div>
              <div className="menu-garden">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i}>
                    {i % 3 === 0 ? <Wine /> : i % 3 === 1 ? <Sprout /> : <Leaf />}
                  </span>
                ))}
              </div>
              <p>种植 · 收获 · 酿造</p>
            </div>
            <span className="menu-art-caption">一切佳酿，始于一粒种子。</span>
          </aside>
        )}
      </main>
      <footer className="menu-footer">
        天堂与美酒 <span>HEAVEN & ALE</span>
      </footer>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => void importSave(event.target.files?.[0])}
      />
    </div>
  );
}
