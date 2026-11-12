export type GameMode = 'campaign' | 'endless';

/** The ways a map can be played, with the name shown to the player. */
export const GAME_MODES: readonly { id: GameMode; name: string }[] = [
  { id: 'campaign', name: 'Campaña' },
  { id: 'endless', name: 'Sin fin' },
];

/** The mode with that id, or the campaign when the id is unknown. */
export function findMode(id: string | null | undefined): GameMode {
  return GAME_MODES.find((mode) => mode.id === id)?.id ?? 'campaign';
}
