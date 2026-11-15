import Phaser from 'phaser';
import type { Command, GameState, Level } from '../core/simulation';
import { FONT } from '../entities/styles';
import { missingGold, towerOptions, type TowerOption } from './towerOptions';

const MENU_WIDTH = 150;
/** Wider when it offers branches, so their line about what they do fits. */
const BRANCH_MENU_WIDTH = 236;
const ROW_HEIGHT = 34;
/** A branch is a big button, easy to hit with a finger: name and price, what it does, and why it is out of reach. */
const BRANCH_ROW_HEIGHT = 66;
const BACKGROUND = '#22281d';
const BRANCH_BACKGROUND = '#2d3526';

interface Entry {
  text: Phaser.GameObjects.Text;
  /** Gold the option needs. Zero when it costs nothing. */
  cost: number;
  /** Only branches have these: what it does, and what is missing to take it. */
  detail: Phaser.GameObjects.Text | null;
  reason: Phaser.GameObjects.Text | null;
}

/** The options for one build slot: build on an empty one, upgrade, specialize or sell a tower. */
export class TowerMenu {
  /** Slot the menu is open for, or null when it is closed. */
  slot: number | null = null;
  private entries: Entry[] = [];
  private backing: Phaser.GameObjects.Rectangle | null = null;
  private gold = 0;

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    private onCommand: (command: Command) => void,
  ) {}

  open(game: GameState, slot: number): void {
    this.close();
    this.slot = slot;

    const options = towerOptions(game, this.level, slot);
    const hasBranches = options.some((option) => option.detail !== null);
    const width = hasBranches ? BRANCH_MENU_WIDTH : MENU_WIDTH;
    const heightOf = (option: TowerOption) => (option.detail === null ? ROW_HEIGHT : BRANCH_ROW_HEIGHT);

    // Beside the slot, flipped or shifted when it would leave the map.
    const point = this.level.buildSlots[slot];
    const height = options.reduce((sum, option) => sum + heightOf(option), 0);
    const fitsRight = point.x + 30 + width <= this.level.width - 8;
    const left = fitsRight ? point.x + 30 : point.x - 30 - width;
    const top = Phaser.Math.Clamp(point.y - height / 2, 8, this.level.height - height - 8);

    // A solid panel behind the rows, so the map does not show through the gaps.
    this.backing = this.scene.add.rectangle(left, top, width, height, 0x22281d).setOrigin(0).setDepth(14);

    let y = top;
    this.entries = options.map((option) => {
      const rowHeight = heightOf(option);
      const isBranch = option.detail !== null;
      const text = this.scene.add
        .text(left, y, option.label, {
          fontFamily: FONT,
          fontSize: '15px',
          fontStyle: isBranch ? 'bold' : 'normal',
          color: isBranch ? '#ffe066' : '#f4f1e8',
          backgroundColor: isBranch ? BRANCH_BACKGROUND : BACKGROUND,
          padding: { x: 10, y: 7 },
          fixedWidth: width,
          // The whole row answers a tap, not only its first line.
          fixedHeight: rowHeight - (isBranch ? 2 : 0),
        })
        .setDepth(15)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.choose(option));
      const small = (offset: number, line: string, color: string) =>
        this.scene.add
          .text(left + 10, y + offset, line, {
            fontFamily: FONT,
            fontSize: '12px',
            color,
            wordWrap: { width: width - 20 },
          })
          .setDepth(16);
      const detail = isBranch ? small(28, option.detail!, '#f4f1e8') : null;
      const reason = isBranch ? small(45, '', '#ff9f80') : null;
      y += rowHeight;
      return { text, cost: option.cost, detail, reason };
    });
    this.sync(game.gold);
  }

  /** A branch the player cannot afford stays shut; it already says why. */
  private choose(option: TowerOption): void {
    if (option.detail !== null && missingGold(option.cost, this.gold) !== null) return;
    this.onCommand(option.command);
    // Destroying the button inside its own event is unsafe; do it after.
    this.scene.time.delayedCall(0, () => this.close());
  }

  close(): void {
    for (const entry of this.entries) {
      entry.text.destroy();
      entry.detail?.destroy();
      entry.reason?.destroy();
    }
    this.entries = [];
    this.backing?.destroy();
    this.backing = null;
    this.slot = null;
  }

  /** What each option shows and where it is, in map pixels, for the browser tests. Reads only. */
  describeForTests() {
    return this.entries.map(({ text, reason }) => {
      const center = text.getCenter();
      return { label: text.text, reason: reason?.text || null, x: center.x, y: center.y, height: text.height };
    });
  }

  /** Dims the options the player cannot afford yet; branches also say how much is missing. */
  sync(gold: number): void {
    this.gold = gold;
    for (const entry of this.entries) {
      const alpha = gold >= entry.cost ? 1 : 0.45;
      entry.text.setAlpha(alpha);
      entry.detail?.setAlpha(alpha);
      const reason = missingGold(entry.cost, gold) ?? '';
      if (entry.reason && entry.reason.text !== reason) entry.reason.setText(reason);
    }
  }
}
