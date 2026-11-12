import type Phaser from 'phaser';
import {
  canUseAbility,
  heroMaxHp,
  isAlive,
  TICKS_PER_SECOND,
  type GameState,
  type Hero,
  type Level,
} from '../core/simulation';
import type { Aim } from '../entities/overlay';
import { ABILITY_KEYS, FONT, HERO_STYLE, SELECTION_COLOR } from '../entities/styles';

const CARD_WIDTH = 170;
const CARD_HEIGHT = 44;
const CARD_GAP = 8;

interface Card {
  heroId: number;
  frame: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

/** One card per hero along the bottom: name, level, health and ability state. */
export class HeroCards {
  private cards: Card[] = [];
  private bars: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private level: Level,
    heroes: readonly Hero[],
    onSelect: (heroId: number) => void,
  ) {
    const total = heroes.length * CARD_WIDTH + (heroes.length - 1) * CARD_GAP;
    const top = level.height - CARD_HEIGHT - 6;
    let left = (level.width - total) / 2;

    this.bars = scene.add.graphics().setDepth(11);
    for (const hero of heroes) {
      const frame = scene.add
        .rectangle(left, top, CARD_WIDTH, CARD_HEIGHT, 0x22281d, 0.92)
        .setOrigin(0)
        .setDepth(10)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSelect(hero.id));
      const title = scene.add
        .text(left + 8, top + 5, '', {
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#f4f1e8',
        })
        .setDepth(11);
      const status = scene.add
        .text(left + 8, top + 22, '', { fontFamily: FONT, fontSize: '12px', color: '#dfe8d5' })
        .setDepth(11);
      this.cards.push({ heroId: hero.id, frame, title, status });
      left += CARD_WIDTH + CARD_GAP;
    }
  }

  sync(game: GameState, selectedHeroId: number | null, aim: Aim | null): void {
    this.bars.clear();
    for (const card of this.cards) {
      const hero = game.heroes.find((candidate) => candidate.id === card.heroId);
      if (!hero) continue;
      const style = HERO_STYLE[hero.type];
      const abilities = this.level.heroTypes[hero.type].abilities;
      // One short state per ability, next to the key that triggers it.
      const states = abilities.map((_, index) => {
        const aiming = aim?.heroId === hero.id && aim.ability === index;
        return `${ABILITY_KEYS[index]}: ${this.abilityStatus(hero, index, aiming)}`;
      });
      const anyReady = abilities.some((_, index) => canUseAbility(game, this.level, hero, index));

      card.frame.setStrokeStyle(2, hero.id === selectedHeroId ? SELECTION_COLOR : 0x596150);
      card.title.setText(`${hero.id}  ${style.name} · Nv ${hero.level}`);
      card.status.setText(states.join('   '));
      card.status.setColor(anyReady ? '#ffe066' : '#a9b3a0');

      // Health along the bottom edge of the card.
      const left = card.frame.x + 2;
      const width = CARD_WIDTH - 4;
      const bottom = card.frame.y + CARD_HEIGHT - 5;
      const health = isAlive(hero) ? hero.hp / heroMaxHp(this.level, hero) : 0;
      this.bars.fillStyle(0x10140d, 1);
      this.bars.fillRect(left, bottom, width, 3);
      this.bars.fillStyle(0x4aa3ff, 1);
      this.bars.fillRect(left, bottom, width * Math.max(0, health), 3);
    }
  }

  private abilityStatus(hero: Hero, index: number, aiming: boolean): string {
    const unlockLevel = this.level.heroTypes[hero.type].abilities[index].unlockLevel;
    if (hero.level < unlockLevel) return `nivel ${unlockLevel}`;
    if (!isAlive(hero)) return 'caído';
    const cooldown = hero.abilityCooldowns[index];
    if (cooldown > 0) return `${Math.ceil(cooldown / TICKS_PER_SECOND)} s`;
    return aiming ? 'apunta' : 'lista';
  }
}
