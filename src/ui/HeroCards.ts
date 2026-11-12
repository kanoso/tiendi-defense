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

export const HERO_CARD_HEIGHT = 56;

const CARD_WIDTH = 170;
const CARD_GAP = 8;
const BUTTON_HEIGHT = 24;
const BUTTON_GAP = 4;

const PANEL_COLOR = 0x22281d;
const BUTTON_COLOR = 0x39432f;
const DIM_BORDER = 0x596150;

interface AbilityButton {
  frame: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

interface Card {
  heroId: number;
  frame: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  /** One per ability of the hero, in order. */
  abilityButtons: AbilityButton[];
}

/**
 * One card per hero along the bottom: name, level, health and a button for each
 * ability. The buttons do what the ability keys do, so the game can be played by
 * touch alone.
 */
export class HeroCards {
  /** Read by the browser tests to find what to tap. */
  cards: Card[] = [];
  private bars: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private level: Level,
    heroes: readonly Hero[],
    onSelect: (heroId: number) => void,
    onAbility: (heroId: number, ability: number) => void,
  ) {
    const total = heroes.length * CARD_WIDTH + (heroes.length - 1) * CARD_GAP;
    const top = level.height - HERO_CARD_HEIGHT - 6;
    let left = (level.width - total) / 2;

    this.bars = scene.add.graphics().setDepth(11);
    for (const hero of heroes) {
      const frame = scene.add
        .rectangle(left, top, CARD_WIDTH, HERO_CARD_HEIGHT, PANEL_COLOR, 0.92)
        .setOrigin(0)
        .setDepth(10)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSelect(hero.id));
      const title = scene.add
        .text(left + 8, top + 4, '', {
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#f4f1e8',
        })
        .setDepth(11);

      const abilities = level.heroTypes[hero.type].abilities;
      const buttonWidth = (CARD_WIDTH - 8 - BUTTON_GAP * (abilities.length - 1)) / abilities.length;
      const buttonTop = top + HERO_CARD_HEIGHT - BUTTON_HEIGHT - 4;
      const abilityButtons = abilities.map((_, index) => {
        const buttonLeft = left + 4 + index * (buttonWidth + BUTTON_GAP);
        const buttonFrame = scene.add
          .rectangle(buttonLeft, buttonTop, buttonWidth, BUTTON_HEIGHT, BUTTON_COLOR)
          .setOrigin(0)
          .setDepth(11)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => onAbility(hero.id, index));
        const text = scene.add
          .text(buttonLeft + buttonWidth / 2, buttonTop + BUTTON_HEIGHT / 2, '', {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#dfe8d5',
          })
          .setOrigin(0.5)
          .setDepth(12);
        return { frame: buttonFrame, text };
      });

      this.cards.push({ heroId: hero.id, frame, title, abilityButtons });
      left += CARD_WIDTH + CARD_GAP;
    }
  }

  sync(game: GameState, selectedHeroId: number | null, aim: Aim | null): void {
    this.bars.clear();
    for (const card of this.cards) {
      const hero = game.heroes.find((candidate) => candidate.id === card.heroId);
      if (!hero) continue;

      card.frame.setStrokeStyle(2, hero.id === selectedHeroId ? SELECTION_COLOR : DIM_BORDER);
      card.title.setText(`${hero.id}  ${HERO_STYLE[hero.type].name} · Nv ${hero.level}`);

      card.abilityButtons.forEach((button, index) => {
        const ready = canUseAbility(game, this.level, hero, index);
        const aiming = aim?.heroId === hero.id && aim.ability === index;
        button.text
          .setText(`${ABILITY_KEYS[index]} ${this.abilityStatus(hero, index, aiming)}`)
          .setColor(ready ? '#ffe066' : '#a9b3a0');
        button.frame.setStrokeStyle(aiming ? 2 : 1, ready ? SELECTION_COLOR : DIM_BORDER);
      });

      // Health between the name and the buttons.
      const left = card.frame.x + 6;
      const width = CARD_WIDTH - 12;
      const barTop = card.frame.y + 22;
      const health = isAlive(hero) ? hero.hp / heroMaxHp(this.level, hero) : 0;
      this.bars.fillStyle(0x10140d, 1);
      this.bars.fillRect(left, barTop, width, 3);
      this.bars.fillStyle(0x4aa3ff, 1);
      this.bars.fillRect(left, barTop, width * Math.max(0, health), 3);
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
