import type Phaser from 'phaser';
import type { SoundEvent } from './soundEvents';
import { nextVolume, parseVolume } from './volume';

/** Sounds the interface makes by itself, on top of what happens in the game. */
export type InterfaceSound = 'select' | 'menu' | 'refused';

export type SoundName = SoundEvent | InterfaceSound;

interface SoundSpec {
  /** File in `public/assets/audio`, without the extension. */
  file: string;
  volume: number;
  /** Shortest time between two plays, so a frequent sound does not become noise. */
  minGapMs: number;
}

/** Which file plays for what. To change a sound, swap the file or edit one line here. */
const SOUNDS: Record<SoundName, SoundSpec> = {
  shot: { file: 'shot', volume: 0.12, minGapMs: 110 },
  cast: { file: 'cast', volume: 0.6, minGapMs: 80 },
  kill: { file: 'kill', volume: 0.3, minGapMs: 140 },
  lifeLost: { file: 'life-lost', volume: 0.6, minGapMs: 250 },
  build: { file: 'build', volume: 0.6, minGapMs: 0 },
  upgrade: { file: 'upgrade', volume: 0.6, minGapMs: 0 },
  sell: { file: 'sell', volume: 0.5, minGapMs: 0 },
  levelUp: { file: 'level-up', volume: 0.5, minGapMs: 200 },
  heroDown: { file: 'hero-down', volume: 0.7, minGapMs: 0 },
  waveStart: { file: 'wave-start', volume: 0.5, minGapMs: 0 },
  waveClear: { file: 'wave-clear', volume: 0.5, minGapMs: 0 },
  victory: { file: 'victory', volume: 0.7, minGapMs: 0 },
  defeat: { file: 'defeat', volume: 0.7, minGapMs: 0 },
  select: { file: 'select', volume: 0.3, minGapMs: 40 },
  menu: { file: 'menu', volume: 0.35, minGapMs: 40 },
  refused: { file: 'refused', volume: 0.4, minGapMs: 200 },
};

const VOLUME_KEY = 'tower-defense-heroes.volume';
/** The on/off setting from before the game had volume levels. Only read, never written. */
const LEGACY_MUTED_KEY = 'tower-defense-heroes.muted';

/**
 * Starts loading the sounds without making the game wait for them. Call from
 * the scene's `create`, never from `preload`: a scene does not start until
 * everything queued in `preload` has loaded, and audio can stall for good on
 * browsers that block or lack it.
 */
export function loadSoundsInBackground(scene: Phaser.Scene): void {
  let queued = false;
  for (const spec of Object.values(SOUNDS)) {
    // Already there after a restart or a second visit to the scene.
    if (scene.cache.audio.exists(spec.file)) continue;
    // Each sound comes in two formats and the browser takes the first it can
    // play: Ogg almost everywhere, AAC for Safari and the iPhone.
    const base = `assets/audio/${spec.file}`;
    scene.load.audio(spec.file, [`${base}.ogg`, `${base}.m4a`]);
    queued = true;
  }
  if (queued) scene.load.start();
}

/** Plays the game's sounds at the volume the player chose, and remembers it. */
export class SoundPlayer {
  /** From 0 (silent) to 1 (full). */
  volume: number;
  private lastPlayedAt = new Map<SoundName, number>();

  constructor(private scene: Phaser.Scene) {
    this.volume = readVolume();
  }

  get muted(): boolean {
    return this.volume === 0;
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const spec = SOUNDS[name];
    const now = this.scene.time.now;
    const last = this.lastPlayedAt.get(name);
    if (last !== undefined && now - last < spec.minGapMs) return;
    this.lastPlayedAt.set(name, now);
    // A browser that could load neither format simply stays quiet.
    if (this.scene.cache.audio.exists(spec.file)) {
      this.scene.sound.play(spec.file, { volume: spec.volume * this.volume });
    }
  }

  /** Moves to the next volume step: quieter each time, then back to full. */
  cycleVolume(): void {
    this.volume = nextVolume(this.volume);
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Storage may be unavailable; the choice then lasts only for this visit.
    }
  }
}

function readVolume(): number {
  try {
    return parseVolume(localStorage.getItem(VOLUME_KEY), localStorage.getItem(LEGACY_MUTED_KEY));
  } catch {
    return 1;
  }
}
