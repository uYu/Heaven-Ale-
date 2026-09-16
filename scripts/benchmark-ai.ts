import { createGame, applyAction, assertInvariants, calculateResult } from '../src/game/engine.ts';
import { createAgent, type Difficulty } from '../src/game/ai.ts';

const count = Number(process.argv[2] ?? 10),
  start = Number(process.argv[3] ?? 1000);
const filler = process.argv[6] as Difficulty | undefined;
const contender = (process.argv[4] ?? 'hard') as Difficulty,
  opponent = (process.argv[5] ?? 'baseline') as Difficulty;
if (
  !Number.isInteger(count) ||
  count < 1 ||
  !Number.isInteger(start) ||
  ![contender, opponent, ...(filler ? [filler] : [])].every((d) =>
    ['baseline', 'normal', 'hard', 'hard-v1', 'search-v2'].includes(d),
  )
)
  throw new Error(
    'Usage: benchmark-ai.ts count startSeed hard|hard-v1|search-v2|normal|baseline opponent [filler]',
  );
let wins = 0,
  score = 0,
  others = 0,
  margin = 0,
  nodes = 0,
  duelWins = 0,
  duelMargin = 0;
const times: number[] = [],
  seedWins: number[] = [];
for (let seed = start; seed < start + count; seed++) {
  let blockWins = 0;
  for (let seat = 0; seat < 4; seat++) {
    let s = createGame(seed),
      steps = 0;
    const rival = (seat + 2) % 4;
    const agents = s.players.map((p) =>
      createAgent(p.id === seat ? contender : filler && p.id !== rival ? filler : opponent),
    );
    while (s.phase.kind !== 'finished') {
      const testing = s.turn === seat,
        t = performance.now();
      const action = agents[s.turn](s);
      if (testing) times.push(performance.now() - t);
      s = applyAction(s, action);
      assertInvariants(s);
      if (++steps > 1500) throw new Error(`Non-termination: ${seed}/${seat}`);
    }
    nodes += steps;
    const scores = s.players.map((p) => calculateResult(p).total),
      max = Math.max(...scores);
    const win = scores[seat] === max ? 1 / scores.filter((n) => n === max).length : 0;
    duelWins += scores[seat] > scores[rival] ? 1 : scores[seat] === scores[rival] ? 0.5 : 0;
    duelMargin += scores[seat] - scores[rival];
    wins += win;
    blockWins += win;
    score += scores[seat];
    const other = scores.filter((_, i) => i !== seat);
    others += other.reduce((a, b) => a + b, 0) / 3;
    margin += scores[seat] - Math.max(...other);
    console.log(`seed=${seed} seat=${seat} scores=${scores.join('/')} steps=${steps}`);
  }
  seedWins.push(blockWins / 4);
}
times.sort((a, b) => a - b);
const games = count * 4,
  rate = wins / games;
// Seed is the independent block; rotated seats share the same shuffled market.
const se =
  count >= 10
    ? Math.sqrt(seedWins.reduce((v, n) => v + (n - rate) ** 2, 0) / (count - 1) / count)
    : null;
console.log(
  JSON.stringify(
    {
      contender,
      opponent,
      filler,
      duelWinRate: duelWins / games,
      duelMeanMargin: duelMargin / games,
      start,
      seeds: count,
      games,
      fractionalWinRate: rate,
      approximate95Interval:
        se === null ? null : [Math.max(0, rate - 1.96 * se), Math.min(1, rate + 1.96 * se)],
      meanScore: score / games,
      opponentsMeanScore: others / games,
      meanMarginAgainstBest: margin / games,
      decisionMs: {
        median: times[Math.floor(times.length * 0.5)],
        p95: times[Math.floor(times.length * 0.95)],
        max: times.at(-1),
      },
      legalActions: nodes,
    },
    null,
    2,
  ),
);
