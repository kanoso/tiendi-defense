import type { Level } from '../core/simulation';

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  /** Name shown to the player. */
  name: string;
  /** Multiplier on the health of every enemy. */
  enemyHealth: number;
  /** Multiplier on the gold the player starts with. */
  startingGold: number;
}

/** From gentlest to toughest. Stars are counted separately for each one. */
export const DIFFICULTIES: readonly Difficulty[] = [
  { id: 'easy', name: 'Fácil', enemyHealth: 0.8, startingGold: 1.3 },
  { id: 'normal', name: 'Normal', enemyHealth: 1, startingGold: 1 },
  { id: 'hard', name: 'Difícil', enemyHealth: 1.15, startingGold: 0.9 },
];

export const DIFFICULTY_IDS: readonly DifficultyId[] = DIFFICULTIES.map((d) => d.id);

/** The difficulty with that id, or normal when the id is unknown. */
export function findDifficulty(id: string | null | undefined): Difficulty {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DIFFICULTIES[1];
}

/** The level as it is played at a difficulty. The level passed in is left untouched. */
export function applyDifficulty(level: Level, id: DifficultyId): Level {
  const difficulty = findDifficulty(id);
  const enemyTypes = Object.fromEntries(
    Object.entries(level.enemyTypes).map(([type, enemy]) => [
      type,
      { ...enemy, maxHp: Math.round(enemy.maxHp * difficulty.enemyHealth) },
    ]),
  );
  return {
    ...level,
    enemyTypes,
    startingGold: Math.round(level.startingGold * difficulty.startingGold),
  };
}
