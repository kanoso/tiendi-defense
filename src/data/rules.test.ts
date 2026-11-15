import { describe, expect, it } from 'vitest';
import { ENEMY_STYLE } from '../entities/styles';
import { MAPS } from './maps';
import { sharedRules, standardWaves } from './rules';

const enemies = sharedRules.enemyTypes;
const NEW_ENEMIES = ['shaman', 'skeleton', 'big_zombie', 'tiny_zombie', 'ogre'];

describe('the enemies with traits of their own', () => {
  it('are all known to the game and drawn', () => {
    for (const name of NEW_ENEMIES) {
      expect(Object.keys(enemies), name).toContain(name);
      expect(Object.keys(ENEMY_STYLE), name).toContain(name);
    }
  });

  it('each cost at least one life when they get out', () => {
    for (const [name, type] of Object.entries(enemies)) expect(type.livesCost, name).toBeGreaterThanOrEqual(1);
  });

  it('give each one its trait', () => {
    expect(enemies.shaman.healAura?.amount).toBeGreaterThan(0);
    expect(enemies.skeleton.revive?.hpFraction).toBe(0.5);
    expect(enemies.big_zombie.splitInto).toMatchObject({ type: 'tiny_zombie', count: 3 });
    expect(enemies.ogre.magicResist).toBeGreaterThan(0);
    expect(enemies.ogre.armor).toBe(0);
  });

  it('split only into enemies the game knows, which do not split again', () => {
    for (const type of Object.values(enemies)) {
      const into = type.splitInto?.type;
      if (into === undefined) continue;
      expect(Object.keys(enemies)).toContain(into);
      expect(enemies[into].splitInto).toBeUndefined();
    }
  });

  it('make the small zombie weaker and quicker than the big one', () => {
    expect(enemies.tiny_zombie.maxHp).toBeLessThan(enemies.soldier.maxHp);
    expect(enemies.tiny_zombie.speed).toBeGreaterThan(enemies.big_zombie.speed);
  });

  it('make the ogre slow and the toughest after the boss', () => {
    const others = Object.entries(enemies).filter(([name]) => name !== 'boss' && name !== 'ogre');
    for (const [name, type] of others) expect(enemies.ogre.maxHp, name).toBeGreaterThan(type.maxHp);
    expect(enemies.ogre.speed).toBeLessThan(enemies.soldier.speed);
  });

  it('are not sent by the campaign waves of the first three maps', () => {
    for (const map of MAPS.slice(0, 3)) {
      const sent = new Set(map.level.waves.flatMap((wave) => wave.map((group) => group.enemy)));
      for (const name of NEW_ENEMIES) expect(sent.has(name), `${map.id} ${name}`).toBe(false);
    }
    const standard = new Set(standardWaves.flatMap((wave) => wave.map((group) => group.enemy)));
    for (const name of NEW_ENEMIES) expect(standard.has(name), name).toBe(false);
  });
});
