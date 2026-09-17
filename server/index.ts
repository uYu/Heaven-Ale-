import { resolve } from 'node:path';
import { createReplayServer } from './http.ts';
const port = Number(process.env.PORT || 3001);
const server = createReplayServer({
  databasePath: resolve(process.env.REPLAY_DB || 'data/replays.sqlite'),
  staticDir: resolve('dist'),
  capacity: Number(process.env.REPLAY_CAPACITY || 100000),
});
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`Replay server listening on port ${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
