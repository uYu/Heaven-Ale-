import { chooseAction as baseline } from '../src/game/ai.baseline.ts';
import { solveEndgame } from '../src/game/ai.endgame.ts';
import { createHardAgent } from '../src/game/ai.search.ts';
import { applyAction, assertInvariants, calculateResult, createGame } from '../src/game/engine.ts';

const count = Number(process.argv[2] ?? 20);
const start = Number(process.argv[3] ?? 12000);
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(start))
  throw new Error('Usage: benchmark-endgame.ts count startSeed');
let improved = 0,
  tied = 0,
  gain = 0,
  totalMs = 0,
  maxMs = 0;
for (let seed = start; seed < start + count; seed++) {
  let s = createGame(seed);
  while (s.phase.kind !== 'finished') {
    const solo = s.players.every((p, i) => i === s.turn || p.home !== null);
    const began = performance.now();
    const solved = solo ? solveEndgame(s, 8000) : undefined;
    const elapsed = performance.now() - began;
    if (solved?.solved) {
      const seat = s.turn;
      const previous = createHardAgent({ endgame: false });
      let old = s,
        current = s;
      while (old.phase.kind !== 'finished') {
        old = applyAction(old, previous(old));
        assertInvariants(old);
      }
      for (const action of solved.plan) {
        current = applyAction(current, action);
        assertInvariants(current);
      }
      const oldScore = calculateResult(old.players[seat]).total;
      const newScore = calculateResult(current.players[seat]).total;
      if (newScore < oldScore) throw new Error('Exact solver lost to previous search');
      if (newScore > oldScore) improved++;
      else tied++;
      gain += newScore - oldScore;
      totalMs += elapsed;
      maxMs = Math.max(maxMs, elapsed);
      console.log(JSON.stringify({ seed, seat, oldScore, newScore, nodes: solved.nodes }));
      break;
    }
    s = applyAction(s, baseline(s));
  }
}
console.log(
  JSON.stringify(
    {
      start,
      seeds: count,
      improved,
      tied,
      gain,
      meanSolveMs: totalMs / (improved + tied),
      maxSolveMs: maxMs,
    },
    null,
    2,
  ),
);
