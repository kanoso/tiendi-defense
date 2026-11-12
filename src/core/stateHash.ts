import type { GameState } from './types';

const PHASES = ['preparing', 'wave', 'won', 'lost'];

/**
 * A fingerprint of everything in the state that affects how the game goes on.
 * Two machines whose games agree get the same number; any difference, however
 * small, almost certainly gives another. Online play compares these to catch a
 * player whose simulation has drifted.
 *
 * What is kept only for drawing (last shot, heal and cast) is left out.
 */
export function hashState(game: GameState): number {
  const hash = new Fnv1a();
  hash.numbers(
    game.tick,
    PHASES.indexOf(game.phase),
    game.waveIndex,
    game.waveTick,
    game.nextEnemyId,
    game.nextTowerId,
    game.lives,
    game.gold,
    game.score,
    game.rng.state,
  );

  hash.numbers(game.spawnQueue.length);
  for (const spawn of game.spawnQueue) {
    hash.numbers(spawn.atTick, spawn.path);
    hash.text(spawn.enemy);
  }

  hash.numbers(game.enemies.length);
  for (const enemy of game.enemies) {
    hash.text(enemy.type);
    hash.numbers(
      enemy.id,
      enemy.path,
      enemy.distance,
      enemy.hp,
      enemy.maxHp,
      enemy.speed,
      enemy.blockedBy ?? -1,
      enemy.attackCooldownTicks,
      enemy.slowTicks,
      enemy.slowFactor,
      enemy.stunTicks,
    );
  }

  hash.numbers(game.heroes.length);
  for (const hero of game.heroes) {
    hash.text(hero.type);
    hash.numbers(
      hero.id,
      hero.x,
      hero.y,
      hero.targetX,
      hero.targetY,
      hero.hp,
      hero.respawnTicks,
      hero.xp,
      hero.level,
      hero.cooldownTicks,
      hero.healCooldownTicks,
      ...hero.abilityCooldowns,
    );
  }

  hash.numbers(game.towers.length);
  for (const tower of game.towers) {
    hash.text(tower.type);
    hash.numbers(tower.id, tower.slot, tower.level, tower.invested, tower.cooldownTicks);
  }

  hash.numbers(game.zones.length);
  for (const zone of game.zones) {
    hash.numbers(
      zone.x,
      zone.y,
      zone.radius,
      zone.ticksLeft,
      zone.pulseCooldownTicks,
      zone.slowFactor,
      zone.healAmount,
      zone.damage,
    );
  }
  return hash.value;
}

/** FNV-1a, 32 bits: small, fast and identical on every JavaScript engine. */
class Fnv1a {
  value = 0x811c9dc5;
  private float = new Float64Array(1);
  private bytes = new Uint8Array(this.float.buffer);

  /** Hashes the exact bits of each number, so even the last decimal counts. */
  numbers(...values: number[]): void {
    for (const value of values) {
      this.float[0] = value;
      for (let i = 0; i < 8; i++) this.byte(this.bytes[i]);
    }
  }

  text(value: string): void {
    for (let i = 0; i < value.length; i++) this.byte(value.charCodeAt(i) & 0xff);
    this.byte(0);
  }

  private byte(byte: number): void {
    this.value = Math.imul(this.value ^ byte, 0x01000193) >>> 0;
  }
}
