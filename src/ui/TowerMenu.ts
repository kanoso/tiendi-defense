import Phaser from 'phaser';
import {
  sellValue,
  towerAt,
  upgradeCost,
  type Command,
  type GameState,
  type Level,
} from '../core/simulation';
import { FONT, TOWER_STYLE } from '../entities/styles';

const MENU_WIDTH = 150;
const ROW_HEIGHT = 34;

interface Entry {
  text: Phaser.GameObjects.Text;
  /** Gold the option needs. Zero when it costs nothing. */
  cost: number;
}

/** The options for one build slot: build on an empty one, upgrade or sell a tower. */
export class TowerMenu {
  /** Slot the menu is open for, or null when it is closed. */
  slot: number | null = null;
  private entries: Entry[] = [];
  private backing: Phaser.GameObjects.Rectangle | null = null;

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    private onCommand: (command: Command) => void,
  ) {}

  open(game: GameState, slot: number): void {
    this.close();
    this.slot = slot;

    const options: { label: string; cost: number; command: Command }[] = [];
    const tower = towerAt(game, slot);
    if (!tower) {
      for (const [id, type] of Object.entries(this.level.towerTypes)) {
        const cost = type.levels[0].cost;
        options.push({
          label: `${TOWER_STYLE[id].name}  ${cost}`,
          cost,
          command: { type: 'buildTower', slot, tower: id },
        });
      }
    } else {
      const cost = upgradeCost(this.level, tower);
      if (cost !== null) {
        options.push({ label: `Mejorar  ${cost}`, cost, command: { type: 'upgradeTower', slot } });
      }
      options.push({
        label: `Vender  +${sellValue(this.level, tower)}`,
        cost: 0,
        command: { type: 'sellTower', slot },
      });
    }

    // Beside the slot, flipped or shifted when it would leave the map.
    const point = this.level.buildSlots[slot];
    const height = options.length * ROW_HEIGHT;
    const fitsRight = point.x + 30 + MENU_WIDTH <= this.level.width - 8;
    const left = fitsRight ? point.x + 30 : point.x - 30 - MENU_WIDTH;
    const top = Phaser.Math.Clamp(point.y - height / 2, 8, this.level.height - height - 8);

    // A solid panel behind the rows, so the map does not show through the gaps.
    this.backing = this.scene.add
      .rectangle(left, top, MENU_WIDTH, height, 0x22281d)
      .setOrigin(0)
      .setDepth(14);

    this.entries = options.map((option, index) => {
      const text = this.scene.add
        .text(left, top + index * ROW_HEIGHT, option.label, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#f4f1e8',
          backgroundColor: '#22281d',
          padding: { x: 10, y: 7 },
          fixedWidth: MENU_WIDTH,
        })
        .setDepth(15)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.onCommand(option.command);
          // Destroying the button inside its own event is unsafe; do it after.
          this.scene.time.delayedCall(0, () => this.close());
        });
      return { text, cost: option.cost };
    });
  }

  close(): void {
    for (const entry of this.entries) entry.text.destroy();
    this.entries = [];
    this.backing?.destroy();
    this.backing = null;
    this.slot = null;
  }

  /** Dims the options the player cannot afford yet. */
  sync(gold: number): void {
    for (const entry of this.entries) entry.text.setAlpha(gold >= entry.cost ? 1 : 0.45);
  }
}
