import { chooseAction as baseline } from './ai.baseline.ts';
import { chooseAction as normal } from './ai.normal.ts';
import { chooseAction as previousHard } from './ai.hard-v1.ts';
import { createHardAgent, chooseAction as hard } from './ai.search.ts';
import { createTreeAgent, searchTree } from './ai.mcts.ts';
import type { Action, GameState } from './types.ts';

export type Difficulty = 'baseline' | 'normal' | 'hard' | 'hard-v1' | 'hard-v2' | 'search-v2';
// Preserve the original entry-point default for existing replays and regression tests.
export function chooseAction(s: GameState, difficulty: Difficulty = 'baseline'): Action {
  if (difficulty === 'search-v2') return hard(s);
  if (difficulty === 'hard-v1') return previousHard(s);
  if (difficulty === 'hard') return searchTree(s).action;
  return difficulty === 'hard-v2'
    ? s.round <= 2
      ? previousHard(s)
      : hard(s)
    : difficulty === 'normal'
      ? normal(s)
      : baseline(s);
}

export function createAgent(difficulty: Difficulty = 'hard'): (s: GameState) => Action {
  if (difficulty === 'hard') return createTreeAgent();
  if (difficulty === 'search-v2') return createHardAgent();
  if (difficulty !== 'hard-v2') return (s) => chooseAction(s, difficulty);
  const planner = createHardAgent();
  return (s) => (s.round <= 2 ? previousHard(s) : planner(s));
}
