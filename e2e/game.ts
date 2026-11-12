import { expect, type Page } from '@playwright/test';

// Helpers that drive the real game in a browser. The game draws on a canvas,
// so tests click by map coordinates and read the state the page exposes.

const MAP_WIDTH = 960;
const MAP_HEIGHT = 540;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Scene = any;

export interface Snapshot {
  phase: string;
  lives: number;
  gold: number;
  wave: number;
  enemies: number;
  towers: { slot: number; type: string; level: number }[];
  heroes: { id: number; targetX: number; targetY: number; level: number; cast: boolean }[];
  zones: number;
  selectedHeroId: number | null;
  targetingHeroId: number | null;
  menu: string[];
  endTitle: string | null;
  /** The message shown near the top, while it is visible. */
  notice: string | null;
  /** The line under the status bar: a tutorial step or the key summary. */
  hint: string;
  tick: number;
  /** Real time the game has been running, as its own frame clock counts it. */
  clockMs: number;
  speed: number;
  paused: boolean;
}

export async function openGame(page: Page): Promise<void> {
  await page.goto('/?map=meadow');
  await page.waitForFunction(() => {
    const scene: Scene = (window as any).__game?.scene.getScene('game');
    return Boolean(scene?.game_ && scene?.towerMenu);
  });
}

export function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const scene: Scene = (window as any).__game.scene.getScene('game');
    const game = scene.game_;
    return {
      phase: game.phase,
      lives: game.lives,
      gold: game.gold,
      wave: game.waveIndex + 1,
      enemies: game.enemies.length,
      towers: game.towers.map((t: any) => ({ slot: t.slot, type: t.type, level: t.level })),
      heroes: game.heroes.map((h: any) => ({
        id: h.id,
        targetX: h.targetX,
        targetY: h.targetY,
        level: h.level,
        cast: h.lastCast !== null,
      })),
      zones: game.zones.length,
      selectedHeroId: scene.selectedHeroId,
      targetingHeroId: scene.aim ? scene.aim.heroId : null,
      menu: scene.towerMenu.entries.map((entry: any) => entry.text.text),
      endTitle: game.phase === 'won' || game.phase === 'lost' ? scene.bigTitle.text : null,
      notice: scene.notice.alpha > 0 ? scene.notice.text : null,
      hint: scene.hint.text,
      tick: game.tick,
      clockMs: scene.time.now,
      speed: scene.speed,
      paused: scene.paused,
    };
  });
}

/** Clicks a point given in map coordinates, wherever the canvas ended up on screen. */
export async function clickMap(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('The game canvas is not on the page');
  await page.mouse.click(
    box.x + (x * box.width) / MAP_WIDTH,
    box.y + (y * box.height) / MAP_HEIGHT,
  );
}

/** Position of a build slot, read from the level the game is running. */
export function slotPosition(page: Page, slot: number): Promise<{ x: number; y: number }> {
  return page.evaluate((index) => {
    const scene: Scene = (window as any).__game.scene.getScene('game');
    const point = scene.level.buildSlots[index];
    return { x: point.x, y: point.y };
  }, slot);
}

export async function clickSlot(page: Page, slot: number): Promise<void> {
  const point = await slotPosition(page, slot);
  await clickMap(page, point.x, point.y);
}

/** Clicks the open tower menu option whose label starts with `label`. */
export async function clickMenuOption(page: Page, label: string): Promise<void> {
  const center = await page.evaluate((wanted) => {
    const scene: Scene = (window as any).__game.scene.getScene('game');
    const entry = scene.towerMenu.entries.find((e: any) => e.text.text.startsWith(wanted));
    if (!entry) return null;
    return { x: entry.text.x + entry.text.width / 2, y: entry.text.y + entry.text.height / 2 };
  }, label);
  expect(center, `menu option "${label}"`).not.toBeNull();
  await clickMap(page, center!.x, center!.y);
}

/**
 * Test setup only: lifts every hero to a level, as if they had earned the
 * experience, so ability tests do not have to play through a whole wave first.
 */
export function giveHeroesLevel(page: Page, heroLevel: number): Promise<void> {
  return page.evaluate((wanted) => {
    const scene: Scene = (window as any).__game.scene.getScene('game');
    for (const hero of scene.game_.heroes) {
      hero.level = wanted;
      hero.xp = scene.level.xpThresholds[wanted - 1];
    }
  }, heroLevel);
}

/** Test setup only: ends the game at once, as if the last life had been lost. */
export function forceDefeat(page: Page): Promise<void> {
  return page.evaluate(() => {
    const scene: Scene = (window as any).__game.scene.getScene('game');
    scene.game_.lives = 0;
    scene.game_.phase = 'lost';
  });
}
