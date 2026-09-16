import { createAgent, type Difficulty } from './ai.ts';
import type { GameState } from './types.ts';
const agents = new Map<string, ReturnType<typeof createAgent>>();
self.onmessage = (
  event: MessageEvent<{ state: GameState; difficulty: Difficulty; requestId: number }>,
) => {
  const { state, difficulty, requestId } = event.data;
  try {
    const key = `${difficulty}:${state.turn}`;
    if (!agents.has(key)) agents.set(key, createAgent(difficulty));
    self.postMessage({ revision: state.revision, requestId, action: agents.get(key)!(state) });
  } catch (error) {
    self.postMessage({
      revision: state.revision,
      requestId,
      error: error instanceof Error ? error.message : 'AI 决策失败',
    });
  }
};
