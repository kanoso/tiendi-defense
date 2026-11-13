import Phaser from 'phaser';
import { DIFFICULTIES, findDifficulty, type DifficultyId } from '../data/difficulty';
import { MAP_IDS, MAPS, type GameMap } from '../data/maps';
import { findMode, GAME_MODES, type GameMode } from '../data/modes';
import { GAME_HEIGHT, GAME_WIDTH } from '../data/rules';
import { coopServerBase, isCoopServerUp } from '../net/CoopLink';
import { keepSpritesCrisp, loadSprites } from '../entities/sprites';
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
import { openLobby } from '../ui/lobby';

const MAX_STARS = 3;
const PANEL_COLOR = 0x22281d;
const PANEL_HOVER_COLOR = 0x2f3828;
const DIM_BORDER = 0x596150;

const CHOICES_TOP = 92;
const CHOICE_HEIGHT = 32;

const CARD_WIDTH = 270;
const CARD_HEIGHT = 150;
const CARD_GAP = 24;
const CARD_TOP = 142;

const HERO_TOP = 356;
const HERO_WIDTH = 204;
const HERO_HEIGHT = 150;
const HERO_GAP = 16;

const MAP_KEYS = ['ONE', 'TWO', 'THREE'];

// Positions are centers, in pixels of the 960 x 540 stage. They are kept so the
// browser tests can click what is on screen.
interface MapCard {
  mapId: string;
  unlocked: boolean;
  /** Stars earned at the difficulty currently selected. */
  stars: number;
  /** Best endless score at the difficulty currently selected, if any. */
  record: number | null;
  x: number;
  y: number;
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
  modeButtons: ChoiceButton<GameMode>[] = [];
  difficultyButtons: ChoiceButton<DifficultyId>[] = [];
  mode: GameMode = 'campaign';
  heroTiles: HeroTile[] = [];
  difficulty: DifficultyId = 'normal';
  available = 0;
  /** Where the co-op button is, when a server is available. */
  coopButton: { x: number; y: number } | null = null;
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
    void this.offerCoop();
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
    MAP_KEYS.forEach((key, index) => {
      keyboard?.on(`keydown-${key}`, () => this.openMap(this.cards[index]));
    });
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
  private async offerCoop(): Promise<void> {
    const server = coopServerBase();
    if (!(await isCoopServerUp(server)) || !this.scene.isActive()) return;

    const x = 16 + 75;
    const frame = this.panel(x, 30, 150, 32, true);
    this.clickable(frame, () => this.openCoopLobby(server));
    this.label(x, 30, 'Cooperativo', 15, '#ffe066', true);
    this.coopButton = { x, y: 30 };
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

  private drawMaps(progress: Progress): void {
    const total = MAPS.length * CARD_WIDTH + (MAPS.length - 1) * CARD_GAP;
    const left = (GAME_WIDTH - total) / 2;
    this.cards = MAPS.map((map, index) => {
      const card: MapCard = {
        mapId: map.id,
        unlocked: isUnlocked(progress, MAP_IDS, map.id),
        stars: starsOn(progress, map.id, this.difficulty),
        record: endlessBest(progress, map.id, this.difficulty)?.score ?? null,
        x: left + index * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2,
        y: CARD_TOP + CARD_HEIGHT / 2,
      };
      this.drawMapCard(map, card, index, progress);
      return card;
    });
  }

  private drawMapCard(map: GameMap, card: MapCard, index: number, progress: Progress): void {
    const top = card.y - CARD_HEIGHT / 2;
    const frame = this.panel(card.x, card.y, CARD_WIDTH, CARD_HEIGHT, card.unlocked);
    if (card.unlocked) this.clickable(frame, () => this.openMap(card));
    else frame.setAlpha(0.7);

    const faded = card.unlocked ? 1 : 0.55;
    this.label(card.x, top + 26, `${index + 1}. ${map.name}`, 22, '#f4f1e8', true).setAlpha(faded);
    this.add
      .text(card.x, top + 72, map.blurb, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#dfe8d5',
        align: 'center',
        wordWrap: { width: CARD_WIDTH - 36 },
      })
      .setOrigin(0.5)
      .setAlpha(faded);

    if (card.unlocked && this.mode === 'endless') {
      const best = endlessBest(progress, map.id, this.difficulty);
      const text = best ? `Récord: ${best.score} · oleada ${best.wave}` : 'Sin récord todavía';
      this.label(card.x, top + CARD_HEIGHT - 26, text, 16, '#ffe066', true);
    } else if (card.unlocked) {
      const earned = '★'.repeat(card.stars) + '☆'.repeat(MAX_STARS - card.stars);
      this.label(card.x, top + CARD_HEIGHT - 26, earned, 28, '#ffe066', true);
    } else {
      this.label(card.x, top + CARD_HEIGHT - 26, 'Gana el mapa anterior', 14, '#a9b3a0', true);
    }
  }

  private openMap(card: MapCard | undefined): void {
    if (card?.unlocked) {
      this.scene.start('game', {
        mapId: card.mapId,
        difficulty: this.difficulty,
        mode: this.mode,
      });
    }
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

    this.add.image(centerX - 66, HERO_TOP + 36, style.sprite).setScale(3);
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
