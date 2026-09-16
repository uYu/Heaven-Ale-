import { writeFileSync, mkdirSync } from 'node:fs';
import { createGame, applyAction } from '../src/game/engine.ts';
import { chooseAction } from '../src/game/ai.ts';
import { serialize } from '../src/game/storage.ts';
mkdirSync('tmp/qa', { recursive: true });
const found = new Set<string>();
for (let seed = 1; seed <= 5; seed++) {
  let state = createGame(seed);
  while (state.phase.kind !== 'finished') {
    if (
      state.turn === 0 &&
      ['shed', 'privilege', 'score', 'home'].includes(state.phase.kind) &&
      !found.has(state.phase.kind)
    ) {
      writeFileSync(`tmp/qa/${state.phase.kind}.json`, serialize(state));
      found.add(state.phase.kind);
    }
    state = applyAction(state, chooseAction(state));
  }
  if (seed === 1) writeFileSync('tmp/qa/finished.json', serialize(state));
  if (found.size === 4) break;
}
console.log('Generated QA saves:', [...found, 'finished'].join(', '));
