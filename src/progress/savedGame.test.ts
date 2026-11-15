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

  it('refuses, without failing, names that are built into every object', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const tower = valid();
      tower.state.towers = [{ id: 1, slot: 0, type: name, level: 0, invested: 1, cooldownTicks: 0, lastShot: null }];
      expect(() => parseSavedGame(tower), `tower ${name}`).not.toThrow();
      expect(parseSavedGame(tower), `tower ${name}`).toBeNull();

      const branch = valid();
      branch.state.towers = [
        { id: 1, slot: 0, type: 'archery', level: 3, branch: name, invested: 1, cooldownTicks: 0, lastShot: null },
      ];
      expect(parseSavedGame(branch), `branch ${name}`).toBeNull();

      for (const field of ['mapId', 'difficulty', 'mode']) {
        const saved = { ...valid(), [field]: name };
        expect(() => parseSavedGame(saved), `${field} ${name}`).not.toThrow();
        expect(parseSavedGame(saved), `${field} ${name}`).toBeNull();
      }
    }
  });

  describe('specialized towers', () => {
    const level = playerLevel('meadow', 'normal', 'campaign', {});
    const ARCHERY_TO_THIRD = level.towerTypes.archery.levels.reduce((sum, stats) => sum + stats.cost, 0);
    const BALLESTA = level.towerTypes.archery.branches!.find((b) => b.id === 'ballesta')!.levels.map((l) => l.cost);

    const tower = (fields: Record<string, unknown>) => ({
      id: 1,
      slot: 0,
      type: 'archery',
      level: 0,
      invested: 70,
      cooldownTicks: 0,
      lastShot: null,
      ...fields,
    });
    const withTowers = (...towers: Record<string, unknown>[]) => {
      const saved = valid();
      saved.state.towers = towers;
      saved.state.nextTowerId = towers.length + 1;
      return saved;
    };

    it('reads a save from before branches existed, as towers without a branch, leaving the save untouched', () => {
      const raw = withTowers(tower({ level: 2 }));
      expect(raw.state.towers[0]).not.toHaveProperty('branch');
      const untouched = structuredClone(raw);
      const parsed = parseSavedGame(raw);
      expect(parsed?.state.towers[0]).toMatchObject({ level: 2, branch: null });
      expect(raw).toEqual(untouched);
    });

    it('keeps a specialized tower, up to the last level of its branch', () => {
      for (const [level, invested] of [
        [3, ARCHERY_TO_THIRD + BALLESTA[0]],
        [4, ARCHERY_TO_THIRD + BALLESTA[0] + BALLESTA[1]],
      ]) {
        const parsed = parseSavedGame(withTowers(tower({ level, branch: 'ballesta', invested })));
        expect(parsed?.state.towers[0], `level ${level}`).toMatchObject({ level, branch: 'ballesta' });
      }
    });

    it('refuses gold invested beyond what the tower could have cost, or below nothing', () => {
      expect(parseSavedGame(withTowers(tower({ level: 2, invested: ARCHERY_TO_THIRD })))).not.toBeNull();
      for (const invested of [ARCHERY_TO_THIRD + 1, 1e9, -5, Number.MAX_VALUE]) {
        expect(parseSavedGame(withTowers(tower({ level: 2, invested }))), String(invested)).toBeNull();
      }
      const top = ARCHERY_TO_THIRD + BALLESTA[0] + BALLESTA[1];
      expect(parseSavedGame(withTowers(tower({ level: 4, branch: 'ballesta', invested: top + 1 })))).toBeNull();
    });

    it('keeps a last shot that struck several enemies', () => {
      const lastShot = { tick: 5, x: 1, y: 2, struck: [{ id: 3, x: 1, y: 2 }, { id: 4, x: 5, y: 6 }] };
      const parsed = parseSavedGame(withTowers(tower({ lastShot })));
      expect(parsed?.state.towers[0].lastShot).toEqual(lastShot);
    });

    it('refuses a last shot that could not be drawn', () => {
      const tooMany = Array.from({ length: 100 }, (_, id) => ({ id, x: 0, y: 0 }));
      for (const lastShot of [
        { tick: 5, x: 1 },
        { tick: 'now', x: 1, y: 2 },
        { tick: 5, x: 1, y: 2, struck: 5 },
        { tick: 5, x: 1, y: 2, struck: [{ id: 'a', x: 1, y: 2 }] },
        { tick: 5, x: 1, y: 2, struck: [null] },
        { tick: 5, x: 1, y: 2, struck: tooMany },
        [1, 2, 3],
      ]) {
        expect(parseSavedGame(withTowers(tower({ lastShot }))), JSON.stringify(lastShot)).toBeNull();
      }
    });

    it('plays a specialized tower on exactly like the game it came from', () => {
      const { saved } = afterFirstWave();
      const level = playerLevel('meadow', 'normal', 'campaign', {});
      const game = structuredClone(saved.state);
      game.gold = 5000;
      step(game, level, [
        { type: 'buildTower', slot: 1, tower: 'arcane' },
        { type: 'upgradeTower', slot: 1 },
        { type: 'upgradeTower', slot: 1 },
        { type: 'specializeTower', slot: 1, branch: 'rayo' },
      ]);
      const resumed = parseSavedGame(roundTrip({ ...saved, state: game }))!.state;
      expect(resumed.towers.find((t) => t.slot === 1)).toMatchObject({ level: 3, branch: 'rayo' });
      for (const copy of [game, resumed]) {
        step(copy, level, [{ type: 'startWave' }]);
        for (let tick = 0; tick < 600; tick++) step(copy, level);
      }
      expect(resumed).toEqual(game);
    });

    it('refuses a branch the tower does not have', () => {
      expect(parseSavedGame(withTowers(tower({ level: 3, branch: 'laser' })))).toBeNull();
      // A branch of another tower type.
      expect(parseSavedGame(withTowers(tower({ level: 3, branch: 'rayo' })))).toBeNull();
      expect(parseSavedGame(withTowers(tower({ level: 3, branch: 42 })))).toBeNull();
    });

    it('refuses a level beyond the base levels without a branch', () => {
      expect(parseSavedGame(withTowers(tower({ level: 3, branch: null })))).toBeNull();
      expect(parseSavedGame(withTowers(tower({ level: 3 })))).toBeNull();
    });

    it('refuses a branch on a tower that has not reached it, or a level beyond the branch', () => {
      expect(parseSavedGame(withTowers(tower({ level: 2, branch: 'ballesta' })))).toBeNull();
      expect(parseSavedGame(withTowers(tower({ level: 5, branch: 'ballesta' })))).toBeNull();
    });
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
