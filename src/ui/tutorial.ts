/** Things the player does that the tutorial waits for. */
export type TutorialEvent =
  | 'heroSelected'
  | 'heroMoved'
  | 'towerBuilt'
  | 'waveStarted'
  | 'waveCleared';

export interface TutorialStep {
  text: string;
  /** What the player has to do to move on. */
  awaits: TutorialEvent;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { text: 'Elige un héroe: toca su tarjeta de abajo o pulsa una tecla del 1 al 4.', awaits: 'heroSelected' },
  {
    text: 'Toca un punto del mapa para moverlo. Los héroes no atacan mientras caminan.',
    awaits: 'heroMoved',
  },
  {
    text: 'Toca un círculo con + y construye una torre con tu oro.',
    awaits: 'towerBuilt',
  },
  { text: 'Inicia la oleada con el botón amarillo o con la barra espaciadora.', awaits: 'waveStarted' },
  {
    text: 'Que nadie llegue a la salida. Al subir de nivel, los héroes desbloquean las habilidades de su tarjeta.',
    awaits: 'waveCleared',
  },
];

/**
 * Walks a new player through the first game, one instruction at a time. It only
 * watches what the player does; it never blocks the game.
 */
export class Tutorial {
  private step: number;

  /** Pass true for players who have already seen it. */
  constructor(alreadySeen = false) {
    this.step = alreadySeen ? TUTORIAL_STEPS.length : 0;
  }

  get finished(): boolean {
    return this.step >= TUTORIAL_STEPS.length;
  }

  /** The instruction to show now, or null once the tutorial is over. */
  get text(): string | null {
    if (this.finished) return null;
    return `${this.step + 1}/${TUTORIAL_STEPS.length}  ${TUTORIAL_STEPS[this.step].text}`;
  }

  /**
   * Doing what the current step asks moves on. Doing what a later step asks
   * jumps past it, so a player who already knows the game is not held back.
   */
  handle(event: TutorialEvent): void {
    for (let index = this.step; index < TUTORIAL_STEPS.length; index++) {
      if (TUTORIAL_STEPS[index].awaits === event) {
        this.step = index + 1;
        return;
      }
    }
  }

  skip(): void {
    this.step = TUTORIAL_STEPS.length;
  }
}
