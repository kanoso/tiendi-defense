import { describe, expect, it } from 'vitest';
import {
  activeEnemyEffects,
  addEnemyEffect,
  ENEMY_EFFECT_TICKS,
  HEAL_TINT_TICKS,
  healTint,
  MAX_ENEMY_EFFECTS,
  POP_IN_TICKS,
  popInScale,
  risePose,
  SPLIT_PUFF_MARGIN,
  trackCooldownRestart,
  trackHeal,
  type EnemyEffect,
} from './enemyEffects';
import { escapedEnemies, vanishedIds } from './remains';
import { deathPose, FALL_TICKS } from './unitMotion';
import { BURST_DEPTH, remainsDepth, unitDepth } from './units';

// How the enemies with traits of their own look: a shaman's heal, a skeleton
// getting back up and a zombie bursting into smaller ones. Rendering only, and
// every look is a function of game ticks, so it freezes with a pause.

describe('risePose', () => {
  const DELAY = 90;
  const at = (since: number) => risePose(since, DELAY - since, false);

  it('falls like any killed enemy at first', () => {
    for (const since of [0, 5, FALL_TICKS - 1, FALL_TICKS]) {
      expect(at(since).angle).toBe(deathPose(since, false).angle);
    }
  });

  it('lies on the ground, fully visible, until it gets up', () => {
    for (const since of [FALL_TICKS, 40, DELAY - FALL_TICKS]) {
      expect(at(since)).toMatchObject({ angle: -90, alpha: 1 });
    }
  });

  it('gets up by playing the fall backwards, and stands at the end', () => {
    for (const left of [FALL_TICKS - 1, 8, 3, 1]) {
      expect(risePose(DELAY - left, left, true).angle).toBe(deathPose(left, true).angle);
    }
    expect(at(DELAY).angle).toBe(0);
  });

  it('never fades: it is not dead', () => {
    for (let since = 0; since <= DELAY; since += 7) expect(at(since).alpha).toBe(1);
  });
});

describe('healTint', () => {
  it('turns a healed enemy green for a moment, then lets go', () => {
    expect(healTint(0)).toEqual({ fill: false, color: expect.any(Number) });
    expect(healTint(HEAL_TINT_TICKS - 1)).not.toBeNull();
    expect(healTint(HEAL_TINT_TICKS)).toBeNull();
  });

  it('shows nothing with no heal, or one from the future', () => {
    expect(healTint(null)).toBeNull();
    expect(healTint(-2)).toBeNull();
  });
});

describe('trackHeal', () => {
  it('records the tick when health goes up', () => {
    expect(trackHeal({ hp: 500, healTick: null }, 520, 40)).toEqual({ hp: 520, healTick: 40 });
  });

  it('keeps the last heal when health stays or drops', () => {
    expect(trackHeal({ hp: 520, healTick: 40 }, 520, 45)).toEqual({ hp: 520, healTick: 40 });
    expect(trackHeal({ hp: 520, healTick: 40 }, 400, 45)).toEqual({ hp: 400, healTick: 40 });
  });

  it('forgets a heal later than the game, as after a shared game is rewound', () => {
    expect(trackHeal({ hp: 520, healTick: 995 }, 520, 900)).toEqual({ hp: 520, healTick: null });
  });
});

describe('trackCooldownRestart', () => {
  const INTERVAL = 120;

  it('dates a pulse from the cooldown that started over at it', () => {
    // Seen at 0 last frame; two ticks after the pulse it has 118 left.
    expect(trackCooldownRestart({ cooldown: 0, eventTick: null }, 118, INTERVAL, 502)).toEqual({
      cooldown: 118,
      eventTick: 500,
    });
  });

  it('sees no pulse while the cooldown only runs down', () => {
    expect(trackCooldownRestart({ cooldown: 50, eventTick: 300 }, 49, INTERVAL, 371)).toEqual({
      cooldown: 49,
      eventTick: 300,
    });
  });

  it('forgets a pulse later than the game', () => {
    expect(trackCooldownRestart({ cooldown: 50, eventTick: 990 }, 49, INTERVAL, 900).eventTick).toBeNull();
  });
});

describe('enemy effects', () => {
  const effect = (startTick: number, kind: EnemyEffect['kind'] = 'healPulse'): EnemyEffect => ({
    kind,
    x: 100,
    y: 200,
    radius: 60,
    startTick,
  });

  it('play for their set number of game ticks', () => {
    for (const kind of ['healPulse', 'splitPuff'] as const) {
      const list = [effect(100, kind)];
      expect(activeEnemyEffects(list, 100)).toHaveLength(1);
      expect(activeEnemyEffects(list, 100 + ENEMY_EFFECT_TICKS[kind] - 1)).toHaveLength(1);
      expect(activeEnemyEffects(list, 100 + ENEMY_EFFECT_TICKS[kind])).toHaveLength(0);
    }
  });

  it('hold still while the tick does not move, and drop one from the future', () => {
    const list = [effect(100)];
    expect(activeEnemyEffects(activeEnemyEffects(list, 110), 110)).toEqual(list);
    expect(activeEnemyEffects([effect(500)], 400)).toHaveLength(0);
  });

  it('never pile up past their limit, dropping the oldest first', () => {
    let list: EnemyEffect[] = [];
    for (let tick = 1; tick <= MAX_ENEMY_EFFECTS + 3; tick++) list = addEnemyEffect(list, effect(tick));
    expect(list).toHaveLength(MAX_ENEMY_EFFECTS);
    expect(list[0].startTick).toBe(4);
  });
});

describe('popInScale', () => {
  it('starts small and grows, tick by tick, to full size', () => {
    const sizes = Array.from({ length: POP_IN_TICKS + 1 }, (_, tick) => popInScale(tick));
    expect(sizes[0]).toBeLessThan(0.5);
    for (let tick = 1; tick < sizes.length; tick++) expect(sizes[tick]).toBeGreaterThan(sizes[tick - 1]);
    expect(sizes[POP_IN_TICKS]).toBe(1);
  });

  it('is full size long after, with no pop at all, or for one from the future', () => {
    expect(popInScale(POP_IN_TICKS + 50)).toBe(1);
    expect(popInScale(null)).toBe(1);
    expect(popInScale(-3)).toBe(1);
  });

  it('holds still while the tick does not move', () => {
    expect(popInScale(4)).toBe(popInScale(4));
  });
});

describe('the zombie burst', () => {
  it('lasts long enough and spreads wide enough to be seen around the small ones', () => {
    expect(ENEMY_EFFECT_TICKS.splitPuff).toBeGreaterThanOrEqual(30);
    expect(SPLIT_PUFF_MARGIN).toBeGreaterThanOrEqual(24);
  });
});

describe('remainsDepth', () => {
  const height = 540;

  it('draws a body behind every living unit on the ground, wherever each one stands', () => {
    for (const body of [-50, 0, 270, height, height + 50]) {
      for (const unit of [-50, 0, 270, height, height + 50]) {
        expect(remainsDepth(body, height)).toBeLessThan(unitDepth(unit, false, height));
      }
    }
  });

  it('leaves the dust of a burst between the bodies and the living', () => {
    expect(BURST_DEPTH).toBeGreaterThan(remainsDepth(height + 50, height));
    expect(BURST_DEPTH).toBeLessThan(unitDepth(-50, false, height));
  });

  it('stays above the towers and shadows, and puts a body lower on the screen in front', () => {
    expect(remainsDepth(0, height)).toBeGreaterThan(2);
    expect(remainsDepth(300, height)).toBeGreaterThan(remainsDepth(299, height));
  });
});

describe('telling who left the road', () => {
  const game = (enemies: number[], rising: number[]) => ({
    enemies: enemies.map((id) => ({ id })),
    rising: rising.map((id) => ({ enemy: { id } })),
  });

  it('counts a skeleton lying on the road as still there', () => {
    expect(vanishedIds([1, 2, 3], game([1], [2]))).toEqual([3]);
  });

  it('counts a zombie that split as gone, and its small ones as new', () => {
    expect(vanishedIds([7], game([8, 9, 10], []))).toEqual([7]);
  });

  it('takes a zombie split near the exit for a kill when another enemy walked out', () => {
    // A soldier costing one life got out as a big zombie costing three was split right by it.
    const vanished = [
      { id: 7, distanceLeft: 0.6, livesCost: 3, speed: 35 },
      { id: 4, distanceLeft: 0.4, livesCost: 1, speed: 60 },
    ];
    expect([...escapedEnemies(vanished, { livesLost: 1, ticks: 1, outOfLives: false })]).toEqual([4]);
  });
});
