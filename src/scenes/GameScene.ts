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
import { asEndless } from '../data/endless';
import { findMap, MAPS, type GameMap } from '../data/maps';
import type { CoopLink } from '../net/CoopLink';
import { coopLevel } from '../net/coopLevel';
import { clearTicket, saveTicket, tabStore } from '../net/rejoinTicket';
import type { SignalKind } from '../net/protocol';
import { SIGNAL_STYLE, SignalMarks } from '../entities/signalMarks';
import type { GameMode } from '../data/modes';
import { CAST_EFFECT_TICKS, type CastEffect } from '../entities/abilityEffects';
import { drawBoard } from '../entities/board';
import { blockedOffsets } from '../entities/crowd';
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
import { endlessBest, recordEndless, recordVictory, starsFor } from '../progress/progress';
import { loadProgress, saveProgress } from '../progress/storage';
import { applyHeroRanks } from '../progress/upgrades';
import { listen, soundEventsSince, type Heard } from '../ui/soundEvents';
import { loadSoundsInBackground, SoundPlayer } from '../ui/SoundPlayer';
import { setColorIfChanged } from '../ui/text';
import { Tutorial } from '../ui/tutorial';
import { volumeLabel } from '../ui/volume';

const HERO_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR'];

const KEY_SUMMARY =
  '1-4: héroe · clic: mover · Q y W: habilidades · clic en +: torre · F: velocidad · P: pausa · M: volumen';

const TOUCH_SUMMARY =
  'Toca un héroe o su tarjeta para elegirlo y el mapa para moverlo. Sus habilidades están en la tarjeta. Toca un + para construir.';

/** Extra distance around a hero or a build slot that still counts as touching it. */
const TAP_MARGIN = 10;

// A shared game normally plays one tick per frame; these let it catch up
// when it has fallen behind the turns the server already confirmed.
const MAX_STEPS_PER_FRAME = 4;
/** Ticks of delay tolerated before hurrying. */
const LAG_TICKS = 12;
const CATCH_UP_STEPS = 8;

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
  /** Shift on screen from its spot on the road, eased towards where it should be. */
  offset: Point;
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
  /** The connection to a shared game, or null when playing alone. */
  private coop: CoopLink | null = null;
  /** Time waiting to be turned into ticks of a shared game. */
  private coopClock = 0;
  private mode: GameMode = 'campaign';
  /** Whether the endless game on screen has been saved, so it is saved only once. */
  private endlessRecorded = false;
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
  /** Abilities whose visual effect is still playing. Also read by the browser tests. */
  private castEffects: CastEffect[] = [];
  /** Tick of the last cast already shown for each hero, to spot a new one. */
  private shownCasts = new Map<number, number>();
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
    'wave' | 'sound' | 'skip' | 'resume' | 'pauseMenu' | 'retry' | 'endMenu',
    Phaser.GameObjects.Text
  > &
    // Speed and pause only exist alone; the signals only in a shared game.
    Partial<Record<'speed' | 'pause' | 'help' | 'going', Phaser.GameObjects.Text>>;
  /** Signals other players (and this one) put on the map. */
  private signalMarks!: SignalMarks;
  /** A signal button was pressed: the next tap on the map places it. */
  private armedSignal: SignalKind | null = null;

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

  /** All of it comes from the menu. A restart passes nothing and keeps what it had. */
  init(data?: {
    mapId?: string;
    difficulty?: DifficultyId;
    mode?: GameMode;
    coop?: CoopLink;
  }): void {
    // A shared game: the server decided the map and the difficulty, and every
    // player has to build exactly the same level from what it sent.
    const start = data?.coop?.session.start;
    if (data?.coop && start) {
      this.coop = data.coop;
      this.map = findMap(start.mapId);
      this.difficulty = start.difficulty;
      this.mode = 'campaign';
      this.level = coopLevel(start.mapId, start.difficulty, start.playerCount);
      return;
    }
    if (data?.mapId) this.coop = null;
    if (data?.mapId) this.map = findMap(data.mapId);
    if (data?.difficulty) this.difficulty = data.difficulty;
    if (data?.mode) this.mode = data.mode;
    // The map as this player meets it: at the chosen difficulty, with their hero ranks.
    const atDifficulty = applyDifficulty(this.map.level, this.difficulty);
    const withRanks = applyHeroRanks(atDifficulty, loadProgress().heroRanks);
    this.level = this.mode === 'endless' ? asEndless(withRanks) : withRanks;
  }

  preload(): void {
    loadSprites(this);
  }

  create(): void {
    keepSpritesCrisp(this);
    // Sounds load in the background: the game must start even where audio is
    // slow, blocked or missing. Each sound simply stays quiet until it arrives.
    loadSoundsInBackground(this);
    // The scene instance is reused on restart, so every field starts over here.
    this.game_ = createGame(this.level, this.coop?.session.start?.seed ?? Date.now());
    this.coopClock = 0;
    this.stepper = createFixedStepper(STEP_MS);
    this.pendingCommands = [];
    this.enemyViews.clear();
    this.enemyPositions.clear();
    this.heroViews.clear();
    this.towerViews.clear();
    this.knownLevels.clear();
    this.castEffects = [];
    this.shownCasts.clear();
    this.selectedHeroId = this.coop
      ? (this.coop.session.ownHeroes()[0] ?? null)
      : (this.game_.heroes[0]?.id ?? null);
    this.aim = null;
    this.speed = 1;
    this.paused = false;
    // A shared game is no place for a tutorial that waits on one player.
    this.tutorial = new Tutorial(this.coop !== null || hasSeenTutorial());
    this.seenPhase = this.game_.phase;
    this.seenTowers = 0;
    this.signalMarks = new SignalMarks(this);
    // Kept in case the page is reloaded: the menu then brings the player back here.
    const ticket = this.coop?.session.rejoinTicket();
    if (ticket) saveTicket(tabStore(), ticket);
    this.armedSignal = null;
    this.sounds = new SoundPlayer(this);
    this.heard = listen(this.game_);
    this.earnedStars = null;
    this.endlessRecorded = false;

    drawBoard(this, this.level);
    this.createHeroViews();
    this.overlay = this.add.graphics().setDepth(4);
    this.createInterface();
    this.bindInput();
  }

  update(_time: number, deltaMs: number): void {
    const alpha = this.coop ? this.advanceShared(this.coop, deltaMs) : this.advanceAlone(deltaMs);

    if (this.coop) this.showSignals(this.coop);
    for (const event of soundEventsSince(this.heard, this.game_)) this.sounds.play(event);
    this.heard = listen(this.game_);
    this.recordVictoryOnce();
    this.recordEndlessOnce();
    this.followTutorial();
    this.stopAimingIfUnavailable();
    this.trackCastEffects();
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
      castEffects: this.castEffects,
      pointer: { x: this.input.activePointer.worldX, y: this.input.activePointer.worldY },
      enemyPositions: this.enemyPositions,
    });
    this.syncInterface();
  }

  /** A game on this machine only: the clock here decides how fast it goes. */
  private advanceAlone(deltaMs: number): number {
    // Pausing and speeding up only change how much time the simulation is fed.
    const elapsed = this.paused ? 0 : deltaMs * this.speed;
    return this.stepper.advance(elapsed, () => {
      step(this.game_, this.level, this.pendingCommands);
      this.pendingCommands = [];
    });
  }

  /**
   * A shared game: this machine plays at its own steady pace, but never past
   * the turns the server has confirmed, and only with the orders they carry.
   */
  private advanceShared(coop: CoopLink, deltaMs: number): number {
    const session = coop.session;
    const snapshot = session.takeSnapshot();
    if (snapshot) {
      // The server sent the whole game: this copy had drifted, or just came back.
      this.game_ = snapshot;
      this.heard = listen(snapshot);
      this.castEffects = [];
      this.shownCasts.clear();
      for (const hero of snapshot.heroes) {
        if (hero.lastCast) this.shownCasts.set(hero.id, hero.lastCast.tick);
      }
      this.coopClock = 0;
    }

    const play = (): void => {
      step(this.game_, this.level, session.commandsFor(this.game_.tick));
      session.played(this.game_.tick, this.game_);
    };
    this.coopClock += deltaMs;
    let steps = 0;
    while (this.coopClock >= STEP_MS && steps < MAX_STEPS_PER_FRAME && session.canStep(this.game_.tick)) {
      play();
      this.coopClock -= STEP_MS;
      steps++;
    }
    // Fallen well behind (a slow frame, a tab in the background): hurry up.
    for (let extra = 0; extra < CATCH_UP_STEPS && session.ticksBehind(this.game_.tick) > LAG_TICKS; extra++) {
      play();
    }
    // Waiting for the server: do not let unspent time pile up into a later rush.
    if (!session.canStep(this.game_.tick)) this.coopClock = Math.min(this.coopClock, STEP_MS);
    return session.canStep(this.game_.tick) ? Math.min(1, this.coopClock / STEP_MS) : 0;
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
    keyboard.on('keydown-SPACE', () => this.startWaveOrToggleReady());
    keyboard.on('keydown-F', () => this.toggleSpeed());
    keyboard.on('keydown-P', () => this.togglePause());
    keyboard.on('keydown-M', () => this.toggleSound());
    keyboard.on('keydown-T', () => this.skipTutorial());
    // Signals go where the pointer is: H asks for help, V says "I am going".
    keyboard.on('keydown-H', () => this.signalAtPointer('help'));
    keyboard.on('keydown-V', () => this.signalAtPointer('going'));
    HERO_KEYS.forEach((key, index) => {
      keyboard.on(`keydown-${key}`, () => this.selectHero(index + 1));
    });
    ABILITY_KEYS.forEach((key, index) => {
      keyboard.on(`keydown-${key}`, () => this.useSelectedAbility(index));
    });
    keyboard.on('keydown-ESC', () => {
      this.aim = null;
      this.armedSignal = null;
      this.towerMenu.close();
    });
    // Back to the map picker: after the game ends, or from the pause screen.
    keyboard.on('keydown-ENTER', () => {
      if (isOver(this.game_) || this.paused) this.goToMenu();
    });
    keyboard.on('keydown-R', () => {
      if (isOver(this.game_) && !this.coop) this.scene.restart();
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
    if (this.coop) {
      // In a shared game the order goes to the server and comes back in a turn,
      // for everyone at once.
      this.coop.session.order(command);
      return;
    }
    this.pendingCommands.push(command);
    if (command.type === 'moveHero') this.tutorial.handle('heroMoved');
  }

  /** Alone, this starts the wave. Together, it says (or takes back) "I am ready". */
  private startWaveOrToggleReady(): void {
    if (!this.coop) return this.issue({ type: 'startWave' });
    if (this.game_.phase !== 'preparing') return;
    this.coop.session.setReady(!this.coop.session.isReady());
  }

  private toggleSound(): void {
    this.sounds.cycleVolume();
    const percent = Math.round(this.sounds.volume * 100);
    this.showNotice(this.sounds.muted ? 'Sonido desactivado' : `Volumen: ${percent} %`);
    // A sample at the new level, so the player hears what they chose.
    this.sounds.play('select');
  }

  private skipTutorial(): void {
    this.tutorial.skip();
    rememberTutorialSeen();
  }

  private goToMenu(): void {
    // Leaving a shared game closes the connection; the others play on.
    this.coop?.leave();
    this.coop = null;
    clearTicket(tabStore());
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
    if (this.coop) return this.refuse('La velocidad no se puede cambiar en cooperativo');
    this.speed = this.speed === 1 ? 2 : 1;
  }

  /** Saves the result the moment the game is won, so closing the tab cannot lose it. */
  private recordVictoryOnce(): void {
    // Stars are earned alone: a shared game does not touch personal progress.
    if (this.coop || this.game_.phase !== 'won' || this.earnedStars !== null) return;
    this.earnedStars = starsFor(this.game_.lives, this.level.startingLives);
    saveProgress(recordVictory(loadProgress(), this.map.id, this.difficulty, this.earnedStars));
  }

  /** An endless game always ends in defeat; that is when its score counts. */
  private recordEndlessOnce(): void {
    if (this.mode !== 'endless' || this.game_.phase !== 'lost' || this.endlessRecorded) return;
    this.endlessRecorded = true;
    const progress = loadProgress();
    const previous = endlessBest(progress, this.map.id, this.difficulty);
    const result = { score: this.game_.score, wave: this.game_.waveIndex + 1 };
    saveProgress(recordEndless(progress, this.map.id, this.difficulty, result));
    if (previous === null || result.score > previous.score) this.showNotice('¡Nuevo récord!');
  }

  private togglePause(): void {
    if (this.coop) return this.refuse('No hay pausa en cooperativo');
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
    if (this.armedSignal !== null) {
      this.sendSignal(this.armedSignal, x, y);
      return;
    }
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
    if (this.coop && !this.coop.session.ownHeroes().includes(heroId)) {
      const owner = this.coop.session.ownerName(heroId);
      return this.refuse(owner ? `Ese héroe lo controla ${owner}` : 'Ese héroe no es tuyo');
    }
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
  // --- signals on the map ---------------------------------------------------

  /** A signal button: the next tap on the map places it. Pressed again, it is put away. */
  private armSignal(kind: SignalKind): void {
    this.armedSignal = this.armedSignal === kind ? null : kind;
    this.aim = null;
    this.towerMenu.close();
    if (this.armedSignal) this.showNotice('Toca el mapa donde va la señal');
  }

  private signalAtPointer(kind: SignalKind): void {
    if (!this.coop || isOver(this.game_)) return;
    const pointer = this.input.activePointer;
    this.sendSignal(kind, pointer.worldX, pointer.worldY);
  }

  private sendSignal(kind: SignalKind, x: number, y: number): void {
    this.armedSignal = null;
    // It comes back from the server like everyone else's, so it is shown then.
    this.coop?.session.signal(kind, Math.round(x), Math.round(y));
  }

  private showSignals(coop: CoopLink): void {
    const signals = coop.session.takeSignals();
    for (const signal of signals) this.signalMarks.show(signal, this.time.now);
    if (signals.length > 0) this.sounds.play('menu');
    this.signalMarks.update(this.time.now);
  }

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

  /**
   * Starts the visual effect of every ability cast since the last frame, and
   * drops the ones that finished. Several can play at once, even from one hero.
   */
  private trackCastEffects(): void {
    const tick = this.game_.tick;
    for (const hero of this.game_.heroes) {
      const cast = hero.lastCast;
      if (!cast || this.shownCasts.get(hero.id) === cast.tick) continue;
      this.shownCasts.set(hero.id, cast.tick);
      this.castEffects.push({
        kind: HERO_STYLE[hero.type].effects[cast.ability],
        x: cast.x,
        y: cast.y,
        originX: hero.x,
        originY: hero.y,
        radius: this.level.heroTypes[hero.type].abilities[cast.ability].radius,
        startTick: cast.tick,
      });
    }
    this.castEffects = this.castEffects.filter(
      (effect) => tick - effect.startTick < CAST_EFFECT_TICKS[effect.kind],
    );
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
    // Enemies held by the same hero stand on one spot; spread them on screen.
    const crowd = blockedOffsets(
      this.game_.enemies
        .filter((enemy) => enemy.blockedBy !== null)
        .map((enemy) => {
          const road = this.level.paths[enemy.path];
          const here = pointAt(road, enemy.distance);
          const ahead = pointAt(road, enemy.distance + 1);
          return { id: enemy.id, heroId: enemy.blockedBy!, direction: { x: ahead.x - here.x, y: ahead.y - here.y } };
        }),
    );
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
        view = { sprite, shadow, lastX: Number.NEGATIVE_INFINITY, offset: { x: 0, y: 0 } };
        this.enemyViews.set(enemy.id, view);
      }
      // Extrapolate the pending fraction of a step so motion stays smooth.
      const stopped = enemy.stunTicks > 0 || enemy.blockedBy !== null;
      const lookAhead = stopped ? 0 : (enemy.speed * alpha * STEP_MS) / 1000;
      const onRoad = pointAt(this.level.paths[enemy.path], enemy.distance + lookAhead);
      const target = crowd.get(enemy.id) ?? { x: 0, y: 0 };
      view.offset.x += (target.x - view.offset.x) * 0.2;
      view.offset.y += (target.y - view.offset.y) * 0.2;
      const ground = { x: onRoad.x + view.offset.x, y: onRoad.y + view.offset.y };

      // Walkers bob as they step; flyers hover above their shadow.
      const beat = this.game_.tick / 6 + enemy.id;
      const lift = flying ? 16 + Math.sin(beat / 2) * 3 : stopped ? 0 : Math.abs(Math.sin(beat)) * 2;
      // Facing follows the road, not the sideways shuffle into the crowd.
      if (view.lastX !== Number.NEGATIVE_INFINITY && onRoad.x !== view.lastX) {
        view.sprite.setFlipX(onRoad.x < view.lastX);
      }
      view.lastX = onRoad.x;
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
    // A shared game cannot be paused or sped up by one player; it has the
    // signals in their place.
    const pause = this.coop ? undefined : topButton('Pausa', 70, () => this.togglePause());
    const speed = this.coop ? undefined : topButton('', 48, () => this.toggleSpeed());
    const going = this.coop ? topButton(SIGNAL_STYLE.going.label, 76, () => this.armSignal('going')) : undefined;
    const help = this.coop ? topButton(SIGNAL_STYLE.help.label, 76, () => this.armSignal('help')) : undefined;
    // Some browsers, the iPhone's among them, do not let a page go full screen.
    this.fullscreenButton = this.scale.fullscreen.available
      ? topButton('', 84, () => this.scale.toggleFullscreen(), false, 'pointerup')
      : null;
    const wave = topButton('Iniciar oleada', 132, () => this.startWaveOrToggleReady(), true);

    this.add
      .text(width - 16, 50, this.describeGame(), {
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

    this.controls = {
      wave,
      speed,
      pause,
      help,
      going,
      sound,
      skip,
      resume,
      pauseMenu,
      retry,
      endMenu,
    };
  }

  /** Who is in the shared game and who is still needed for the next wave. */
  private describePlayers(coop: CoopLink): string {
    if (coop.status === 'reconnecting') return 'Se perdió la conexión. Reconectando…';
    if (coop.status === 'closed') return 'Sin conexión con el servidor. Vuelve al menú para salir.';
    const waiting = this.game_.phase === 'preparing';
    const players = (coop.session.room?.players ?? []).map((player) => {
      if (!player.connected) return `${player.name} (desconectado)`;
      return waiting ? `${player.name} ${player.ready ? '✓' : '…'}` : player.name;
    });
    const lead = waiting ? 'La oleada empieza cuando todos están listos' : 'Jugadores';
    return `${lead}:  ${players.join('   ')}`;
  }

  /** The map, difficulty and mode being played, for the corner of the screen. */
  private describeGame(): string {
    const parts = [this.map.name, findDifficulty(this.difficulty).name];
    if (this.coop) parts.push(`Sala ${this.coop.session.room?.code ?? ''}`);
    if (this.mode === 'endless') parts.push('Sin fin');
    return parts.join(' · ');
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
    const endless = this.mode === 'endless';
    const wave = endless ? `${game.waveIndex + 1}` : `${game.waveIndex + 1}/${this.level.waves.length}`;
    const points = endless ? `    Puntos: ${game.score}` : '';
    this.hud.setText(`Vidas: ${game.lives}    Oro: ${game.gold}    Oleada: ${wave}${points}`);

    const lesson = this.tutorial.text;
    const controls = this.usingTouch ? TOUCH_SUMMARY : KEY_SUMMARY;
    this.hint.setText(lesson ?? (this.coop ? this.describePlayers(this.coop) : controls));
    setColorIfChanged(this.hint, lesson ? '#ffe066' : '#ffffff');

    this.controls.wave.setVisible(game.phase === 'preparing');
    if (this.coop) {
      this.controls.wave.setText(this.coop.session.isReady() ? 'Esperando…' : 'Estoy listo');
    }
    this.controls.speed?.setText(`x${this.speed}`);
    for (const kind of ['help', 'going'] as const) {
      // The armed one is lit, so the player knows the next tap places it.
      this.controls[kind]?.setVisible(!over).setBackgroundColor(this.armedSignal === kind ? '#5a4a1d' : '#22281d');
    }
    this.controls.sound.setText(volumeLabel(this.sounds.volume));
    this.fullscreenButton?.setText(this.scale.isFullscreen ? 'Ventana' : 'Completa');
    this.controls.pause?.setVisible(!over);
    this.controls.skip.setVisible(lesson !== null);

    const stars = this.earnedStars ?? 0;
    const earned = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const defeat = endless ? `${game.score} puntos` : 'Derrota';
    const title = over ? (game.phase === 'won' ? `Victoria ${earned}` : defeat) : 'Pausa';
    this.bigTitle.setText(title).setVisible(over || this.paused);
    this.controls.resume.setVisible(this.paused && !over);
    this.controls.pauseMenu.setVisible(this.paused && !over);
    this.controls.retry.setVisible(over && !this.coop);
    this.controls.endMenu.setVisible(over);

    const session = this.coop?.session;
    this.heroCards.sync(
      game,
      this.selectedHeroId,
      this.aim,
      session && { own: session.ownHeroes(), nameOf: (heroId) => session.ownerName(heroId) },
    );
    this.towerMenu.sync(game.gold);
  }
}
