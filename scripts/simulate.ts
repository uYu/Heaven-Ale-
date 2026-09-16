import { createGame, applyAction, assertInvariants, calculateResult } from '../src/game/engine.ts';
import { chooseAction } from '../src/game/ai.ts';
const count = Number(process.argv[2] || 20);
let total = 0;
const scores: number[] = [];
for (let seed = 1; seed <= count; seed++) {
  let s = createGame(seed),
    steps = 0;
  while (s.phase.kind !== 'finished') {
    s = applyAction(s, chooseAction(s));
    assertInvariants(s);
    if (++steps > 1500) throw new Error(`Seed ${seed} did not terminate`);
  }
  total += steps;
  scores.push(...s.players.map((p) => calculateResult(p).total));
  console.log(
    `seed ${seed}: ${steps} actions; scores ${s.players.map((p) => calculateResult(p).total).join(' / ')}`,
  );
}
console.log(
  `${count} games completed; ${total} legal actions; mean score ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`,
);
