import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, type GameState } from '../core/simulation';
import { MAPS } from '../data/maps';
import { listen, soundEventsSince, type Heard } from './soundEvents';

const level1 = MAPS[0].level;

// The state is plain data, so each test edits it by hand to stage what happened
// between two frames, then asks which sounds that calls for.

let game: GameState;
let before: Heard;

function tower(slot: number, level = 0): GameState['towers'][number] {
  return { id: slot + 1, slot, type: 'archery', level, invested: 70, cooldownTicks: 0, lastShot: null };
}

beforeEach(() => {
  game = createGame(level1, 1);
  game.phase = 'wave';
  game.tick = 100;
  before = listen(game);
  game.tick = 101;
});

describe('soundEventsSince', () => {
  it('is silent when nothing happened', () => {
    expect(soundEventsSince(before, game)).toEqual([]);
  });

  it('hears a hero attack', () => {
    game.heroes[0].lastShot = { tick: 101, x: 0, y: 0 };
    expect(soundEventsSince(before, game)).toEqual(['shot']);
  });

  it('hears a tower attack', () => {
    game.towers.push(tower(0));
    before = listen(game);
    game.tick = 102;
    game.towers[0].lastShot = { tick: 102, x: 0, y: 0 };
    expect(soundEventsSince(before, game)).toEqual(['shot']);
  });

  it('does not repeat an attack it already heard', () => {
    game.heroes[0].lastShot = { tick: 100, x: 0, y: 0 };
    expect(soundEventsSince(before, game)).toEqual([]);
  });

  it('plays one shot however many attacks land in the same frame', () => {
    game.heroes[0].lastShot = { tick: 101, x: 0, y: 0 };
    game.heroes[1].lastShot = { tick: 101, x: 0, y: 0 };
    expect(soundEventsSince(before, game)).toEqual(['shot']);
  });

  it('hears an ability', () => {
    game.heroes[2].lastCast = { tick: 101, x: 0, y: 0, ability: 0 };
    expect(soundEventsSince(before, game)).toEqual(['cast']);
  });

  it('hears the bounty of a kill', () => {
    game.gold += 5;
    expect(soundEventsSince(before, game)).toEqual(['kill']);
  });

  it('hears a lost life', () => {
    game.lives -= 1;
    expect(soundEventsSince(before, game)).toEqual(['lifeLost']);
  });

  it('hears a tower being built, not the gold it cost', () => {
    game.towers.push(tower(0));
    game.gold -= 70;
    expect(soundEventsSince(before, game)).toEqual(['build']);
  });

  it('hears a tower being upgraded', () => {
    game.towers.push(tower(0));
    before = listen(game);
    game.towers[0].level = 1;
    game.gold -= 60;
    expect(soundEventsSince(before, game)).toEqual(['upgrade']);
  });

  it('hears a tower being sold, not a kill', () => {
    game.towers.push(tower(0));
    before = listen(game);
    game.towers = [];
    game.gold += 42;
    expect(soundEventsSince(before, game)).toEqual(['sell']);
  });

  it('hears a hero level up', () => {
    game.heroes[0].level = 2;
    expect(soundEventsSince(before, game)).toEqual(['levelUp']);
  });

  it('hears a hero fall', () => {
    game.heroes[0].respawnTicks = 900;
    expect(soundEventsSince(before, game)).toEqual(['heroDown']);
  });

  it('hears the wave start', () => {
    game.phase = 'preparing';
    before = listen(game);
    game.phase = 'wave';
    expect(soundEventsSince(before, game)).toEqual(['waveStart']);
  });

  it('hears the wave cleared', () => {
    game.phase = 'preparing';
    expect(soundEventsSince(before, game)).toEqual(['waveClear']);
  });

  it('hears victory instead of a cleared wave', () => {
    game.phase = 'won';
    expect(soundEventsSince(before, game)).toEqual(['victory']);
  });

  it('hears defeat along with the life that caused it', () => {
    game.lives = 0;
    game.phase = 'lost';
    expect(soundEventsSince(before, game)).toEqual(['lifeLost', 'defeat']);
  });

  it('hears nothing across a restart, when the new game is behind the old one', () => {
    const fresh = createGame(level1, 2);
    expect(soundEventsSince(before, fresh)).toEqual([]);
  });
});
