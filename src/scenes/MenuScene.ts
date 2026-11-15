import Phaser from 'phaser';
import { DIFFICULTIES, findDifficulty, type DifficultyId } from '../data/difficulty';
import { MAP_IDS, MAPS, type GameMap } from '../data/maps';
import { findMode, GAME_MODES, type GameMode } from '../data/modes';
import { GAME_HEIGHT, GAME_WIDTH } from '../data/rules';
import { coopServerBase, rejoinGame } from '../net/CoopLink';
import { onlineFeatures } from '../net/online';
import { startCloudSync, syncNow } from '../progress/cloudSync';
import { openAccountPanel } from '../ui/accountPanel';
import { continueLabel, type SavedGame } from '../progress/savedGame';
import { latestSavedGame, localSavedGame } from '../progress/savedGameSync';
import { clearTicket, loadTicket, tabStore } from '../net/rejoinTicket';
import { createIdleAnimations, idleAnimation, keepSpritesCrisp, loadSprites } from '../entities/sprites';
import { FONT, GROUND_SCALE, HERO_STYLE, SELECTION_COLOR } from '../entities/styles';
import {
  availableStars,
  buyHeroRank,
  endlessBest,
  heroRank,
  isUnlocked,
  MAX_HERO_RANK,
  nextRankCost,
  starsOn,
  totalStars,
  type Progress,
} from '../progress/progress';
import {
  loadDifficulty,
  loadMode,
  loadProgress,
  saveDifficulty,
  saveMode,
  saveProgress,
} from '../progress/storage';
import { RANK_BONUS } from '../progress/upgrades';
import { carouselStart, clampFirst } from '../ui/carousel';
import { openLobby } from '../ui/lobby';

const MAX_STARS = 3;
const PANEL_COLOR = 0x22281d;
const PANEL_HOVER_COLOR = 0x2f3828;
const DIM_BORDER = 0x596150;

const CHOICES_TOP = 92;
const CHOICE_HEIGHT = 32;

// The map cards keep one readable size. When there are more maps than fit, they
// sit on a strip that slides behind a window, with an arrow button on each side.
const CARD_WIDTH = 270;
const CARD_HEIGHT = 150;
const CARD_GAP = 14;
const CARD_TOP = 142;
const CARDS_SHOWN = 3;
/** Wide enough for a finger on a phone, where the stage is drawn at about 0.72. */
const ARROW_WIDTH = 56;
const WINDOW_WIDTH = CARDS_SHOWN * CARD_WIDTH + (CARDS_SHOWN - 1) * CARD_GAP;
const WINDOW_LEFT = (GAME_WIDTH - WINDOW_WIDTH) / 2;
const CARD_STEP = CARD_WIDTH + CARD_GAP;
const DOTS_Y = CARD_TOP + CARD_HEIGHT + 14;
const SLIDE_MS = 180;
/** A press that moves less than this is a tap; one that slides further sideways is a swipe. */
const TAP_SLOP = 14;
const SWIPE_MIN = 50;

const HERO_TOP = 356;
const HERO_WIDTH = 204;
const HERO_HEIGHT = 150;
const HERO_GAP = 16;

const MAP_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

// Positions are centers, in pixels of the 960 x 540 stage. They are kept so the
// browser tests can click what is on screen.
interface MapCard {
  mapId: string;
  unlocked: boolean;
  /** Stars earned at the difficulty currently selected. */
  stars: number;
  /** Best endless score at the difficulty currently selected, if any. */
  record: number | null;
  /** Inside the window of the carousel, where it can be clicked. */
  visible: boolean;
  x: number;
  y: number;
}

interface ArrowButton {
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
}

/** Where the map carousel stands. */
interface Carousel {
  /** Index of the first map in the window. */
  first: number;
  shown: number;
  total: number;
  /** True while the cards slide. */
  readonly moving: boolean;
  /** One per map: whether it is in the window. */
  dots: boolean[];
  prev: ArrowButton;
  next: ArrowButton;
}

interface ChoiceButton<Id extends string> {
  id: Id;
  selected: boolean;
  x: number;
  y: number;
}

interface HeroTile {
  heroType: string;
  rank: number;
  /** Stars the next rank costs, or null at the top rank. */
  cost: number | null;
  /** Where the buy button is. */
  x: number;
  y: number;
}

/**
 * A map can be opened directly with `?map=<id>` in the address (and optionally
 * `&difficulty=<id>` and `&mode=endless`), skipping this screen and ignoring locks. Handy for
 * development and for the browser tests. It only applies to the first screen
 * shown after loading the page.
 */
const address = new URLSearchParams(window.location.search);
let requestedMap = address.get('map');

/** The first screen: choose a difficulty and a map, and spend stars on the heroes. */
export class MenuScene extends Phaser.Scene {
  // What is on screen, for the browser tests.
  cards: MapCard[] = [];
  carousel: Carousel | null = null;
  /**
   * The carousel's place, kept while the menu is restarted or left for a game,
   * so it comes back where the player left it. Null before it is first drawn.
   */
  private keptFirst: number | null = null;
  /** The newest map open when the carousel was last drawn: a newer one is scrolled to. */
  private keptUnlocked = -1;
  private strip: Phaser.GameObjects.Container | null = null;
  private arrows: { prev: Phaser.GameObjects.Rectangle; next: Phaser.GameObjects.Rectangle } | null = null;
  private arrowGlyphs: { prev: Phaser.GameObjects.Text; next: Phaser.GameObjects.Text } | null = null;
  private dotMarks: Phaser.GameObjects.Arc[] = [];
  /** The card the current press started on, if any. */
  private pressedCard: MapCard | null = null;
  modeButtons: ChoiceButton<GameMode>[] = [];
  difficultyButtons: ChoiceButton<DifficultyId>[] = [];
  mode: GameMode = 'campaign';
  heroTiles: HeroTile[] = [];
  difficulty: DifficultyId = 'normal';
  available = 0;
  /** Where the co-op button is, when a server is available. */
  coopButton: { x: number; y: number } | null = null;
  /** The button to pick up a game left between waves, when there is one. */
  continueButton: { x: number; y: number; label: string } | null = null;
  /** The game that button continues. */
  private continuing: SavedGame | null = null;
  /** Where the button to keep progress under a code is, when the server keeps accounts. */
  accountButton: { x: number; y: number } | null = null;
  /** Where the full screen button is, when the browser allows one. */
  fullscreenButton: { x: number; y: number } | null = null;

  constructor() {
    super('menu');
  }

  preload(): void {
    loadSprites(this);
  }

  create(): void {
    if (requestedMap !== null) {
      const mapId = requestedMap;
      requestedMap = null;
      const difficulty = findDifficulty(address.get('difficulty') ?? loadDifficulty()).id;
      const mode = findMode(address.get('mode') ?? loadMode());
      this.scene.start('game', { mapId, difficulty, mode });
      return;
    }

    keepSpritesCrisp(this);
    createIdleAnimations(this);
    this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'grass')
      .setOrigin(0)
      .setTileScale(GROUND_SCALE);

    const progress = loadProgress();
    this.difficulty = loadDifficulty();
    this.mode = loadMode();
    this.available = availableStars(progress);

    this.heading(GAME_WIDTH / 2, 44, 'Tower Defense Heroes', 38);
    this.fullscreenButton = null;
    this.drawFullscreenButton();
    this.coopButton = null;
    this.accountButton = null;
    this.continueButton = null;
    this.drawContinue(localSavedGame());
    void this.offerOnlineFeatures();
    this.drawChoices();
    this.drawMaps(progress);
    this.heading(
      GAME_WIDTH / 2,
      HERO_TOP - 24,
      `Héroes   ·   Estrellas para gastar: ${this.available} de ${totalStars(progress)} ganadas`,
      17,
    );
    this.drawHeroes(progress);

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-C', () => this.continueGame());
    MAP_KEYS.slice(0, MAPS.length).forEach((key, index) => {
      keyboard?.on(`keydown-${key}`, () => this.openMap(this.cards[index], true));
    });
    keyboard?.on('keydown-LEFT', () => this.slideMaps(-1));
    keyboard?.on('keydown-RIGHT', () => this.slideMaps(1));
  }

  /** Offers to pick up the game left between waves, under the full screen button. */
  private drawContinue(saved: SavedGame | null): void {
    this.continuing = saved;
    if (!saved) return;
    // Narrow enough to stay clear of the title.
    const width = 240;
    const x = GAME_WIDTH - 16 - width / 2;
    const y = 72;
    const label = continueLabel(saved);
    const frame = this.panel(x, y, width, 32, true);
    this.clickable(frame, () => this.continueGame());
    this.label(x, y, label, 14, '#ffe066', true);
    this.continueButton = { x, y, label };
  }

  private continueGame(): void {
    if (this.continuing) this.scene.start('game', { resume: this.continuing });
  }

  /** Left out where the browser cannot go full screen, as on an iPhone. */
  private drawFullscreenButton(): void {
    if (!this.scale.fullscreen.available) return;
    const x = GAME_WIDTH - 16 - 85;
    const frame = this.panel(x, 30, 170, 32, false).setInteractive({ useHandCursor: true });
    const text = this.label(x, 30, '', 15, '#f4f1e8', true);
    const refresh = () => text.setText(this.scale.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa');
    refresh();
    // Browsers only allow going full screen from the release of a press.
    frame.on('pointerup', () => this.scale.toggleFullscreen());
    this.scale.on('enterfullscreen', refresh);
    this.scale.on('leavefullscreen', refresh);
    this.events.once('shutdown', () => {
      this.scale.off('enterfullscreen', refresh);
      this.scale.off('leavefullscreen', refresh);
    });
    this.fullscreenButton = { x, y: 30 };
  }

  // --- co-op -----------------------------------------------------------------

  /**
   * Shows the co-op button only when a server is there to answer it. The public
   * site has none, so the button would only lead to an error.
   */
  private async offerOnlineFeatures(): Promise<void> {
    const server = coopServerBase();
    const features = await onlineFeatures();
    if (!features || !this.scene.isActive()) return;

    // This tab was in a shared game when the page was reloaded: go straight back.
    const ticket = loadTicket(tabStore());
    if (ticket) {
      const link = await rejoinGame(server, ticket);
      if (link && this.scene.isActive()) {
        this.scene.start('game', { coop: link });
        return;
      }
      link?.leave();
      clearTicket(tabStore());
      if (!this.scene.isActive()) return;
    }

    const x = 16 + 75;
    const frame = this.panel(x, 30, 150, 32, true);
    this.clickable(frame, () => this.openCoopLobby(server));
    this.label(x, 30, 'Cooperativo', 15, '#ffe066', true);
    this.coopButton = { x, y: 30 };

    if (features.accounts) await this.offerAccount(server, features.googleClientId);
  }

  /**
   * The button to keep progress under a player code. With a code already in
   * use, the progress is brought up to date first: another device may have
   * earned something since.
   */
  private async offerAccount(server: string, googleClientId: string | null): Promise<void> {
    const cloud = startCloudSync(server);
    if (cloud.linked() && (await syncNow()) && this.scene.isActive()) {
      this.scene.restart();
      return;
    }
    // The account may hold a game left on another device, newer than this one's.
    const latest = cloud.linked() ? await latestSavedGame() : null;
    if (latest && latest.savedAt !== this.continuing?.savedAt && this.scene.isActive()) {
      this.scene.restart();
      return;
    }
    if (!this.scene.isActive()) return;

    const x = 16 + 75;
    const y = 70;
    const frame = this.panel(x, y, 150, 32, false);
    this.clickable(frame, () => {
      const keyboard = this.input.keyboard;
      if (keyboard) keyboard.enabled = false;
      this.input.enabled = false;
      let changed = false;
      const linkBefore = cloud.linkLabel();
      openAccountPanel({
        cloud,
        googleClientId,
        onProgressChanged: () => (changed = true),
        onClose: () => {
          if (keyboard) keyboard.enabled = true;
          this.input.enabled = true;
          // Stars from another device, or a code made or dropped, change what the menu shows.
          if (changed || cloud.linkLabel() !== linkBefore) this.scene.restart();
        },
      });
    });
    const label = cloud.signedInWithGoogle() ? 'Mi cuenta' : cloud.code() ? 'Mi código' : 'Guardar avance';
    this.label(x, y, label, 15, '#f4f1e8', true);
    this.accountButton = { x, y };
  }

  private openCoopLobby(server: string): void {
    // While the lobby is open, typing a name must not pick a map.
    const keyboard = this.input.keyboard;
    if (keyboard) keyboard.enabled = false;
    this.input.enabled = false;
    const restore = (): void => {
      if (keyboard) keyboard.enabled = true;
      this.input.enabled = true;
    };
    openLobby({
      server,
      mapId: this.coopMapId(),
      difficulty: this.difficulty,
      onClose: restore,
      onStart: (link) => {
        restore();
        this.scene.start('game', { coop: link });
      },
    });
  }

  /** A room created here plays the last map this player has unlocked. */
  private coopMapId(): string {
    const unlocked = this.cards.filter((card) => card.unlocked);
    return unlocked[unlocked.length - 1]?.mapId ?? MAPS[0].id;
  }

  // --- mode and difficulty -------------------------------------------------

  private drawChoices(): void {
    // One row: the game mode on the left, the difficulty on the right.
    const modeWidth = 110;
    const difficultyWidth = 104;
    const gap = 8;
    const y = CHOICES_TOP + CHOICE_HEIGHT / 2;
    let x = 118;

    const row = <Id extends string>(
      title: string,
      titleWidth: number,
      options: readonly { id: Id; name: string }[],
      selectedId: Id,
      width: number,
      onPick: (id: Id) => void,
    ): ChoiceButton<Id>[] => {
      this.heading(x + titleWidth / 2, y, title, 16);
      x += titleWidth + gap;
      const buttons = options.map((option) => {
        const button: ChoiceButton<Id> = {
          id: option.id,
          selected: option.id === selectedId,
          x: x + width / 2,
          y,
        };
        const frame = this.panel(button.x, y, width, CHOICE_HEIGHT, button.selected);
        this.clickable(frame, () => {
          onPick(option.id);
          this.scene.restart();
        });
        this.label(button.x, y, option.name, 15, button.selected ? '#ffe066' : '#f4f1e8');
        x += width + gap;
        return button;
      });
      x += 22;
      return buttons;
    };

    this.modeButtons = row('Modo', 50, GAME_MODES, this.mode, modeWidth, saveMode);
    this.difficultyButtons = row(
      'Dificultad',
      84,
      DIFFICULTIES,
      this.difficulty,
      difficultyWidth,
      saveDifficulty,
    );
  }

  // --- maps ----------------------------------------------------------------

  /**
   * The map cards on a strip seen through a window of three. It opens where the
   * player left it, unless a map was unlocked since: then on the newest one.
   */
  private drawMaps(progress: Progress): void {
    const unlocked = MAPS.map((map) => isUnlocked(progress, MAP_IDS, map.id));
    const newest = unlocked.lastIndexOf(true);
    this.keptFirst = carouselStart({
      kept: this.keptFirst,
      keptNewest: this.keptUnlocked,
      newest,
      total: MAPS.length,
      shown: CARDS_SHOWN,
    });
    this.keptUnlocked = newest;

    this.strip = this.add.container(-this.keptFirst * CARD_STEP, 0);
    // The window's shape is not on the display list, so the scene would not
    // free it: it goes with the menu, which restarts on every choice.
    const window = this.make.graphics({}, false);
    window.fillStyle(0xffffff).fillRect(WINDOW_LEFT - 4, CARD_TOP - 4, WINDOW_WIDTH + 8, CARD_HEIGHT + 8);
    const mask = window.createGeometryMask();
    this.strip.setMask(mask);
    this.events.once('shutdown', () => {
      mask.destroy();
      window.destroy();
    });

    this.cards = MAPS.map((map, index) => {
      const card: MapCard = {
        mapId: map.id,
        unlocked: unlocked[index],
        stars: starsOn(progress, map.id, this.difficulty),
        record: endlessBest(progress, map.id, this.difficulty)?.score ?? null,
        visible: false,
        x: 0,
        y: CARD_TOP + CARD_HEIGHT / 2,
      };
      this.drawMapCard(map, card, index, progress);
      return card;
    });

    this.drawArrows();
    this.dotMarks = MAPS.map((_, index) =>
      this.add.circle(GAME_WIDTH / 2 + (index - (MAPS.length - 1) / 2) * 18, DOTS_Y, 5, 0xffe066),
    );
    // A swipe across the cards moves along; a tap on one is handled by the card.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Cards hear the release first; after it, no press is on a card any more.
      this.pressedCard = null;
      if (pointer.downY < CARD_TOP || pointer.downY > CARD_TOP + CARD_HEIGHT) return;
      const dx = pointer.upX - pointer.downX;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(pointer.upY - pointer.downY)) return;
      this.slideMaps(dx < 0 ? 1 : -1);
    });
    this.placeCards(false);
  }

  /** The place that shows a map, one card in from the edge when there is room. */
  private firstShowing(index: number): number {
    return this.clampFirst(index - 1);
  }

  private clampFirst(first: number): number {
    return clampFirst(first, MAPS.length, CARDS_SHOWN);
  }

  /** The arrow on each side of the window. Dimmed, and deaf, at the end it points to. */
  private drawArrows(): void {
    const height = CARD_HEIGHT;
    const y = CARD_TOP + height / 2;
    const make = (x: number, glyph: string, step: number) => {
      const frame = this.panel(x, y, ARROW_WIDTH, height, true);
      frame
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.slideMaps(step))
        .on('pointerover', () => frame.setFillStyle(PANEL_HOVER_COLOR, 0.96))
        .on('pointerout', () => frame.setFillStyle(PANEL_COLOR, 0.94));
      return { frame, text: this.label(x, y - 3, glyph, 40, '#ffe066', true) };
    };
    const prev = make(WINDOW_LEFT / 2, '‹', -1);
    const next = make(GAME_WIDTH - WINDOW_LEFT / 2, '›', 1);
    this.arrows = { prev: prev.frame, next: next.frame };
    this.arrowGlyphs = { prev: prev.text, next: next.text };
  }

  /** Moves the window by `step` maps, if there are maps that way. */
  private slideMaps(step: number): void {
    if (this.keptFirst === null) return;
    const first = this.clampFirst(this.keptFirst + step);
    if (first === this.keptFirst) return;
    this.keptFirst = first;
    this.placeCards(true);
  }

  /** Brings the strip, the arrows, the dots and what the tests read up to the window's place. */
  private placeCards(animate: boolean): void {
    const first = this.keptFirst ?? 0;
    const offset = -first * CARD_STEP;
    this.cards.forEach((card, index) => {
      card.visible = index >= first && index < first + CARDS_SHOWN;
      card.x = WINDOW_LEFT + index * CARD_STEP + CARD_WIDTH / 2 + offset;
    });
    if (this.strip) {
      this.tweens.killTweensOf(this.strip);
      if (animate) {
        this.tweens.add({
          targets: this.strip,
          x: offset,
          duration: SLIDE_MS,
          ease: 'Cubic.easeOut',
        });
      } else {
        this.strip.x = offset;
      }
    }

    const last = Math.max(0, MAPS.length - CARDS_SHOWN);
    const arrow = (side: 'prev' | 'next', enabled: boolean): ArrowButton => {
      const frame = this.arrows![side];
      frame.setAlpha(enabled ? 1 : 0.35).setStrokeStyle(enabled ? 3 : 2, enabled ? SELECTION_COLOR : DIM_BORDER);
      if (frame.input) frame.input.enabled = enabled;
      if (!enabled) frame.setFillStyle(PANEL_COLOR, 0.94);
      this.arrowGlyphs![side].setAlpha(enabled ? 1 : 0.3);
      return { x: frame.x, y: frame.y, width: frame.width, height: frame.height, enabled };
    };
    const dots = this.cards.map((card) => card.visible);
    const strip = this.strip;
    this.dotMarks.forEach((dot, index) => dot.setFillStyle(dots[index] ? 0xffe066 : 0x596150));
    this.carousel = {
      first,
      shown: Math.min(CARDS_SHOWN, MAPS.length),
      total: MAPS.length,
      // Read when asked: the cards are still sliding until the strip reaches its place.
      get moving() {
        return strip !== null && Math.abs(strip.x - offset) > 0.5;
      },
      dots,
      prev: arrow('prev', first > 0),
      next: arrow('next', first < last),
    };
  }

  /** Draws a card on the strip, at its place counted from the strip's start. */
  private drawMapCard(map: GameMap, card: MapCard, index: number, progress: Progress): void {
    const x = WINDOW_LEFT + index * CARD_STEP + CARD_WIDTH / 2;
    const top = card.y - CARD_HEIGHT / 2;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const frame = this.panel(x, card.y, CARD_WIDTH, CARD_HEIGHT, card.unlocked);
    parts.push(frame);
    if (card.unlocked) {
      // Opened on release, and only by a tap that started on it, inside the
      // window: a press that slides is a swipe, and one let go here after
      // pressing an arrow is not meant for the card the arrow uncovers.
      frame
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (this.pressedCard = card))
        .on('pointerup', (pointer: Phaser.Input.Pointer) => {
          const inWindow = pointer.x >= WINDOW_LEFT && pointer.x <= WINDOW_LEFT + WINDOW_WIDTH;
          if (this.pressedCard === card && inWindow && pointer.getDistance() < TAP_SLOP) this.openMap(card);
        })
        .on('pointerover', () => frame.setFillStyle(PANEL_HOVER_COLOR, 0.96))
        .on('pointerout', () => frame.setFillStyle(PANEL_COLOR, 0.94));
    } else {
      frame.setAlpha(0.7);
    }

    const faded = card.unlocked ? 1 : 0.55;
    parts.push(this.label(x, top + 26, `${index + 1}. ${map.name}`, 22, '#f4f1e8', true).setAlpha(faded));
    parts.push(
      this.add
        .text(x, top + 72, map.blurb, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#dfe8d5',
          align: 'center',
          wordWrap: { width: CARD_WIDTH - 36 },
        })
        .setOrigin(0.5)
        .setAlpha(faded),
    );

    if (card.unlocked && this.mode === 'endless') {
      const best = endlessBest(progress, map.id, this.difficulty);
      const text = best ? `Récord: ${best.score} · oleada ${best.wave}` : 'Sin récord todavía';
      parts.push(this.label(x, top + CARD_HEIGHT - 26, text, 16, '#ffe066', true));
    } else if (card.unlocked) {
      const earned = '★'.repeat(card.stars) + '☆'.repeat(MAX_STARS - card.stars);
      parts.push(this.label(x, top + CARD_HEIGHT - 26, earned, 28, '#ffe066', true));
    } else {
      parts.push(this.label(x, top + CARD_HEIGHT - 26, 'Gana el mapa anterior', 14, '#a9b3a0', true));
    }
    this.strip!.add(parts);
  }

  /**
   * Starts a map, if it is open. A card is only opened while it is in the
   * window; a number key opens its map from anywhere, and the carousel is left
   * showing it for when the player comes back.
   */
  private openMap(card: MapCard | undefined, fromKey = false): void {
    if (!card?.unlocked || (!fromKey && !card.visible)) return;
    if (fromKey && !card.visible) this.keptFirst = this.firstShowing(this.cards.indexOf(card));
    this.scene.start('game', {
      mapId: card.mapId,
      difficulty: this.difficulty,
      mode: this.mode,
    });
  }

  // --- heroes --------------------------------------------------------------

  private drawHeroes(progress: Progress): void {
    const heroTypes = Object.keys(HERO_STYLE);
    const total = heroTypes.length * HERO_WIDTH + (heroTypes.length - 1) * HERO_GAP;
    const left = (GAME_WIDTH - total) / 2;

    this.heroTiles = heroTypes.map((heroType, index) => {
      const centerX = left + index * (HERO_WIDTH + HERO_GAP) + HERO_WIDTH / 2;
      const tile: HeroTile = {
        heroType,
        rank: heroRank(progress, heroType),
        cost: nextRankCost(progress, heroType),
        x: centerX,
        y: HERO_TOP + HERO_HEIGHT - 26,
      };
      this.drawHeroTile(tile, centerX, progress);
      return tile;
    });
  }

  private drawHeroTile(tile: HeroTile, centerX: number, progress: Progress): void {
    const style = HERO_STYLE[tile.heroType];
    this.panel(centerX, HERO_TOP + HERO_HEIGHT / 2, HERO_WIDTH, HERO_HEIGHT, false);

    // Standing on its feet, so the taller heroes grow upwards and stay inside the panel.
    this.add
      .sprite(centerX - 66, HERO_TOP + 71, style.sprite, 0)
      .setOrigin(0.5, 1)
      .setScale(3)
      .play(idleAnimation(style.sprite));
    this.add
      .text(centerX - 34, HERO_TOP + 14, style.name, {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#f4f1e8',
      })
      .setOrigin(0, 0);
    const pips = '●'.repeat(tile.rank) + '○'.repeat(MAX_HERO_RANK - tile.rank);
    this.add
      .text(centerX - 34, HERO_TOP + 38, `Rango ${pips}`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ffe066',
      })
      .setOrigin(0, 0);

    const percent = (bonus: number) => Math.round(tile.rank * bonus * 100);
    const effect =
      tile.rank === 0
        ? 'Sin mejoras todavía'
        : `+${percent(RANK_BONUS.damage)} % daño y vida\n−${percent(RANK_BONUS.cooldown)} % recarga`;
    this.add
      .text(centerX, HERO_TOP + 84, effect, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#dfe8d5',
        align: 'center',
      })
      .setOrigin(0.5);

    const affordable = tile.cost !== null && tile.cost <= this.available;
    const frame = this.panel(tile.x, tile.y, HERO_WIDTH - 24, 30, affordable);
    if (affordable) {
      this.clickable(frame, () => {
        saveProgress(buyHeroRank(progress, tile.heroType));
        this.scene.restart();
      });
    }
    const text = tile.cost === null ? 'Rango máximo' : `Mejorar · ${tile.cost} ★`;
    this.label(tile.x, tile.y, text, 14, affordable ? '#ffe066' : '#a9b3a0', true);
  }

  // --- drawing helpers -----------------------------------------------------

  private heading(x: number, y: number, text: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1f17',
        strokeThickness: size > 30 ? 7 : 4,
      })
      .setOrigin(0.5);
  }

  private label(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
    bold = false,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color,
      })
      .setOrigin(0.5);
  }

  /** A dark box. `highlighted` gives it the bright border of something selected or usable. */
  private panel(
    x: number,
    y: number,
    width: number,
    height: number,
    highlighted: boolean,
  ): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(x, y, width, height, PANEL_COLOR, 0.94)
      .setStrokeStyle(highlighted ? 3 : 2, highlighted ? SELECTION_COLOR : DIM_BORDER);
  }

  private clickable(frame: Phaser.GameObjects.Rectangle, onClick: () => void): void {
    frame
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', onClick)
      .on('pointerover', () => frame.setFillStyle(PANEL_HOVER_COLOR, 0.96))
      .on('pointerout', () => frame.setFillStyle(PANEL_COLOR, 0.94));
  }
}
