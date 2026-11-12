export interface FixedStepper {
  /**
   * Feeds elapsed real time and runs `onStep` once per whole simulation step.
   * Returns the fraction (0..1) of a step still pending, for render smoothing.
   */
  advance(deltaMs: number, onStep: () => void): number;
}

/**
 * Decouples the simulation rate from the browser frame rate.
 * `maxStepsPerFrame` avoids a burst of catch-up steps after the tab was in the
 * background; any backlog beyond it is dropped.
 */
export function createFixedStepper(stepMs: number, maxStepsPerFrame = 5): FixedStepper {
  let accumulated = 0;
  return {
    advance(deltaMs, onStep) {
      accumulated += deltaMs;
      let steps = 0;
      while (accumulated >= stepMs && steps < maxStepsPerFrame) {
        onStep();
        accumulated -= stepMs;
        steps++;
      }
      if (accumulated >= stepMs) accumulated = 0;
      return accumulated / stepMs;
    },
  };
}
