import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createGame, applyAction } from '../src/game/engine.ts';
import { chooseAction as baseline } from '../src/game/ai.baseline.ts';

if (process.argv[2] !== '--case') {
  // Fresh processes prevent earlier searches' JIT/GC/RSS high-water marks from
  // contaminating later cases. Keep the original production source untouched.
  const cases = [];
  for (const seed of [71, 16000, 16003])
    for (const round of [1, 3, 6]) {
      const child = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          '--experimental-strip-types',
          new URL(import.meta.url).pathname,
          '--case',
          String(seed),
          String(round),
        ],
        { encoding: 'utf8' },
      );
      if (child.status !== 0) throw new Error(child.stderr || `Case failed: ${seed}/${round}`);
      cases.push(JSON.parse(child.stdout));
    }
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        note: 'MiB; heap/RSS sampled every 128 rule executions. RSS includes Node/V8/modules, not just the tree. Not a browser measurement.',
        cases,
      },
      null,
      2,
    ),
  );
} else {
  const seed = Number(process.argv[3]),
    round = Number(process.argv[4]);
  let state = createGame(seed);
  while (state.round < round) state = applyAction(state, baseline(state));
  const original = new URL('../src/game/ai.mcts.ts', import.meta.url);
  const directory = mkdtempSync(join(tmpdir(), 'heaven-ai-memory-'));
  try {
    let source = readFileSync(original, 'utf8').replace(
      /from '(\.\/[^']+)'/g,
      (_, path: string) => `from '${new URL(path, original).href}'`,
    );
    source = source.replace(
      'budget.used++;',
      'budget.used++; if (budget.used % 128 === 0) sampleMemory();',
    );
    source = source.replace(
      'const plan = best?.plan ?? [fallback];',
      `sampleMemory(); memoryStats.treeNodes = tree.size;
      for (const n of tree.values()) memoryStats.treeEdges += n.edges.length;
      const plan = best?.plan ?? [fallback];`,
    );
    source += `
export const memoryStats = { heapPeak: 0, rssPeak: 0, samples: 0, treeNodes: 0, treeEdges: 0 };
export function sampleMemory() {
  const m = process.memoryUsage();
  memoryStats.heapPeak = Math.max(memoryStats.heapPeak, m.heapUsed);
  memoryStats.rssPeak = Math.max(memoryStats.rssPeak, m.rss);
  memoryStats.samples++;
}
`;
    const copy = join(directory, 'ai.memory.ts');
    writeFileSync(copy, source);
    const instrumented = await import(pathToFileURL(copy).href);
    global.gc?.();
    const before = process.memoryUsage();
    instrumented.sampleMemory();
    const started = performance.now();
    const result = instrumented.searchTree(state);
    const elapsedMs = performance.now() - started;
    const after = process.memoryUsage();
    const highWaterRSS = process.resourceUsage().maxRSS * 1024;
    global.gc?.();
    const collected = process.memoryUsage();
    const mib = (bytes: number) => Number((bytes / 1024 ** 2).toFixed(2));
    console.log(
      JSON.stringify({
        seed,
        round,
        nodes: result.nodes,
        simulations: result.simulations,
        depth: result.depth,
        treeNodes: instrumented.memoryStats.treeNodes,
        treeEdges: instrumented.memoryStats.treeEdges,
        samples: instrumented.memoryStats.samples,
        elapsedMs: Math.round(elapsedMs),
        heapBeforeMiB: mib(before.heapUsed),
        sampledHeapPeakMiB: mib(instrumented.memoryStats.heapPeak),
        sampledHeapIncreaseMiB: mib(instrumented.memoryStats.heapPeak - before.heapUsed),
        heapAfterMiB: mib(after.heapUsed),
        heapAfterGCMiB: mib(collected.heapUsed),
        rssBeforeMiB: mib(before.rss),
        sampledRSSPeakMiB: mib(instrumented.memoryStats.rssPeak),
        processRSSHighWaterMiB: mib(highWaterRSS),
        rssAfterGCMiB: mib(collected.rss),
      }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
