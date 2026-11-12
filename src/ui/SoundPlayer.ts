import type Phaser from 'phaser';
import type { SoundEvent } from './soundEvents';

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

const MUTED_KEY = 'tower-defense-heroes.muted';

/** Call from the scene's `preload`. */
export function loadSounds(scene: Phaser.Scene): void {
  for (const spec of Object.values(SOUNDS)) {
    scene.load.audio(spec.file, `assets/audio/${spec.file}.ogg`);
  }
}

/** Plays the game's sounds, and remembers whether the player muted them. */
export class SoundPlayer {
  muted: boolean;
  private lastPlayedAt = new Map<SoundName, number>();

  constructor(private scene: Phaser.Scene) {
    this.muted = readMuted();
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const spec = SOUNDS[name];
    const now = this.scene.time.now;
    const last = this.lastPlayedAt.get(name);
    if (last !== undefined && now - last < spec.minGapMs) return;
    this.lastPlayedAt.set(name, now);
    // A browser without this audio format simply stays quiet.
    if (this.scene.cache.audio.exists(spec.file)) {
      this.scene.sound.play(spec.file, { volume: spec.volume });
    }
  }

  toggleMuted(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTED_KEY, this.muted ? '1' : '0');
    } catch {
      // Storage may be unavailable; the choice then lasts only for this visit.
    }
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}
