import { createGame, applyAction, assertInvariants, calculateResult } from '../src/game/engine.ts';
import { createAgent, type Difficulty } from '../src/game/ai.ts';
import { createHardAgent } from '../src/game/ai.search.ts';
import { chooseAction as opening } from '../src/game/ai.hard-v1.ts';
import { createTreeAgent } from '../src/game/ai.mcts.ts';

// Reproduce the immediately preceding default, including its two-round opening.
// search-v2 alone is not that control: it uses the newer planner from round one.
type BenchmarkDifficulty =
  Difficulty | 'hard-before-endgame' | 'hard-endgame' | 'mcts' | 'hard-mcts';
function agent(difficulty: BenchmarkDifficulty) {
  if (difficulty === 'mcts') return createTreeAgent();
  if (difficulty === 'hard-mcts') {
    const planner = createTreeAgent();
    return (s: ReturnType<typeof createGame>) => (s.round <= 2 ? opening(s) : planner(s));
  }
  if (difficulty !== 'hard-before-endgame' && difficulty !== 'hard-endgame')
    return createAgent(difficulty);
  const planner = createHardAgent({ endgame: difficulty === 'hard-endgame' });
  return (s: ReturnType<typeof createGame>) => (s.round <= 2 ? opening(s) : planner(s));
}

const count = Number(process.argv[2] ?? 10),
  start = Number(process.argv[3] ?? 1000);
const filler = process.argv[6] as BenchmarkDifficulty | undefined;
const firstSeat = Number(process.argv[7] ?? 0);
const contender = (process.argv[4] ?? 'hard') as BenchmarkDifficulty,
  opponent = (process.argv[5] ?? 'baseline') as BenchmarkDifficulty;
if (
  !Number.isInteger(count) ||
  count < 1 ||
  !Number.isInteger(start) ||
  !Number.isInteger(firstSeat) ||
  firstSeat < 0 ||
  firstSeat > 3 ||
  ![contender, opponent, ...(filler ? [filler] : [])].every((d) =>
    [
      'baseline',
      'normal',
      'hard',
      'hard-v1',
      'hard-v2',
      'search-v2',
      'hard-before-endgame',
      'hard-endgame',
      'mcts',
      'hard-mcts',
    ].includes(d),
  )
)
  throw new Error(
    'Usage: benchmark-ai.ts count startSeed contender opponent [filler] [firstSeat=0]',
  );
let wins = 0,
  score = 0,
  others = 0,
  margin = 0,
  nodes = 0,
  duelWins = 0,
  duelMargin = 0,
  outrightWins = 0,
  ties = 0,
  rivalScore = 0;
const started = performance.now();
const rivalTimes: number[] = [];
const times: number[] = [],
  seedWins: number[] = [];
for (let seed = start; seed < start + count; seed++) {
  let blockWins = 0;
  for (let seat = firstSeat; seat < 4; seat++) {
    let s = createGame(seed),
      steps = 0;
    const rival = (seat + 2) % 4;
    const agents = s.players.map((p) =>
      agent(p.id === seat ? contender : filler && p.id !== rival ? filler : opponent),
    );
    while (s.phase.kind !== 'finished') {
      const testing = s.turn === seat,
        t = performance.now();
      const action = agents[s.turn](s);
      if (testing) times.push(performance.now() - t);
      if (s.turn === rival) rivalTimes.push(performance.now() - t);
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
    outrightWins += Number(scores[seat] > scores[rival]);
    ties += Number(scores[seat] === scores[rival]);
    rivalScore += scores[rival];
    wins += win;
    blockWins += win;
    score += scores[seat];
    const other = scores.filter((_, i) => i !== seat);
    others += other.reduce((a, b) => a + b, 0) / 3;
    margin += scores[seat] - Math.max(...other);
    console.log(`seed=${seed} seat=${seat} scores=${scores.join('/')} steps=${steps}`);
  }
  seedWins.push(blockWins / (4 - firstSeat));
}
times.sort((a, b) => a - b);
rivalTimes.sort((a, b) => a - b);
const games = count * (4 - firstSeat),
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
      duelRecord: { wins: outrightWins, ties, losses: games - outrightWins - ties },
      rivalMeanScore: rivalScore / games,
      start,
      firstSeat,
      seeds: count,
      games,
      fractionalWinRate: rate,
      approximate95Interval:
        se === null ? null : [Math.max(0, rate - 1.96 * se), Math.min(1, rate + 1.96 * se)],
      meanScore: score / games,
      opponentsMeanScore: others / games,
      meanMarginAgainstBest: margin / games,
      decisionMs: {
        count: times.length,
        mean: times.reduce((sum, n) => sum + n, 0) / times.length,
        median: times[Math.floor(times.length * 0.5)],
        p95: times[Math.floor(times.length * 0.95)],
        max: times.at(-1),
      },
      rivalDecisionMs: {
        count: rivalTimes.length,
        mean: rivalTimes.reduce((sum, n) => sum + n, 0) / rivalTimes.length,
        median: rivalTimes[Math.floor(rivalTimes.length * 0.5)],
        p95: rivalTimes[Math.floor(rivalTimes.length * 0.95)],
        max: rivalTimes.at(-1),
      },
      elapsedSeconds: (performance.now() - started) / 1000,
      legalActions: nodes,
    },
    null,
    2,
  ),
);
