import { describe, expect, it } from 'vitest';
import { createGame, step, type GameState } from '../core/simulation';
import {
  continueLabel,
  describeSavedGame,
  makeSavedGame,
  newerSavedGame,
  parseSavedGame,
  playerLevel,
  type SavedGame,
} from './savedGame';

/** A game on the first map played until its first wave is over. */
function afterFirstWave(mode: 'campaign' | 'endless' = 'campaign'): { game: GameState; saved: SavedGame } {
  const level = playerLevel('meadow', 'normal', mode, {});
  const game = createGame(level, 7);
  step(game, level, [{ type: 'startWave' }]);
  for (let tick = 0; tick < 60 * 120 && game.phase === 'wave'; tick++) step(game, level);
  expect(game.phase).toBe('preparing');
  const saved = makeSavedGame({ gameId: 'game-1', mapId: 'meadow', difficulty: 'normal', mode, state: game });
  return { game, saved };
}

/** Through text and back, as it travels to storage or the server. */
const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('a saved game', () => {
  it('reads back exactly as it was saved', () => {
    const { saved } = afterFirstWave();
    expect(parseSavedGame(roundTrip(saved))).toEqual(saved);
  });

  it('is a copy: the game going on does not change it', () => {
    const { game, saved } = afterFirstWave();
    game.gold = 99_999;
    expect(saved.state.gold).not.toBe(99_999);
  });

  it('plays on exactly like the game it came from', () => {
    const { game, saved } = afterFirstWave();
    const level = playerLevel('meadow', 'normal', 'campaign', {});
    const resumed = parseSavedGame(roundTrip(saved))!.state;
    for (const copy of [game, resumed]) {
      step(copy, level, [{ type: 'startWave' }]);
      for (let tick = 0; tick < 600; tick++) step(copy, level);
    }
    expect(resumed).toEqual(game);
  });

  it('fits on the menu button', () => {
    expect(continueLabel(afterFirstWave().saved)).toBe('Continuar · Pradera · 2/20');
    expect(continueLabel(afterFirstWave('endless').saved)).toBe('Continuar · Pradera · 2');
  });

  it('says where it stands, for the menu', () => {
    const { saved } = afterFirstWave();
    expect(describeSavedGame(saved)).toBe('Pradera · Normal · oleada 2/20');
    expect(describeSavedGame(afterFirstWave('endless').saved)).toBe('Pradera · Normal · Sin fin · oleada 2');
  });
});

describe('reading a saved game that may be broken', () => {
  const valid = () => roundTrip(afterFirstWave().saved) as Record<string, any>;

  it('refuses anything that is not a saved game', () => {
    for (const junk of [null, undefined, 42, 'game', [], {}]) expect(parseSavedGame(junk)).toBeNull();
  });

  it('refuses a saved game from another version', () => {
    expect(parseSavedGame({ ...valid(), version: 99 })).toBeNull();
  });

  it('refuses an unknown map, difficulty or mode', () => {
    expect(parseSavedGame({ ...valid(), mapId: 'atlantis' })).toBeNull();
    expect(parseSavedGame({ ...valid(), difficulty: 'nightmare' })).toBeNull();
    expect(parseSavedGame({ ...valid(), mode: 'zen' })).toBeNull();
  });

  it('only accepts a game saved between waves, still being played', () => {
    for (const phase of ['wave', 'won', 'lost']) {
      const saved = valid();
      saved.state.phase = phase;
      expect(parseSavedGame(saved)).toBeNull();
    }
  });

  it('refuses a game whose numbers make no sense', () => {
    for (const [field, value] of [
      ['gold', -5],
      ['gold', 'lots'],
      ['lives', 0],
      ['waveIndex', 99],
      ['tick', Number.NaN],
    ] as const) {
      const saved = valid();
      saved.state[field] = value;
      expect(parseSavedGame(saved), `${field} = ${String(value)}`).toBeNull();
    }
  });

  it('refuses heroes or towers that do not belong on that map', () => {
    const extraHero = valid();
    extraHero.state.heroes.push({ ...extraHero.state.heroes[0], id: 9 });
    expect(parseSavedGame(extraHero)).toBeNull();

    const strangeTower = valid();
    strangeTower.state.towers = [{ id: 1, slot: 0, type: 'laser', level: 0, invested: 1, cooldownTicks: 0, lastShot: null }];
    expect(parseSavedGame(strangeTower)).toBeNull();

    const nowhere = valid();
    nowhere.state.towers = [{ id: 1, slot: 999, type: 'archery', level: 0, invested: 1, cooldownTicks: 0, lastShot: null }];
    expect(parseSavedGame(nowhere)).toBeNull();
  });

  it('refuses a game that breaks when played', () => {
    const saved = valid();
    saved.state.heroes[0].abilityCooldowns = null;
    expect(parseSavedGame(saved)).toBeNull();
  });
});

describe('choosing between the device and the account', () => {
  const at = (savedAt: string, gameId = 'g'): SavedGame => ({ ...afterFirstWave().saved, savedAt, gameId });

  it('keeps the one saved last', () => {
    const older = at('2026-11-10T10:00:00.000Z');
    const newer = at('2026-11-12T10:00:00.000Z');
    expect(newerSavedGame(older, newer)).toBe(newer);
    expect(newerSavedGame(newer, older)).toBe(newer);
  });

  it('takes whichever there is when only one side has one', () => {
    const only = at('2026-11-10T10:00:00.000Z');
    expect(newerSavedGame(only, null)).toBe(only);
    expect(newerSavedGame(null, only)).toBe(only);
    expect(newerSavedGame(null, null)).toBeNull();
  });
});
