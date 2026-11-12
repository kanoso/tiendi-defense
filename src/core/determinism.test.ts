/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { length } from './path';
import { createGame, step, type Command, type GameState, type Level } from './simulation';
import { hashState } from './stateHash';

// Online play has every browser run the same simulation and expects the same
// result to the last bit. These tests guard what that depends on.

const SOURCES = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true });

describe('the simulation code', () => {
  // Square roots and basic arithmetic are exact everywhere. These are not: each
  // browser engine is free to round them its own way.
  const FORBIDDEN = /Math\.(hypot|sin|cos|tan|atan2?|asin|acos|pow|exp|log\w*|cbrt|random)\b/;

  it('uses no math that can differ from one browser to another', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      if (file.endsWith('.test.ts')) continue;
      (source as string).split('\n').forEach((line, index) => {
        if (FORBIDDEN.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('reads no clock: time only comes from ticks', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      if (file.endsWith('.test.ts')) continue;
      if (/Date\.now|performance\.now|new Date\(/.test(source as string)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('length', () => {
  it('measures a vector', () => {
    expect(length(3, 4)).toBe(5);
    expect(length(0, 0)).toBe(0);
    expect(length(-6, 8)).toBe(10);
  });
});

describe('hashState', () => {
  const level: Level = MAPS[0].level;

  /** Plays a fixed script: starts every wave, builds a tower, moves and casts. */
  function play(seed: number, ticks: number, twist: Command[] = []): GameState {
    const game = createGame(level, seed);
    for (let tick = 0; tick < ticks; tick++) {
      const commands: Command[] = [];
      if (game.phase === 'preparing') commands.push({ type: 'startWave' });
      if (tick === 10) commands.push({ type: 'buildTower', slot: 1, tower: 'archery' });
      if (tick === 200) commands.push({ type: 'moveHero', heroId: 2, x: 400, y: 260 });
      if (tick === 300) commands.push(...twist);
      step(game, level, commands);
    }
    return game;
  }

  it('is a whole number that fits in 32 bits', () => {
    const hash = hashState(play(1, 100));
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });

  it('is the same for two games that went the same way', () => {
    expect(hashState(play(7, 1500))).toBe(hashState(play(7, 1500)));
  });

  it('stays in step tick after tick, not just at the end', () => {
    for (const ticks of [1, 60, 400, 900]) {
      expect(hashState(play(3, ticks))).toBe(hashState(play(3, ticks)));
    }
  });

  it('differs when the games had different luck', () => {
    expect(hashState(play(1, 600))).not.toBe(hashState(play(2, 600)));
  });

  it('differs when one player did something the other did not', () => {
    const extra: Command[] = [{ type: 'moveHero', heroId: 1, x: 100, y: 300 }];
    expect(hashState(play(1, 600))).not.toBe(hashState(play(1, 600, extra)));
  });

  it('notices the smallest change in the state', () => {
    const game = play(1, 600);
    const before = hashState(game);
    game.gold += 1;
    expect(hashState(game)).not.toBe(before);
    game.gold -= 1;
    game.heroes[0].x += 0.000001;
    expect(hashState(game)).not.toBe(before);
  });

  it('ignores what is only kept for drawing', () => {
    const game = play(1, 600);
    const before = hashState(game);
    game.heroes[0].lastShot = { tick: 1, x: 2, y: 3 };
    game.heroes[0].lastHeal = null;
    expect(hashState(game)).toBe(before);
  });

  it('survives the state being sent as text and read back', () => {
    const game = play(5, 800);
    const copy = JSON.parse(JSON.stringify(game)) as GameState;
    expect(hashState(copy)).toBe(hashState(game));
    // And the copy keeps playing exactly like the original.
    for (let i = 0; i < 300; i++) {
      step(game, level);
      step(copy, level);
    }
    expect(hashState(copy)).toBe(hashState(game));
  });
});
