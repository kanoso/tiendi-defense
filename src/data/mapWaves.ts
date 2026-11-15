import type { EndlessGroup, Wave, WaveGroup } from '../core/waves';

// The scripted waves of the maps built around the newer enemies. The first three
// maps play the standard waves in `rules.ts`; these are longer campaigns that
// bring in the shaman, the skeleton, the big zombie and the ogre a few at a time.

/** `path` is the road the group walks: 0 for the only one, or the west gate. */
function group(enemy: string, count: number, intervalTicks: number, delayTicks = 0, path = 0): WaveGroup {
  return { enemy, count, intervalTicks, delayTicks, path };
}

/** The same, through the fortress's east gate. */
function east(enemy: string, count: number, intervalTicks: number, delayTicks = 0): WaveGroup {
  return group(enemy, count, intervalTicks, delayTicks, 1);
}

/** Pantano: one long road. Skeletons from wave 4, shamans from wave 7. */
export const swampWaves: readonly Wave[] = [
  [group('soldier', 6, 90)],
  [group('soldier', 10, 70)],
  [group('soldier', 6, 70), group('runner', 6, 40, 300)],
  // 4: the first skeletons, a handful among soldiers.
  [group('soldier', 8, 70), group('skeleton', 3, 120, 300)],
  [group('runner', 12, 35), group('flyer', 4, 60, 200), group('skeleton', 5, 80, 500)],
  [group('soldier', 10, 50), group('armored', 2, 180, 200), group('skeleton', 6, 70, 400)],
  // 7: the first shamans, behind soldiers they keep alive.
  [group('soldier', 14, 45), group('shaman', 2, 240, 250)],
  [group('armored', 5, 150), group('runner', 8, 40, 120), group('flyer', 6, 50, 400), group('skeleton', 6, 60, 300)],
  [group('soldier', 16, 40), group('shaman', 3, 180, 200), group('armored', 4, 160, 300)],
  // 10: first boss.
  [
    group('boss', 1, 0, 300),
    group('soldier', 16, 45),
    group('skeleton', 8, 60, 200),
    group('shaman', 2, 300, 400),
    group('flyer', 8, 40, 900),
  ],
  [group('runner', 20, 25), group('skeleton', 10, 50, 200), group('flyer', 10, 40, 300)],
  [group('armored', 10, 100), group('shaman', 4, 150, 100), group('runner', 14, 30, 300)],
  [group('soldier', 24, 28), group('skeleton', 12, 45, 300), group('flyer', 12, 40, 200)],
  [group('flyer', 16, 35), group('armored', 10, 100, 100), group('shaman', 4, 140, 300)],
  // 15: two bosses, with shamans to heal them.
  [group('boss', 2, 600, 200), group('shaman', 4, 200, 100), group('armored', 8, 110), group('skeleton', 12, 40, 400)],
  [group('runner', 30, 20), group('skeleton', 14, 40, 300), group('flyer', 12, 35, 500)],
  [group('soldier', 30, 22), group('shaman', 6, 120, 200), group('armored', 10, 90, 400)],
  [group('skeleton', 24, 30), group('flyer', 18, 35, 300), group('runner', 20, 25, 700)],
  [group('armored', 14, 80), group('shaman', 6, 110, 150), group('soldier', 24, 26, 300), group('flyer', 16, 35, 600)],
  // 20: two bosses and a crowd.
  [
    group('boss', 2, 700, 300),
    group('shaman', 6, 150),
    group('skeleton', 20, 35, 200),
    group('armored', 10, 100, 400),
    group('flyer', 14, 40, 800),
  ],
  [group('soldier', 36, 20), group('skeleton', 20, 30, 300), group('shaman', 6, 120, 500)],
  [group('flyer', 30, 25), group('armored', 14, 80, 200), group('shaman', 6, 120, 300)],
  [group('runner', 30, 20), group('skeleton', 26, 28, 200), group('flyer', 18, 30, 600)],
  [group('armored', 18, 70), group('shaman', 8, 100, 100), group('soldier', 30, 22, 400)],
  // 25: bosses again.
  [
    group('boss', 2, 600, 200),
    group('skeleton', 24, 30),
    group('shaman', 8, 120, 300),
    group('armored', 12, 90, 500),
    group('flyer', 16, 35, 900),
  ],
  [group('skeleton', 36, 22), group('flyer', 24, 28, 300), group('runner', 24, 22, 700)],
  [group('armored', 20, 65), group('shaman', 10, 90, 200), group('soldier', 36, 20, 400)],
  [group('soldier', 36, 20), group('skeleton', 30, 24, 200), group('shaman', 10, 90, 400), group('flyer', 24, 28, 700)],
  [
    group('armored', 18, 70),
    group('shaman', 10, 90, 200),
    group('skeleton', 30, 24, 300),
    group('flyer', 20, 30, 600),
    group('boss', 1, 0, 900),
  ],
  // 30: the last stand: three bosses, healed on their way.
  [
    group('boss', 3, 600, 300),
    group('shaman', 12, 100),
    group('armored', 16, 80, 200),
    group('skeleton', 30, 24, 400),
    group('flyer', 24, 30, 800),
    group('runner', 24, 24, 1200),
  ],
];

/**
 * Fortaleza: two gates. Every new enemy, the big zombie from wave 6 and the ogre
 * from wave 11, and a finale of bosses with an escort of every kind.
 */
export const fortressWaves: readonly Wave[] = [
  // Two gates from the start, so the first waves split a small crowd between them.
  [group('soldier', 4, 90), east('soldier', 4, 90, 400)],
  [group('runner', 6, 50), east('soldier', 6, 70, 200)],
  [group('skeleton', 4, 80), east('soldier', 5, 70, 200)],
  [group('soldier', 6, 60), east('soldier', 4, 60), east('shaman', 2, 200, 200)],
  [east('flyer', 4, 60), group('skeleton', 6, 70), east('runner', 6, 40, 300)],
  // 6: the first big zombies.
  [group('big_zombie', 2, 240), east('soldier', 10, 50), group('armored', 2, 180, 300)],
  [east('armored', 4, 150), group('skeleton', 10, 50, 200), east('flyer', 6, 50, 400)],
  [east('big_zombie', 3, 200), group('shaman', 3, 180), group('soldier', 14, 40, 100), east('runner', 8, 35, 400)],
  [group('armored', 6, 130), east('flyer', 10, 40, 200), east('skeleton', 8, 45, 380), group('big_zombie', 2, 240, 380)],
  // 10: first boss.
  [
    group('boss', 1, 0, 300),
    east('soldier', 16, 45),
    group('shaman', 3, 200, 380),
    east('skeleton', 10, 50, 450),
    group('flyer', 8, 40, 680),
  ],
  // 11: the first ogre.
  [east('ogre', 1, 0, 200), group('soldier', 20, 30), east('runner', 14, 30, 380)],
  [group('ogre', 2, 320), east('armored', 8, 110), group('flyer', 12, 40, 300)],
  [east('big_zombie', 4, 160), group('skeleton', 14, 40), east('shaman', 4, 150, 300)],
  [east('ogre', 2, 240), group('armored', 8, 100), east('runner', 20, 25, 400), group('flyer', 10, 40, 450)],
  // 15: a boss through each gate.
  [
    group('boss', 1, 0, 200),
    east('boss', 1, 0, 600),
    east('ogre', 2, 320, 300),
    group('shaman', 4, 150, 200),
    east('skeleton', 14, 40, 380),
  ],
  [group('flyer', 24, 28), east('big_zombie', 5, 140), group('armored', 8, 100, 400)],
  [east('soldier', 30, 22), group('ogre', 3, 240), group('shaman', 5, 120, 200)],
  [group('skeleton', 24, 30), east('runner', 24, 22), group('big_zombie', 4, 160, 380)],
  [east('armored', 14, 80), group('ogre', 3, 240), group('flyer', 16, 35, 300), east('shaman', 6, 120, 300)],
  // 20: a boss through each gate, and an ogre.
  [
    group('boss', 1, 0),
    east('boss', 1, 0, 600),
    east('ogre', 1, 0, 300),
    east('shaman', 6, 120, 200),
    group('armored', 10, 100, 300),
    east('flyer', 14, 40, 600),
  ],
  [group('big_zombie', 8, 120), east('skeleton', 20, 30), group('flyer', 16, 35, 400)],
  [east('ogre', 4, 200), group('soldier', 30, 22), east('shaman', 6, 110, 300)],
  [group('runner', 30, 20), east('armored', 14, 80), east('flyer', 20, 30, 380)],
  [east('skeleton', 30, 25), group('big_zombie', 8, 120, 200), group('shaman', 8, 100, 300)],
  // 25: bosses again.
  [
    east('boss', 2, 480),
    group('ogre', 4, 200),
    east('armored', 12, 90, 300),
    group('skeleton', 20, 30, 380),
    east('flyer', 16, 35, 680),
  ],
  [group('flyer', 30, 24), east('ogre', 4, 200), group('big_zombie', 6, 120, 380)],
  [east('soldier', 40, 18), group('armored', 18, 70), east('shaman', 8, 100, 300)],
  [east('big_zombie', 10, 100), group('skeleton', 30, 24), group('ogre', 4, 200, 450)],
  [group('ogre', 6, 160), group('shaman', 10, 90, 200), east('flyer', 24, 28), east('runner', 24, 22, 450)],
  // 30: three bosses.
  [
    group('boss', 3, 400),
    east('armored', 16, 80),
    east('shaman', 8, 100, 200),
    group('big_zombie', 8, 120, 450),
    east('flyer', 20, 30, 680),
  ],
  [group('skeleton', 40, 20), east('ogre', 5, 180), group('flyer', 24, 28, 380)],
  [east('armored', 20, 65), group('big_zombie', 10, 100), group('shaman', 10, 90, 300), east('runner', 30, 20, 530)],
  [group('ogre', 8, 140), east('skeleton', 30, 24), east('flyer', 24, 28, 380), group('shaman', 10, 90, 400)],
  [east('boss', 2, 480), group('big_zombie', 12, 90), east('armored', 18, 70, 300), group('flyer', 24, 28, 530)],
  // 35: the siege. Bosses through both gates, ogres beside them and shamans behind.
  [
    group('boss', 3, 400),
    east('boss', 2, 480, 300),
    group('ogre', 6, 200, 200),
    east('ogre', 6, 200, 400),
    group('shaman', 8, 120, 300),
    east('shaman', 8, 120, 380),
    east('armored', 16, 80, 450),
    group('flyer', 20, 30, 750),
    east('skeleton', 30, 24, 900),
  ],
];

/** A group that shows up every wave and never packs tighter. Each one overrides what differs. */
const steady = { everyWaves: 1, intervalDropPerWave: 0, delayTicks: 0 };

function endless(values: Omit<EndlessGroup, keyof typeof steady> & Partial<EndlessGroup>): EndlessGroup {
  return { ...steady, ...values };
}

// Towers that can specialize outgrow the shared endless schedule, so the maps
// with branches add a crowd of their own that keeps growing until it wins. It
// starts gently, a few waves in, so the opening plays like the shared one.

const endlessSkeletons = endless({
  enemy: 'skeleton',
  fromWave: 4,
  baseCount: 3,
  countPerWave: 1.6,
  intervalTicks: 60,
  intervalDropPerWave: 1,
  minIntervalTicks: 18,
  delayTicks: 360,
});

const endlessShamans = endless({
  enemy: 'shaman',
  fromWave: 6,
  baseCount: 1,
  countPerWave: 0.4,
  intervalTicks: 180,
  intervalDropPerWave: 3,
  minIntervalTicks: 60,
  delayTicks: 200,
});

const endlessArmored = endless({
  enemy: 'armored',
  fromWave: 12,
  baseCount: 2,
  countPerWave: 1.5,
  intervalTicks: 120,
  intervalDropPerWave: 2,
  minIntervalTicks: 40,
  delayTicks: 450,
});

/**
 * From wave 23, bosses of their own every fifth wave, more each time. They
 * come between the shared ones, which fall on waves 25, 30, 35 and so on.
 */
const endlessBosses = endless({
  enemy: 'boss',
  fromWave: 22,
  everyWaves: 5,
  baseCount: 2,
  countPerWave: 0.15,
  intervalTicks: 500,
  minIntervalTicks: 500,
  delayTicks: 800,
});

/** What the swamp adds to the shared endless schedule. */
export const swampEndless: readonly EndlessGroup[] = [endlessSkeletons, endlessShamans, endlessArmored, endlessBosses];

/** What the fortress adds: the same, and the big zombie and the ogre. */
export const fortressEndless: readonly EndlessGroup[] = [
  ...swampEndless,
  endless({
    enemy: 'big_zombie',
    fromWave: 7,
    everyWaves: 2,
    baseCount: 2,
    countPerWave: 0.5,
    intervalTicks: 200,
    intervalDropPerWave: 3,
    minIntervalTicks: 70,
    delayTicks: 500,
  }),
  endless({
    enemy: 'ogre',
    fromWave: 11,
    everyWaves: 2,
    baseCount: 1,
    countPerWave: 0.3,
    intervalTicks: 360,
    intervalDropPerWave: 4,
    minIntervalTicks: 150,
    delayTicks: 300,
  }),
];
