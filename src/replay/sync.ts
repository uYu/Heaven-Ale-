import { recordingOf } from './model.ts';
import type { ReplayRecord } from './model.ts';
import type { TurnSession } from '../game/session.ts';
import type { GameState } from '../game/types.ts';

const QUEUE_KEY = 'heaven-and-ale.replay-outbox.v1';
const IDENTITY_KEY = 'heaven-and-ale.replay-owner.';
const RECEIPT_KEY = 'heaven-and-ale.replay-receipt.';
interface Pending {
  id: string;
  secret: string;
  record: ReplayRecord;
}
export type SyncStatus = { text: string; kind: 'pending' | 'saved' | 'error' };
const pending = new Map<string, Pending>();
const secrets = new Map<string, string>();
const receipts = new Map<string, { count: number; published: boolean }>();
const statuses = new Map<string, SyncStatus>();
let initialized = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let retryDelay = 2000;
const listeners = new Set<() => void>();
const blocked = new Set<string>();
const ID = /^[0-9a-f-]{36}$/i;
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function status(id: string, value: SyncStatus) {
  statuses.set(id, value);
  for (const fn of listeners) fn();
}
function persist() {
  const ok = write(QUEUE_KEY, JSON.stringify([...pending.values()]));
  if (!ok)
    for (const id of pending.keys())
      status(id, { kind: 'error', text: '上传缓存无法保存；请保持页面打开或导出本地存档' });
  return ok;
}
function schedule(delay: number) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, delay);
}
export function startReplaySync() {
  if (initialized) return;
  initialized = true;
  try {
    const restored: unknown = JSON.parse(read(QUEUE_KEY) || '[]');
    if (Array.isArray(restored))
      for (const item of restored) {
        if (
          item &&
          ID.test(item.id) &&
          /^[0-9a-f]{64}$/i.test(item.secret) &&
          item.record &&
          Array.isArray(item.record.actions)
        ) {
          pending.set(item.id, item);
          secrets.set(item.id, item.secret);
        }
      }
  } catch {
    /* A bad upload cache must not block the local game. */
  }
  window.addEventListener('online', retryUploads);
  // Persist synchronously on every enqueue; keepalive is only a best-effort final flush.
  window.addEventListener('pagehide', () => {
    void flush(true);
  });
  if (pending.size) schedule(100);
}
export function attachRecording(session: TurnSession): TurnSession {
  startReplaySync();
  if (session.replayId) {
    const secret = secrets.get(session.replayId) || read(IDENTITY_KEY + session.replayId);
    if (secret && /^[0-9a-f]{64}$/i.test(secret)) {
      secrets.set(session.replayId, secret);
      return session;
    }
  }
  // getRandomValues also works when accessing a server by IP over HTTP.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const secret = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  secrets.set(id, secret);
  write(IDENTITY_KEY + id, secret);
  return { ...session, replayId: id };
}
export function enqueueRecording(state: GameState, id: string) {
  startReplaySync();
  const secret = secrets.get(id) || read(IDENTITY_KEY + id);
  if (!secret) {
    status(id, { kind: 'error', text: '缺少上传凭证；本地存档仍然可用' });
    return;
  }
  let receipt = receipts.get(id);
  if (!receipt) {
    try {
      receipt = JSON.parse(read(RECEIPT_KEY + id) || 'null');
    } catch {
      /* retry safely */
    }
    if (receipt) receipts.set(id, receipt);
  }
  if (receipt && receipt.count >= state.actions.length) {
    status(id, {
      kind: 'saved',
      text: receipt.published ? '已公开回放' : '已保存到服务端 · 结束后公开',
    });
    return;
  }
  pending.set(id, { id, secret, record: recordingOf(state) });
  status(id, { kind: 'pending', text: '等待上传 · 本地进度已保留' });
  persist();
  schedule(state.phase.kind === 'finished' ? 0 : 1000);
}
export async function flush(keepalive = false) {
  if (running || !pending.size) return;
  running = true;
  let failed = false;
  try {
    for (const item of [...pending.values()]) {
      if (blocked.has(item.id)) continue;
      try {
        const response = await fetch(`/api/replays/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${item.secret}` },
          body: JSON.stringify(item.record),
          signal: AbortSignal.timeout(20000),
          keepalive,
        });
        const result = await response.json();
        if (!response.ok) {
          if ([400, 403, 409, 413, 415].includes(response.status)) blocked.add(item.id);
          throw new Error(result.error || '服务端暂不可用');
        }
        const receipt = {
          count: result.actionCount as number,
          published: result.published as boolean,
        };
        receipts.set(item.id, receipt);
        write(RECEIPT_KEY + item.id, JSON.stringify(receipt));
        if (pending.get(item.id) === item) pending.delete(item.id);
        persist();
        if (!pending.has(item.id))
          status(item.id, {
            kind: 'saved',
            text: receipt.published ? '已公开回放' : '已保存到服务端 · 结束后公开',
          });
      } catch (error) {
        failed = true;
        status(item.id, {
          kind: 'error',
          text: `上传未完成：${error instanceof Error && error.message !== 'Failed to fetch' ? error.message : '网络或服务暂不可用'}${blocked.has(item.id) ? '；请检查记录后手动重试' : '，将自动重试'}`,
        });
        if (!blocked.has(item.id)) break;
      }
    }
  } finally {
    running = false;
    if ([...pending.keys()].some((id) => !blocked.has(id)) && !keepalive) {
      retryDelay = failed ? Math.min(retryDelay * 2, 60000) : 1000;
      schedule(retryDelay);
    } else retryDelay = 2000;
  }
}
export function retryUploads() {
  blocked.clear();
  if (timer) clearTimeout(timer);
  timer = undefined;
  retryDelay = 2000;
  void flush();
}
export function getSyncStatus(id: string): SyncStatus {
  return statuses.get(id) ?? { kind: 'pending', text: '等待上传' };
}
export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
