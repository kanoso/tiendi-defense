import type Phaser from 'phaser';
import type { ReceivedSignal } from '../net/CoopSession';
import type { SignalKind } from '../net/protocol';
import { FONT } from './styles';

/** How long a signal stays on the map. */
export const SIGNAL_LIFETIME_MS = 4000;

export const SIGNAL_STYLE: Record<SignalKind, { label: string; color: number; text: string }> = {
  help: { label: '¡Ayuda!', color: 0xff6b5b, text: '#ffb3a8' },
  going: { label: 'Voy yo', color: 0x7dff9b, text: '#c4ffd2' },
};

interface Mark extends ReceivedSignal {
  shownAt: number;
  ring: Phaser.GameObjects.Graphics;
  caption: Phaser.GameObjects.Text;
}

/**
 * The signals players put on the map: a pulsing ring with who sent it, which
 * fades away after a few seconds. A newer signal from the same player replaces
 * their older one, so the map never fills up with stale calls.
 */
export class SignalMarks {
  /** What is on the map now. Also read by the browser tests. */
  marks: Mark[] = [];

  constructor(private scene: Phaser.Scene) {}

  show(signal: ReceivedSignal, now: number): void {
    this.marks.filter((mark) => mark.playerId === signal.playerId).forEach((mark) => this.remove(mark));
    const style = SIGNAL_STYLE[signal.kind];
    const ring = this.scene.add.graphics().setDepth(9);
    const caption = this.scene.add
      .text(signal.x, signal.y - 34, `${style.label} · ${signal.name ?? '—'}`, {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: style.text,
        stroke: '#1b1f17',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(9);
    this.marks.push({ ...signal, shownAt: now, ring, caption });
  }

  /** Animates the marks and drops the ones that have been shown long enough. */
  update(now: number): void {
    for (const mark of [...this.marks]) {
      const age = now - mark.shownAt;
      if (age >= SIGNAL_LIFETIME_MS) {
        this.remove(mark);
        continue;
      }
      // Fully visible at first, fading out over the last second.
      const alpha = Math.min(1, (SIGNAL_LIFETIME_MS - age) / 1000);
      const pulse = (age % 900) / 900;
      const color = SIGNAL_STYLE[mark.kind].color;
      mark.ring.clear();
      mark.ring.lineStyle(3, color, alpha);
      mark.ring.strokeCircle(mark.x, mark.y, 16);
      mark.ring.lineStyle(2, color, alpha * (1 - pulse));
      mark.ring.strokeCircle(mark.x, mark.y, 16 + pulse * 22);
      mark.ring.fillStyle(color, alpha * 0.9);
      mark.ring.fillCircle(mark.x, mark.y, 4);
      mark.caption.setAlpha(alpha);
    }
  }

  private remove(mark: Mark): void {
    mark.ring.destroy();
    mark.caption.destroy();
    this.marks = this.marks.filter((candidate) => candidate !== mark);
  }
}
