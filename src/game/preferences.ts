import type { Difficulty } from './ai.ts';

const KEY = 'heaven-and-ale.preferences.v1';
export function loadPreferences(): { difficulty: Difficulty; speed: number } {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      difficulty: ['baseline', 'normal', 'hard'].includes(value?.difficulty)
        ? value.difficulty
        : 'hard',
      speed: [100, 650, 1200, 2400].includes(value?.speed) ? value.speed : 1200,
    };
  } catch {
    return { difficulty: 'hard', speed: 1200 };
  }
}
export function savePreferences(difficulty: Difficulty, speed: number): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ difficulty, speed }));
    return true;
  } catch {
    return false;
  }
}
