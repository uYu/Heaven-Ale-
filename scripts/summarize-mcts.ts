import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// The interrupted batch saved seat 0; the resumed batch saved seats 1–3.
// Reject missing/duplicate games rather than silently publishing partial totals.
const seeds = [16000, 16001, 16002, 16003];
const records = new Map<string, { seed: number; seat: number; scores: number[]; steps: number }>();
interface Timing {
  count: number;
  mean: number;
  p95: number;
  max: number;
}
const timings: { seed: number; current: Timing; previous: Timing }[] = [];
for (const seed of seeds) {
  for (const suffix of ['', '-remaining']) {
    const content = readFileSync(`docs/ai-mcts-validation-${seed}${suffix}.txt`, 'utf8');
    for (const match of content.matchAll(/^seed=(\d+) seat=(\d+) scores=([\d/]+) steps=(\d+)$/gm)) {
      const seat = Number(match[2]),
        identity = `${seed}:${seat}`;
      if (Number(match[1]) !== seed || records.has(identity))
        throw new Error(`Invalid/duplicate ${identity}`);
      records.set(identity, {
        seed,
        seat,
        scores: match[3].split('/').map(Number),
        steps: Number(match[4]),
      });
    }
    if (suffix) {
      const summary = JSON.parse(content.slice(content.indexOf('\n{') + 1));
      if (
        summary.games !== 3 ||
        summary.firstSeat !== 1 ||
        summary.contender !== 'mcts' ||
        summary.opponent !== 'hard-before-endgame'
      )
        throw new Error('Unexpected resumed batch');
      timings.push({ seed, current: summary.decisionMs, previous: summary.rivalDecisionMs });
    }
  }
}
for (const seed of seeds)
  for (let seat = 0; seat < 4; seat++)
    if (!records.has(`${seed}:${seat}`)) throw new Error(`Missing ${seed}:${seat}`);
if (records.size !== 16) throw new Error('Expected exactly 16 independent-validation games');
let wins = 0,
  ties = 0,
  own = 0,
  rival = 0,
  championships = 0,
  oldChampionships = 0;
for (const { seat, scores } of records.values()) {
  const opponent = (seat + 2) % 4;
  own += scores[seat];
  rival += scores[opponent];
  wins += Number(scores[seat] > scores[opponent]);
  ties += Number(scores[seat] === scores[opponent]);
  const max = Math.max(...scores),
    share = 1 / scores.filter((s) => s === max).length;
  championships += scores[seat] === max ? share : 0;
  oldChampionships += scores[opponent] === max ? share : 0;
}
const weightedTime = (which: 'current' | 'previous') =>
  timings.reduce((sum, t) => sum + t[which].count * t[which].mean, 0) /
  timings.reduce((sum, t) => sum + t[which].count, 0);
console.log(
  JSON.stringify(
    {
      sourceSha256: createHash('sha256').update(readFileSync('src/game/ai.mcts.ts')).digest('hex'),
      seeds,
      games: records.size,
      wins,
      ties,
      losses: records.size - wins - ties,
      duelWinRate: (wins + ties / 2) / records.size,
      meanScore: own / records.size,
      previousMeanScore: rival / records.size,
      meanMargin: (own - rival) / records.size,
      championshipRate: championships / records.size,
      previousChampionshipRate: oldChampionships / records.size,
      checkedActions: [...records.values()].reduce((sum, r) => sum + r.steps, 0),
      timingGames: 12,
      meanDecisionMs: weightedTime('current'),
      previousMeanDecisionMs: weightedTime('previous'),
      timingBatches: timings,
      results: [...records.values()].sort((a, b) => a.seed - b.seed || a.seat - b.seat),
    },
    null,
    2,
  ),
);
