import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { applyHeroRanks, RANK_BONUS } from './upgrades';

const level = MAPS[0].level;

describe('applyHeroRanks', () => {
  it('leaves heroes without ranks as they are', () => {
    expect(applyHeroRanks(level, {}).heroTypes).toEqual(level.heroTypes);
  });

  it('raises the damage and health of a ranked hero', () => {
    const upgraded = applyHeroRanks(level, { warrior: 2 }).heroTypes.warrior;
    const base = level.heroTypes.warrior;
    expect(upgraded.damage).toBeCloseTo(base.damage * (1 + 2 * RANK_BONUS.damage));
    expect(upgraded.maxHp).toBe(Math.round(base.maxHp * (1 + 2 * RANK_BONUS.health)));
  });

  it('raises the damage of its abilities, zones included', () => {
    const upgraded = applyHeroRanks(level, { mage: 1 }).heroTypes.mage;
    const base = level.heroTypes.mage;
    const boost = 1 + RANK_BONUS.damage;
    expect(upgraded.abilities[0].damage).toBeCloseTo(base.abilities[0].damage * boost);
    expect(upgraded.abilities[1].zone?.damage).toBeCloseTo(base.abilities[1].zone!.damage * boost);
  });

  it('shortens the cooldown of its abilities', () => {
    const upgraded = applyHeroRanks(level, { archer: 3 }).heroTypes.archer;
    const base = level.heroTypes.archer;
    expect(upgraded.abilities[0].cooldownTicks).toBe(
      Math.round(base.abilities[0].cooldownTicks * (1 - 3 * RANK_BONUS.cooldown)),
    );
    expect(upgraded.abilities[0].cooldownTicks).toBeLessThan(base.abilities[0].cooldownTicks);
  });

  it('touches only the heroes that have ranks', () => {
    const upgraded = applyHeroRanks(level, { warrior: 3 });
    expect(upgraded.heroTypes.mage).toEqual(level.heroTypes.mage);
  });

  it('ignores ranks for heroes the level does not have', () => {
    expect(applyHeroRanks(level, { dragon: 3 }).heroTypes).toEqual(level.heroTypes);
  });

  it('does not change the level it was given', () => {
    const before = structuredClone(level.heroTypes);
    applyHeroRanks(level, { warrior: 3, mage: 3 });
    expect(level.heroTypes).toEqual(before);
  });
});
