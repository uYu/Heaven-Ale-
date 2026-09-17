import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { ApiError, openReplayStore } from './replays.ts';
import { REPLAY_RULES } from '../src/replay/model.ts';

export function createReplayServer({
  databasePath,
  staticDir,
  capacity = 100000,
  rateLimit = 120,
}: {
  databasePath: string;
  staticDir?: string;
  capacity?: number;
  rateLimit?: number;
}) {
  const store = openReplayStore(databasePath, capacity);
  const clients = new Map<string, { at: number; count: number }>();
  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  }
  async function body(req: IncomingMessage) {
    return new Promise<unknown>((resolveBody, reject) => {
      let bytes = 0;
      let tooLarge = false;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        if (tooLarge) return;
        bytes += chunk.length;
        if (bytes > 512 * 1024) {
          tooLarge = true;
          chunks.length = 0;
          reject(new ApiError(413, '对局记录过大。'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      req.on('error', reject);
      req.on('end', () => {
        if (tooLarge) return;
        try {
          resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new ApiError(400, '请求不是有效 JSON。'));
        }
      });
    });
  }
  const server = createServer(
    { requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 },
    async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname === '/api/health' && req.method === 'GET')
          return json(res, 200, { ok: true, rules: REPLAY_RULES });
        if (url.pathname === '/api/replays' && req.method === 'GET') {
          const page = Number(url.searchParams.get('page') ?? 1);
          const count = url.searchParams.has('players')
            ? Number(url.searchParams.get('players'))
            : undefined;
          if (
            !Number.isInteger(page) ||
            page < 1 ||
            page > 5000 ||
            (count !== undefined && ![2, 3, 4].includes(count))
          )
            throw new ApiError(400, '分页或人数参数无效。');
          return json(res, 200, store.list(page, count));
        }
        const match = /^\/api\/replays\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (match && req.method === 'GET') return json(res, 200, store.get(match[1]));
        if (match && req.method === 'PUT') {
          // No cookies are used; write access requires a per-game secret never returned publicly.
          if (!req.headers['content-type']?.startsWith('application/json'))
            throw new ApiError(415, '需要 JSON 请求。');
          const now = Date.now();
          for (const [key, entry] of clients) if (now - entry.at > 60000) clients.delete(key);
          // Only trust forwarded IP when explicitly deployed behind the bundled reverse proxy.
          const ip =
            process.env.TRUST_PROXY === '1'
              ? String(req.headers['x-real-ip'] || req.socket.remoteAddress)
              : req.socket.remoteAddress || 'unknown';
          const entry = clients.get(ip) ?? { at: now, count: 0 };
          if (++entry.count > rateLimit) throw new ApiError(429, '上传较频繁，请稍后重试。');
          if (clients.size > 10000 && !clients.has(ip))
            throw new ApiError(503, '服务繁忙，请稍后重试。');
          clients.set(ip, entry);
          const secret = req.headers.authorization?.replace(/^Bearer /, '') || '';
          return json(res, 200, store.upload(match[1], secret, await body(req)));
        }
        if (url.pathname.startsWith('/api/')) throw new ApiError(404, '接口不存在。');
        if (!staticDir || !['GET', 'HEAD'].includes(req.method || ''))
          throw new ApiError(404, '页面不存在。');
        const root = resolve(staticDir);
        let path = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (path !== root && !path.startsWith(root + sep)) throw new ApiError(404, '页面不存在。');
        if (!existsSync(path) || statSync(path).isDirectory()) {
          if (extname(path)) throw new ApiError(404, '文件不存在。');
          path = resolve(root, 'index.html');
        }
        if (!existsSync(path)) throw new ApiError(404, '请先构建网页。');
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
          '.json': 'application/json',
        };
        res.writeHead(200, {
          'Content-Type': types[extname(path)] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': path.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        });
        if (req.method === 'HEAD') res.end();
        else
          createReadStream(path)
            .on('error', () => res.destroy())
            .pipe(res);
      } catch (error) {
        if (res.headersSent || res.destroyed) return;
        json(res, error instanceof ApiError ? error.status : 500, {
          error: error instanceof ApiError ? error.message : '服务暂时无法保存，请稍后重试。',
        });
        if (!(error instanceof ApiError))
          console.error(
            'Replay service error:',
            error instanceof Error ? error.message : 'unknown',
          );
      }
    },
  );
  server.on('close', () => store.close());
  return server;
}
