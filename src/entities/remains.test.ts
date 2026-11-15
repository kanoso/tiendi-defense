import { describe, expect, it } from 'vitest';
import { activeRemains, addRemains, escapedEnemies, MAX_REMAINS, type Remains, type Vanished } from './remains';
import { DEATH_TICKS } from './unitMotion';

function body(id: number, startTick: number): Remains {
  return {
    id,
    sprite: 'enemy-soldier',
    frame: 4,
    scale: 2,
    x: 100,
    y: 200,
    lift: 0,
    flipX: false,
    flying: false,
    startTick,
  };
}

describe('activeRemains', () => {
  it('keeps a body for the whole death, counted in game ticks', () => {
    const list = [body(1, 100)];
    expect(activeRemains(list, 100)).toHaveLength(1);
    expect(activeRemains(list, 100 + DEATH_TICKS - 1)).toHaveLength(1);
    expect(activeRemains(list, 100 + DEATH_TICKS)).toHaveLength(0);
  });

  it('holds still while the tick does not move, as in a pause', () => {
    const list = [body(1, 100)];
    expect(activeRemains(activeRemains(list, 110), 110)).toEqual(list);
  });

  it('drops a body from the future, as after the game is replaced by an older copy', () => {
    expect(activeRemains([body(1, 500)], 400)).toHaveLength(0);
  });
});

describe('addRemains', () => {
  it('adds the body to the list', () => {
    expect(addRemains([body(1, 10)], body(2, 12)).map((entry) => entry.id)).toEqual([1, 2]);
  });

  it('never holds more than its limit, dropping the oldest first', () => {
    let list: Remains[] = [];
    for (let id = 1; id <= MAX_REMAINS + 5; id++) list = addRemains(list, body(id, 10));
    expect(list).toHaveLength(MAX_REMAINS);
    expect(list[0].id).toBe(6);
    expect(list[list.length - 1].id).toBe(MAX_REMAINS + 5);
  });
});

describe('escapedEnemies', () => {
  // 60 px a second is 1 px a tick.
  const gone = (id: number, distanceLeft: number, livesCost = 1): Vanished => ({
    id,
    distanceLeft,
    livesCost,
    speed: 60,
  });
  const escaped = (vanished: Vanished[], livesLost: number, ticks: number, outOfLives = false) =>
    [...escapedEnemies(vanished, { livesLost, ticks, outOfLives })].sort((a, b) => a - b);

  it('takes an enemy that could have walked out while a life was lost for an escape', () => {
    expect(escaped([gone(1, 0.5)], 1, 1)).toEqual([1]);
  });

  it('takes every enemy for a kill when no life was lost, however close it was', () => {
    expect(escaped([gone(1, 0.5), gone(2, 0.2)], 0, 1)).toEqual([]);
  });

  it('lets out only as many as the lives lost: the one closest to the exit', () => {
    expect(escaped([gone(1, 0.8), gone(2, 0.3)], 1, 1)).toEqual([2]);
  });

  it('counts the lives each enemy costs: a boss alone accounts for five', () => {
    expect(escaped([gone(1, 0.2), gone(9, 0.5, 5)], 5, 1)).toEqual([9]);
    expect(escaped([gone(1, 0.2), gone(9, 0.5, 5)], 6, 1)).toEqual([1, 9]);
  });

  it('allows for every tick of a frame that played several', () => {
    expect(escaped([gone(1, 2.5)], 1, 3)).toEqual([1]);
    expect(escaped([gone(1, 2.5)], 1, 2)).toEqual([]);
  });

  it('never takes an enemy too far from the exit for an escape', () => {
    expect(escaped([gone(1, 50)], 1, 2)).toEqual([]);
  });

  it('accepts a last escape that cost more lives than were left', () => {
    // Three lives left and a boss walks out: only three are lost, and the game ends.
    expect(escaped([gone(9, 0.5, 5)], 3, 1, true)).toEqual([9]);
    expect(escaped([gone(9, 0.5, 5)], 3, 1, false)).toEqual([]);
  });
});
