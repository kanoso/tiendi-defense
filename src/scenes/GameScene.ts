import Phaser from 'phaser';
import { createFixedStepper, type FixedStepper } from '../core/fixedStep';
import { pointAt, type Point } from '../core/path';
import {
  canUseAbility,
  createGame,
  isAlive,
  isMoving,
  isOver,
  step,
  STEP_MS,
  TICKS_PER_SECOND,
  type Command,
  type GameState,
  type Hero,
  type Level,
} from '../core/simulation';
import { applyDifficulty, findDifficulty, type DifficultyId } from '../data/difficulty';
import { findMap, MAPS, type GameMap } from '../data/maps';
import { drawBoard } from '../entities/board';
import { drawOverlay, type Aim } from '../entities/overlay';
import { keepSpritesCrisp, loadSprites } from '../entities/sprites';
import {
  ABILITY_KEYS,
  ENEMY_STYLE,
  FONT,
  HERO_RADIUS,
  HERO_SCALE,
  HERO_STYLE,
  SLOT_RADIUS,
  TOWER_BASE_SCALE,
  TOWER_ICON_SCALE,
  TOWER_STYLE,
} from '../entities/styles';
import { HeroCards } from '../ui/HeroCards';
import { TowerMenu } from '../ui/TowerMenu';
import { recordVictory, starsFor } from '../progress/progress';
import { loadProgress, saveProgress } from '../progress/storage';
import { applyHeroRanks } from '../progress/upgrades';
import { listen, soundEventsSince, type Heard } from '../ui/soundEvents';
import { loadSounds, SoundPlayer } from '../ui/SoundPlayer';
import { Tutorial } from '../ui/tutorial';

const HERO_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'];

const KEY_SUMMARY =
  '1-4: héroe · clic: mover · Q y W: habilidades · clic en +: torre · F: velocidad · P: pausa · M: sonido';

const TOUCH_SUMMARY =
  'Toca un héroe o su tarjeta para elegirlo y el mapa para moverlo. Sus habilidades están en la tarjeta. Toca un + para construir.';

/** Extra distance around a hero or a build slot that still counts as touching it. */
const TAP_MARGIN = 10;

const TUTORIAL_SEEN_KEY = 'tower-defense-heroes.tutorial-seen';

// Storage can be unavailable (private windows, blocked site data). The tutorial
// then simply shows again; the game never depends on it.
function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // Nothing to do: see above.
  }
}

interface HeroView {
  body: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Where it was last frame, to face the way it walks. */
  lastX: number;
}

interface EnemyView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse | null;
  lastX: number;
}

interface TowerView {
  base: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/**
 * Runs the simulation, draws its state and turns input into commands.
 * Holds no game rules: everything the player does goes through `pendingCommands`.
 */
export class GameScene extends Phaser.Scene {
  private map: GameMap = MAPS[0];
  private difficulty: DifficultyId = 'normal';
  private level: Level = MAPS[0].level;
  /** Stars earned by the victory on screen, once it has been saved. */
  private earnedStars: number | null = null;
  private game_!: GameState;
  private stepper!: FixedStepper;
  private pendingCommands: Command[] = [];

  private selectedHeroId: number | null = null;
  /** Targeted ability waiting for the player to pick a spot. */
  private aim: Aim | null = null;

  private enemyViews = new Map<number, EnemyView>();
  /** Where each enemy is drawn this frame, for the marks drawn around it. */
  private enemyPositions = new Map<number, Point>();
  private heroViews = new Map<number, HeroView>();
  private towerViews = new Map<number, TowerView>();
  private overlay!: Phaser.GameObjects.Graphics;

  private heroCards!: HeroCards;
  private towerMenu!: TowerMenu;
  private hud!: Phaser.GameObjects.Text;
  private notice!: Phaser.GameObjects.Text;
  /** Last level seen for each hero, to notice when one goes up. */
  private knownLevels = new Map<number, number>();

  /** How many simulation seconds pass per real second. */
  private speed = 1;
  private paused = false;
  /**
   * Whether the player's last input was a finger rather than a key or a mouse.
   * Decides which instructions to show; guessing from the device is unreliable.
   */
  private usingTouch = false;
  /** Missing where the browser cannot go full screen. */
  private fullscreenButton: Phaser.GameObjects.Text | null = null;
  /** Title of the pause and of the end of the game. */
  private bigTitle!: Phaser.GameObjects.Text;
  /** Every button on screen, by what it does. Also read by the browser tests. */
  private controls!: Record<
    'wave' | 'speed' | 'pause' | 'sound' | 'skip' | 'resume' | 'pauseMenu' | 'retry' | 'endMenu',
    Phaser.GameObjects.Text
  >;

  private tutorial!: Tutorial;
  private hint!: Phaser.GameObjects.Text;
  /** What the tutorial last saw, to tell when a wave starts or a tower appears. */
  private seenPhase: GameState['phase'] = 'preparing';
  private seenTowers = 0;

  private sounds!: SoundPlayer;
  /** The game as it was last frame, to tell which sounds this frame calls for. */
  private heard!: Heard;

  constructor() {
    super('game');
  }

  /** Both come from the menu. A restart passes nothing and keeps what it had. */
  init(data?: { mapId?: string; difficulty?: DifficultyId }): void {
    if (data?.mapId) this.map = findMap(data.mapId);
    if (data?.difficulty) this.difficulty = data.difficulty;
    // The map as this player meets it: at the chosen difficulty, with their hero ranks.
    const atDifficulty = applyDifficulty(this.map.level, this.difficulty);
    this.level = applyHeroRanks(atDifficulty, loadProgress().heroRanks);
  }

  preload(): void {
    loadSprites(this);
    loadSounds(this);
  }

  create(): void {
    keepSpritesCrisp(this);
    // The scene instance is reused on restart, so every field starts over here.
    this.game_ = createGame(this.level, Date.now());
    this.stepper = createFixedStepper(STEP_MS);
    this.pendingCommands = [];
    this.enemyViews.clear();
    this.enemyPositions.clear();
    this.heroViews.clear();
    this.towerViews.clear();
    this.knownLevels.clear();
    this.selectedHeroId = this.game_.heroes[0]?.id ?? null;
    this.aim = null;
    this.speed = 1;
    this.paused = false;
    this.tutorial = new Tutorial(hasSeenTutorial());
    this.seenPhase = this.game_.phase;
    this.seenTowers = 0;
    this.sounds = new SoundPlayer(this);
    this.heard = listen(this.game_);
    this.earnedStars = null;

    drawBoard(this, this.level);
    this.createHeroViews();
    this.overlay = this.add.graphics().setDepth(4);
    this.createInterface();
    this.bindInput();
  }

  update(_time: number, deltaMs: number): void {
    // Pausing and speeding up only change how much time the simulation is fed.
    const elapsed = this.paused ? 0 : deltaMs * this.speed;
    const alpha = this.stepper.advance(elapsed, () => {
      step(this.game_, this.level, this.pendingCommands);
      this.pendingCommands = [];
    });

    for (const event of soundEventsSince(this.heard, this.game_)) this.sounds.play(event);
    this.heard = listen(this.game_);
    this.recordVictoryOnce();
    this.followTutorial();
    this.stopAimingIfUnavailable();
    this.announceLevelUps();
    this.syncEnemies(this.game_.phase === 'wave' ? alpha : 0);
    this.syncHeroes();
    this.syncTowers();
    drawOverlay(this.overlay, {
      game: this.game_,
      level: this.level,
      selectedHeroId: this.selectedHeroId,
      menuSlot: this.towerMenu.slot,
      aim: this.aim,
      pointer: { x: this.input.activePointer.worldX, y: this.input.activePointer.worldY },
      enemyPositions: this.enemyPositions,
    });
    this.syncInterface();
  }

  // --- input -------------------------------------------------------------

  private bindInput(): void {
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        this.usingTouch = pointer.wasTouch;
        if (over.length > 0) return; // An interface element handled the click.
        if (isOver(this.game_)) return; // Only the buttons on screen do anything now.
        this.handleMapClick(pointer.worldX, pointer.worldY);
      },
    );

    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.on('keydown', () => (this.usingTouch = false));
    keyboard.on('keydown-SPACE', () => this.issue({ type: 'startWave' }));
    keyboard.on('keydown-F', () => this.toggleSpeed());
    keyboard.on('keydown-P', () => this.togglePause());
    keyboard.on('keydown-M', () => this.toggleSound());
    keyboard.on('keydown-T', () => this.skipTutorial());
    HERO_KEYS.forEach((key, index) => {
      keyboard.on(`keydown-${key}`, () => this.selectHero(index + 1));
    });
    ABILITY_KEYS.forEach((key, index) => {
      keyboard.on(`keydown-${key}`, () => this.useSelectedAbility(index));
    });
    keyboard.on('keydown-ESC', () => {
      this.aim = null;
      this.towerMenu.close();
    });
    // Back to the map picker: after the game ends, or from the pause screen.
    keyboard.on('keydown-ENTER', () => {
      if (isOver(this.game_) || this.paused) this.goToMenu();
    });
    keyboard.on('keydown-R', () => {
      if (isOver(this.game_)) this.scene.restart();
    });
  }

  /**
   * Every order from the player goes through here. Nothing is accepted while
   * paused: the simulation is frozen, so an order would only take effect later.
   */
  private issue(command: Command): void {
    if (this.paused) {
      this.refuse('Juego en pausa: pulsa P para continuar');
      return;
    }
    this.pendingCommands.push(command);
    if (command.type === 'moveHero') this.tutorial.handle('heroMoved');
  }

  private toggleSound(): void {
    this.sounds.toggleMuted();
    this.showNotice(this.sounds.muted ? 'Sonido desactivado' : 'Sonido activado');
  }

  private skipTutorial(): void {
    this.tutorial.skip();
    rememberTutorialSeen();
  }

  private goToMenu(): void {
    this.scene.start('menu');
  }

  /**
   * An ability button on a hero card: selects that hero and uses the ability.
   * Tapping the button of an ability being aimed cancels the aim instead.
   */
  private tapAbility(heroId: number, ability: number): void {
    const wasAiming = this.aim?.heroId === heroId && this.aim.ability === ability;
    this.selectHero(heroId);
    if (!wasAiming) this.useSelectedAbility(ability);
  }

  private toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
  }

  /** Saves the result the moment the game is won, so closing the tab cannot lose it. */
  private recordVictoryOnce(): void {
    if (this.game_.phase !== 'won' || this.earnedStars !== null) return;
    this.earnedStars = starsFor(this.game_.lives, this.level.startingLives);
    saveProgress(recordVictory(loadProgress(), this.map.id, this.difficulty, this.earnedStars));
  }

  private togglePause(): void {
    if (isOver(this.game_)) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.aim = null;
      this.towerMenu.close();
    }
  }

  /** Feeds the tutorial what just happened, and remembers once it is over. */
  private followTutorial(): void {
    if (this.tutorial.finished) return;
    const { phase, towers } = this.game_;
    if (towers.length > this.seenTowers) this.tutorial.handle('towerBuilt');
    if (phase === 'wave' && this.seenPhase !== 'wave') this.tutorial.handle('waveStarted');
    if (phase !== 'wave' && this.seenPhase === 'wave') this.tutorial.handle('waveCleared');
    this.seenPhase = phase;
    this.seenTowers = towers.length;
    if (this.tutorial.finished) rememberTutorialSeen();
  }

  /** A click on the map means, in order: confirm an aim, dismiss a menu, open one, select, move. */
  private handleMapClick(x: number, y: number): void {
    if (this.paused) {
      this.refuse('Juego en pausa: pulsa P para continuar');
      return;
    }
    if (this.aim !== null) {
      this.issue({ type: 'useAbility', ...this.aim, x, y });
      this.aim = null;
      return;
    }
    if (this.towerMenu.slot !== null) {
      // Clicking away only dismisses the menu, so it never moves a hero by accident.
      this.towerMenu.close();
      return;
    }
    const slot = this.level.buildSlots.findIndex(
      (point) => Math.hypot(point.x - x, point.y - y) <= SLOT_RADIUS + TAP_MARGIN,
    );
    if (slot !== -1) {
      this.towerMenu.open(this.game_, slot);
      this.sounds.play('menu');
      return;
    }
    const clicked = this.game_.heroes.find(
      (hero) => Math.hypot(hero.x - x, hero.y - y) <= HERO_RADIUS + TAP_MARGIN,
    );
    if (clicked) {
      this.selectHero(clicked.id);
    } else if (this.selectedHeroId !== null) {
      this.issue({ type: 'moveHero', heroId: this.selectedHeroId, x, y });
    }
  }

  private selectHero(heroId: number): void {
    if (!this.game_.heroes.some((hero) => hero.id === heroId)) return;
    this.selectedHeroId = heroId;
    this.aim = null;
    this.sounds.play('select');
    this.tutorial.handle('heroSelected');
  }

  /**
   * `index` is which of the selected hero's abilities. Instant abilities fire at
   * once; targeted ones wait for a click on the map.
   */
  private useSelectedAbility(index: number): void {
    const hero = this.game_.heroes.find((candidate) => candidate.id === this.selectedHeroId);
    const ability = hero && this.level.heroTypes[hero.type].abilities[index];
    if (!hero || !ability) return;
    if (!canUseAbility(this.game_, this.level, hero, index)) {
      this.refuse(this.whyAbilityIsUnavailable(hero, index));
      return;
    }
    if (ability.targeted) {
      this.towerMenu.close();
      this.aim = { heroId: hero.id, ability: index };
    } else {
      this.aim = null;
      this.issue({
        type: 'useAbility',
        heroId: hero.id,
        ability: index,
        x: hero.x,
        y: hero.y,
      });
    }
  }

  /** Tells the player what is missing, so a refused key press is never silent. */
  private whyAbilityIsUnavailable(hero: Hero, index: number): string {
    const name = HERO_STYLE[hero.type].abilities[index];
    const unlockLevel = this.level.heroTypes[hero.type].abilities[index].unlockLevel;
    if (hero.level < unlockLevel) return `${name} se desbloquea al nivel ${unlockLevel}`;
    if (!isAlive(hero)) return 'El héroe está caído';
    if (this.game_.phase !== 'wave') return 'Las habilidades solo se usan durante una oleada';
    const seconds = Math.ceil(hero.abilityCooldowns[index] / TICKS_PER_SECOND);
    return `${name} en recarga: ${seconds} s`;
  }

  /** Turns down something the player tried, saying why. */
  private refuse(reason: string): void {
    this.showNotice(reason);
    this.sounds.play('refused');
  }

  /** A short message near the top that fades by itself. */
  private showNotice(message: string): void {
    this.tweens.killTweensOf(this.notice);
    this.notice.setText(message).setAlpha(1);
    this.tweens.add({ targets: this.notice, alpha: 0, delay: 1800, duration: 500 });
  }

  /** Announces level ups, and the moment a hero's ability becomes available. */
  private announceLevelUps(): void {
    for (const hero of this.game_.heroes) {
      const known = this.knownLevels.get(hero.id) ?? hero.level;
      this.knownLevels.set(hero.id, hero.level);
      if (hero.level <= known) continue;
      const style = HERO_STYLE[hero.type];
      // The ability this level up unlocked, if any.
      const unlocked = this.level.heroTypes[hero.type].abilities.findIndex(
        (ability) => ability.unlockLevel > known && ability.unlockLevel <= hero.level,
      );
      this.showNotice(
        unlocked === -1
          ? `${style.name} sube a nivel ${hero.level}`
          : `${style.name} sube a nivel ${hero.level}: ${style.abilities[unlocked]} disponible ` +
              `(${hero.id}, luego ${ABILITY_KEYS[unlocked]})`,
      );
    }
  }

  /** Aiming ends by itself if the hero dies or the wave finishes meanwhile. */
  private stopAimingIfUnavailable(): void {
    if (!this.aim) return;
    const hero = this.game_.heroes.find((candidate) => candidate.id === this.aim?.heroId);
    if (!hero || !canUseAbility(this.game_, this.level, hero, this.aim.ability)) this.aim = null;
  }

  // --- sprites -----------------------------------------------------------

  private createHeroViews(): void {
    for (const hero of this.game_.heroes) {
      const body = this.add
        .image(hero.x, hero.y, HERO_STYLE[hero.type].sprite)
        .setScale(HERO_SCALE)
        .setDepth(3);
      // The number matches the key that selects the hero.
      const label = this.add
        .text(hero.x, hero.y, String(hero.id), {
          fontFamily: FONT,
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#10140d',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(3);
      this.heroViews.set(hero.id, { body, label, lastX: hero.x });
    }
  }

  private syncHeroes(): void {
    for (const hero of this.game_.heroes) {
      const view = this.heroViews.get(hero.id);
      if (!view) continue;
      // A fallen hero waits, faded, at its spawn point.
      const alpha = isAlive(hero) ? 1 : 0.3;
      // A small hop while walking, timed by game ticks so it stops with a pause.
      const hop = isMoving(hero) ? Math.abs(Math.sin(this.game_.tick / 5)) * 3 : 0;
      if (hero.x !== view.lastX) view.body.setFlipX(hero.x < view.lastX);
      view.lastX = hero.x;
      view.body.setPosition(hero.x, hero.y - hop).setAlpha(alpha);
      view.label.setPosition(hero.x + 13, hero.y + 12).setAlpha(alpha);
    }
  }

  private syncEnemies(alpha: number): void {
    const alive = new Set<number>();
    for (const enemy of this.game_.enemies) {
      alive.add(enemy.id);
      const style = ENEMY_STYLE[enemy.type];
      const flying = this.level.enemyTypes[enemy.type].flying;
      let view = this.enemyViews.get(enemy.id);
      if (!view) {
        const sprite = this.add.image(0, 0, style.sprite).setScale(style.scale).setDepth(2);
        // Flyers cast a shadow on the ground, so their height reads at a glance.
        const shadow = flying
          ? this.add.ellipse(0, 0, style.radius * 1.6, style.radius * 0.7, 0x000000, 0.28).setDepth(1)
          : null;
        view = { sprite, shadow, lastX: Number.NEGATIVE_INFINITY };
        this.enemyViews.set(enemy.id, view);
      }
      // Extrapolate the pending fraction of a step so motion stays smooth.
      const stopped = enemy.stunTicks > 0 || enemy.blockedBy !== null;
      const lookAhead = stopped ? 0 : (enemy.speed * alpha * STEP_MS) / 1000;
      const ground = pointAt(this.level.paths[enemy.path], enemy.distance + lookAhead);

      // Walkers bob as they step; flyers hover above their shadow.
      const beat = this.game_.tick / 6 + enemy.id;
      const lift = flying ? 16 + Math.sin(beat / 2) * 3 : stopped ? 0 : Math.abs(Math.sin(beat)) * 2;
      if (view.lastX !== Number.NEGATIVE_INFINITY && ground.x !== view.lastX) {
        view.sprite.setFlipX(ground.x < view.lastX);
      }
      view.lastX = ground.x;
      view.sprite.setPosition(ground.x, ground.y - lift);
      view.shadow?.setPosition(ground.x, ground.y + style.radius * 0.6);
      this.enemyPositions.set(enemy.id, { x: ground.x, y: ground.y - lift });
    }
    for (const [id, view] of this.enemyViews) {
      if (!alive.has(id)) {
        view.sprite.destroy();
        view.shadow?.destroy();
        this.enemyViews.delete(id);
        this.enemyPositions.delete(id);
      }
    }
  }

  private syncTowers(): void {
    const standing = new Set<number>();
    for (const tower of this.game_.towers) {
      standing.add(tower.id);
      let view = this.towerViews.get(tower.id);
      if (!view) {
        const point = this.level.buildSlots[tower.slot];
        const base = this.add
          .image(point.x, point.y, 'tower-base')
          .setScale(TOWER_BASE_SCALE)
          .setDepth(2);
        const icon = this.add
          .image(point.x, point.y - 2, TOWER_STYLE[tower.type].icon)
          .setScale(TOWER_ICON_SCALE)
          .setDepth(2);
        const label = this.add
          .text(point.x + 15, point.y + 14, '', {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#10140d',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(2);
        view = { base, icon, label };
        this.towerViews.set(tower.id, view);
      }
      // The number is the tower's level.
      view.label.setText(String(tower.level + 1));
    }
    for (const [id, view] of this.towerViews) {
      if (!standing.has(id)) {
        view.base.destroy();
        view.icon.destroy();
        view.label.destroy();
        this.towerViews.delete(id);
      }
    }
  }

  // --- interface ---------------------------------------------------------

  private createInterface(): void {
    const { width, height } = this.level;

    this.hud = this.add
      .text(16, 12, '', {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1f17',
        strokeThickness: 4,
      })
      .setDepth(10);

    // Shows the tutorial step during a first game, and the controls afterwards.
    this.hint = this.add
      .text(16, 44, '', {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1f17',
        strokeThickness: 3,
        wordWrap: { width: 500 },
      })
      .setDepth(10);

    // Top right, from the edge inwards. Everything a key does has a button here
    // or on the hero cards, so the game can be played by touch alone.
    let right = width - 16;
    const topButton = (
      label: string,
      buttonWidth: number,
      onClick: () => void,
      primary = false,
      on: 'pointerdown' | 'pointerup' = 'pointerdown',
    ) => {
      const button = this.button(right, 12, label, onClick, { width: buttonWidth, primary, on });
      button.setOrigin(1, 0);
      right -= buttonWidth + 6;
      return button;
    };
    const sound = topButton('', 76, () => this.toggleSound());
    const pause = topButton('Pausa', 70, () => this.togglePause());
    const speed = topButton('', 48, () => this.toggleSpeed());
    // Some browsers, the iPhone's among them, do not let a page go full screen.
    this.fullscreenButton = this.scale.fullscreen.available
      ? topButton('', 84, () => this.scale.toggleFullscreen(), false, 'pointerup')
      : null;
    const wave = topButton('Iniciar oleada', 132, () => this.issue({ type: 'startWave' }), true);

    this.add
      .text(width - 16, 50, `${this.map.name} · ${findDifficulty(this.difficulty).name}`, {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1f17',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(10);
    const skip = this.button(width - 16, 72, 'Saltar tutorial', () => this.skipTutorial(), {
      width: 124,
    }).setOrigin(1, 0);

    this.heroCards = new HeroCards(
      this,
      this.level,
      this.game_.heroes,
      (heroId) => this.selectHero(heroId),
      (heroId, ability) => this.tapAbility(heroId, ability),
    );
    this.towerMenu = new TowerMenu(this, this.level, (command) => this.issue(command));

    this.notice = this.add
      .text(width / 2, 100, '', {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#ffe066',
        backgroundColor: '#22281d',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(18)
      .setAlpha(0);

    // One big title shared by the pause and the end of the game, with the two
    // choices that make sense in each case right under it.
    this.bigTitle = this.add
      .text(width / 2, height / 2 - 44, '', {
        fontFamily: FONT,
        fontSize: '60px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1b1f17',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(20);
    const choice = (offset: number, label: string, onClick: () => void, primary = false) =>
      this.button(width / 2 + offset, height / 2 + 26, label, onClick, { width: 170, primary })
        .setOrigin(0.5)
        .setDepth(21);
    const resume = choice(-92, 'Continuar', () => this.togglePause(), true);
    const pauseMenu = choice(92, 'Elegir mapa', () => this.goToMenu());
    const retry = choice(-92, 'Jugar de nuevo', () => this.scene.restart(), true);
    const endMenu = choice(92, 'Elegir mapa', () => this.goToMenu());

    this.controls = { wave, speed, pause, sound, skip, resume, pauseMenu, retry, endMenu };
  }

  /** A text button. `primary` marks the one the player most likely wants. */
  private button(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    options: { width: number; primary?: boolean; on?: 'pointerdown' | 'pointerup' },
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: options.primary ? '#1b1f17' : '#f4f1e8',
        backgroundColor: options.primary ? '#ffe066' : '#22281d',
        padding: { x: 6, y: 8 },
        fixedWidth: options.width,
        align: 'center',
      })
      .setDepth(10)
      .setInteractive({ useHandCursor: true })
      // Browsers only allow going full screen from the release of a press.
      .on(options.on ?? 'pointerdown', onClick);
  }

  private syncInterface(): void {
    const game = this.game_;
    const over = isOver(game);
    const wave = `${game.waveIndex + 1}/${this.level.waves.length}`;
    this.hud.setText(`Vidas: ${game.lives}    Oro: ${game.gold}    Oleada: ${wave}`);

    const lesson = this.tutorial.text;
    const controls = this.usingTouch ? TOUCH_SUMMARY : KEY_SUMMARY;
    this.hint.setText(lesson ?? controls).setColor(lesson ? '#ffe066' : '#ffffff');

    this.controls.wave.setVisible(game.phase === 'preparing');
    this.controls.speed.setText(`x${this.speed}`);
    this.controls.sound.setText(this.sounds.muted ? 'Mudo' : 'Sonido');
    this.fullscreenButton?.setText(this.scale.isFullscreen ? 'Ventana' : 'Completa');
    this.controls.pause.setVisible(!over);
    this.controls.skip.setVisible(lesson !== null);

    const stars = this.earnedStars ?? 0;
    const earned = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const title = over ? (game.phase === 'won' ? `Victoria ${earned}` : 'Derrota') : 'Pausa';
    this.bigTitle.setText(title).setVisible(over || this.paused);
    this.controls.resume.setVisible(this.paused && !over);
    this.controls.pauseMenu.setVisible(this.paused && !over);
    this.controls.retry.setVisible(over);
    this.controls.endMenu.setVisible(over);

    this.heroCards.sync(game, this.selectedHeroId, this.aim);
    this.towerMenu.sync(game.gold);
  }
}
