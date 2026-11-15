import Phaser from 'phaser';
import type { Point } from '../core/path';
import { isSlotBlocked, type GameState, type Level } from '../core/simulation';
import { drawOpenSlot } from './board';
import { rubbleAlpha } from './rubble';
import { FONT, SLOT_RADIUS } from './styles';

/**
 * The boulders of the pile, around the middle of the spot, back ones first.
 * Bigger and darker than the pebbles scattered on the grass, on a patch of bare
 * earth, so a blocked spot never passes for scenery.
 */
const BOULDERS: readonly { dx: number; dy: number; radius: number }[] = [
  { dx: 0, dy: -6, radius: 10 },
  { dx: -9, dy: 4, radius: 9 },
  { dx: 9, dy: 5, radius: 8 },
];
const EARTH_COLOR = 0x6b4a2b;
const OUTLINE_COLOR = 0x2b2924;
const SHADE_COLOR = 0x67625a;
const STONE_COLOR = 0x9a948a;
const SHINE_COLOR = 0xc9c3b6;
/** The price is dimmed while the gold is not there. */
const UNAFFORDABLE_ALPHA = 0.55;

interface SpotView {
  slot: number;
  cost: number;
  /** The patch of earth and the boulders on it: what fades once the spot is cleared. */
  pile: Phaser.GameObjects.Graphics;
  price: Phaser.GameObjects.Text;
  /** The open slot ring, shown once the rocks are gone. */
  ring: Phaser.GameObjects.Graphics;
  /** Tick the spot was seen cleared, which the rocks fade from; null while it is blocked. */
  clearedAt: number | null;
}

/**
 * The build spots that start blocked: a pile of rocks with its price, which
 * fades into an open slot once the spot is cleared. Redrawn from the game each
 * frame, so a shared game's snapshot or a resumed save shows the right thing.
 */
export class BlockedSpots {
  private views: SpotView[] = [];
  private synced = false;

  constructor(
    scene: Phaser.Scene,
    private level: Level,
  ) {
    level.buildSlots.forEach((point, slot) => {
      if (point.clearCost === undefined) return;
      const pile = scene.add.graphics().setDepth(1);
      drawPile(pile, point);
      // On a dark tag, like the menu, so it reads on grass and on the road's edge alike.
      const price = scene.add
        .text(point.x, point.y + SLOT_RADIUS + 2, String(point.clearCost), {
          fontFamily: FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ffe066',
          backgroundColor: '#22281d',
          padding: { x: 5, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setDepth(3);
      const ring = scene.add.graphics().setDepth(1).setVisible(false);
      drawOpenSlot(ring, point);
      this.views.push({ slot, cost: point.clearCost, pile, price, ring, clearedAt: null });
    });
  }

  sync(game: GameState): void {
    for (const view of this.views) {
      const blocked = isSlotBlocked(game, this.level, view.slot);
      if (blocked) {
        view.clearedAt = null;
      } else if (view.clearedAt === null) {
        // Already cleared the first time it is drawn: no fade, the rocks are long gone.
        view.clearedAt = this.synced ? game.tick : Number.NEGATIVE_INFINITY;
      }
      const alpha = view.clearedAt === null ? 1 : rubbleAlpha(game.tick - view.clearedAt);
      view.pile.setAlpha(alpha).setVisible(alpha > 0);
      view.price.setVisible(blocked).setAlpha(game.gold >= view.cost ? 1 : UNAFFORDABLE_ALPHA);
      view.ring.setVisible(!blocked).setAlpha(1 - alpha);
    }
    this.synced = true;
  }

  /** How each spot is drawn right now, for the browser tests. Reads only. */
  describeForTests() {
    return this.views.map((view) => {
      const point = this.level.buildSlots[view.slot];
      return {
        slot: view.slot,
        x: point.x,
        y: point.y,
        cost: view.cost,
        rocks: view.pile.visible && view.pile.alpha > 0,
        price: view.price.visible ? view.price.text : null,
        priceAlpha: view.price.alpha,
        ring: view.ring.visible && view.ring.alpha > 0,
      };
    });
  }
}

/** A patch of bare earth with a few boulders on it, each outlined, shaded and lit from the top left. */
function drawPile(graphics: Phaser.GameObjects.Graphics, point: Point): void {
  graphics.fillStyle(EARTH_COLOR, 0.6);
  graphics.fillEllipse(point.x, point.y + 4, (SLOT_RADIUS + 4) * 2, (SLOT_RADIUS - 2) * 2);
  for (const { dx, dy, radius } of BOULDERS) {
    const x = point.x + dx;
    const y = point.y + dy;
    graphics.fillStyle(OUTLINE_COLOR, 1);
    graphics.fillCircle(x, y, radius + 2);
    graphics.fillStyle(SHADE_COLOR, 1);
    graphics.fillCircle(x, y, radius);
    graphics.fillStyle(STONE_COLOR, 1);
    graphics.fillCircle(x - 1, y - 2, radius - 2);
    graphics.fillStyle(SHINE_COLOR, 1);
    graphics.fillCircle(x - radius / 3, y - radius / 2.5, radius / 3);
  }
}
