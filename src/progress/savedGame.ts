import { step, type GameState, type Level } from '../core/simulation';
import { applyDifficulty, DIFFICULTY_IDS, findDifficulty, type DifficultyId } from '../data/difficulty';
import { asEndless } from '../data/endless';
import { findMap, MAP_IDS } from '../data/maps';
import type { GameMode } from '../data/modes';
import { applyHeroRanks } from './upgrades';

// A game left between two waves, to be picked up later on this device or
// another one. What comes back from storage or the server may be old, edited by
// hand or broken, so it is checked thoroughly before the game trusts it.

export const SAVED_GAME_VERSION = 1;

export interface SavedGame {
  version: number;
  /** Tells this game from any other, so finishing it only clears its own save. */
  gameId: string;
  mapId: string;
  difficulty: DifficultyId;
  mode: GameMode;
  /** When it was saved, to keep the latest one between devices. */
  savedAt: string;
  state: GameState;
}

/** The level a player meets on a map: at that difficulty, with their hero ranks, in that mode. */
export function playerLevel(
  mapId: string,
  difficulty: DifficultyId,
  mode: GameMode,
  heroRanks: Readonly<Record<string, number>>,
): Level {
  const atDifficulty = applyDifficulty(findMap(mapId).level, difficulty);
  const withRanks = applyHeroRanks(atDifficulty, heroRanks);
  return mode === 'endless' ? asEndless(withRanks) : withRanks;
}

/** A save of the game as it is now. A copy: the game going on does not change it. */
export function makeSavedGame(game: {
  gameId: string;
  mapId: string;
  difficulty: DifficultyId;
  mode: GameMode;
  state: GameState;
}): SavedGame {
  return {
    version: SAVED_GAME_VERSION,
    gameId: game.gameId,
    mapId: game.mapId,
    difficulty: game.difficulty,
    mode: game.mode,
    savedAt: new Date().toISOString(),
    state: structuredClone(game.state),
  };
}

/** For the menu: the map, how hard, and the wave it goes on from. */
export function describeSavedGame(saved: SavedGame): string {
  const map = findMap(saved.mapId);
  const parts = [map.name, findDifficulty(saved.difficulty).name];
  const wave = saved.state.waveIndex + 1;
  if (saved.mode === 'endless') parts.push('Sin fin', `oleada ${wave}`);
  else parts.push(`oleada ${wave}/${map.level.waves.length}`);
  return parts.join(' · ');
}

/** The save made last, of the two. */
export function newerSavedGame(a: SavedGame | null, b: SavedGame | null): SavedGame | null {
  if (!a || !b) return a ?? b;
  return Date.parse(b.savedAt) > Date.parse(a.savedAt) ? b : a;
}

// --- checking what comes back ----------------------------------------------------

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isWhole = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
/** A count of ticks: any finite number from zero up. */
const isTicks = (value: unknown): boolean => isNumber(value) && value >= 0;
const isNullOr = (value: unknown, check: (value: unknown) => boolean): boolean => value === null || check(value);
const isPoint = (value: unknown): boolean => isData(value) && isNumber(value.x) && isNumber(value.y);

/** A saved game that can be played, or null if anything about it is off. */
export function parseSavedGame(raw: unknown): SavedGame | null {
  if (!isData(raw) || raw.version !== SAVED_GAME_VERSION) return null;
  const { gameId, mapId, difficulty, mode, savedAt, state } = raw;
  if (typeof gameId !== 'string' || gameId === '' || gameId.length > 64) return null;
  if (typeof mapId !== 'string' || !MAP_IDS.includes(mapId)) return null;
  if (!DIFFICULTY_IDS.includes(difficulty as DifficultyId)) return null;
  if (mode !== 'campaign' && mode !== 'endless') return null;
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) return null;

  // Checked against the map as anyone would play it; ranks do not change its shape.
  const level = playerLevel(mapId, difficulty as DifficultyId, mode, {});
  if (!isPlayableState(state, level)) return null;

  const saved = {
    version: SAVED_GAME_VERSION,
    gameId,
    mapId,
    difficulty: difficulty as DifficultyId,
    mode,
    savedAt,
    state: state as unknown as GameState,
  } satisfies SavedGame;
  return playsOn(saved.state, level) ? saved : null;
}

function isPlayableState(state: unknown, level: Level): boolean {
  if (!isData(state)) return false;
  // Saved only between waves of a game still going on.
  if (state.phase !== 'preparing') return false;
  const lastWave = level.endless ? Number.MAX_SAFE_INTEGER : level.waves.length - 1;
  if (!isWhole(state.tick, 0) || !isWhole(state.waveIndex, 1, lastWave) || !isNumber(state.waveTick)) return false;
  if (!isWhole(state.lives, 1, 10_000) || !isNumber(state.gold) || state.gold < 0) return false;
  if (!isNumber(state.score) || state.score < 0) return false;
  if (!isWhole(state.nextEnemyId, 1) || !isWhole(state.nextTowerId, 1)) return false;
  if (!isData(state.rng) || !isNumber(state.rng.state)) return false;
  // Between waves the road is empty.
  if (!Array.isArray(state.enemies) || state.enemies.length > 0) return false;
  if (!Array.isArray(state.spawnQueue) || state.spawnQueue.length > 0) return false;
  if (!Array.isArray(state.zones) || !state.zones.every(isZone)) return false;
  return areHeroesOf(state.heroes, level) && areTowersOf(state.towers, level);
}

function areHeroesOf(heroes: unknown, level: Level): boolean {
  if (!Array.isArray(heroes) || heroes.length !== level.heroes.length) return false;
  return heroes.every((hero: unknown, index) => {
    if (!isData(hero)) return false;
    const type = level.heroTypes[level.heroes[index].type];
    return (
      hero.id === index + 1 &&
      hero.type === level.heroes[index].type &&
      [hero.x, hero.y, hero.targetX, hero.targetY, hero.hp, hero.xp].every(isNumber) &&
      isTicks(hero.respawnTicks) &&
      isWhole(hero.level, 1, level.xpThresholds.length) &&
      isTicks(hero.cooldownTicks) &&
      isTicks(hero.healCooldownTicks) &&
      Array.isArray(hero.abilityCooldowns) &&
      hero.abilityCooldowns.length === type.abilities.length &&
      hero.abilityCooldowns.every(isTicks) &&
      isNullOr(hero.lastShot, isData) &&
      isNullOr(hero.lastHeal, isData) &&
      isNullOr(hero.lastCast, isData)
    );
  });
}

function areTowersOf(towers: unknown, level: Level): boolean {
  if (!Array.isArray(towers)) return false;
  const slots = new Set<number>();
  return towers.every((tower: unknown) => {
    if (!isData(tower) || typeof tower.type !== 'string') return false;
    const type = level.towerTypes[tower.type];
    if (!type || !isWhole(tower.slot, 0, level.buildSlots.length - 1) || slots.has(tower.slot)) return false;
    slots.add(tower.slot);
    return (
      isWhole(tower.id, 1) &&
      isWhole(tower.level, 0, type.levels.length - 1) &&
      isNumber(tower.invested) &&
      isTicks(tower.cooldownTicks) &&
      isNullOr(tower.lastShot, isData)
    );
  });
}

function isZone(zone: unknown): boolean {
  return (
    isPoint(zone) &&
    isData(zone) &&
    [zone.radius, zone.ticksLeft, zone.pulseCooldownTicks].every(isNumber) &&
    typeof zone.damageType === 'string' &&
    typeof zone.hitsFlying === 'boolean'
  );
}

/** Whether the game survives being played on: a last guard against anything missed above. */
function playsOn(state: GameState, level: Level): boolean {
  try {
    const trial = structuredClone(state);
    step(trial, level, [{ type: 'startWave' }]);
    for (let tick = 0; tick < 30; tick++) step(trial, level);
    return isNumber(trial.gold) && trial.heroes.every((hero) => isNumber(hero.x) && isNumber(hero.hp));
  } catch {
    return false;
  }
}

/** The menu button's label: short enough to sit beside the title. */
export function continueLabel(saved: SavedGame): string {
  const map = findMap(saved.mapId);
  const wave = saved.state.waveIndex + 1;
  const of = saved.mode === 'endless' ? '' : `/${map.level.waves.length}`;
  return `Continuar · ${map.name} · ${wave}${of}`;
}
