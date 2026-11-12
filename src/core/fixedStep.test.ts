import { describe, expect, it } from 'vitest';
import { createFixedStepper } from './fixedStep';

describe('createFixedStepper', () => {
  it('runs one step per full step of elapsed time', () => {
    const stepper = createFixedStepper(10);
    let steps = 0;
    stepper.advance(30, () => steps++);
    expect(steps).toBe(3);
  });

  it('carries leftover time into the next frame', () => {
    const stepper = createFixedStepper(10);
    let steps = 0;
    stepper.advance(25, () => steps++);
    expect(steps).toBe(2);
    stepper.advance(5, () => steps++);
    expect(steps).toBe(3);
  });

  it('reports the fraction of a step still pending', () => {
    const stepper = createFixedStepper(10);
    const alpha = stepper.advance(25, () => {});
    expect(alpha).toBeCloseTo(0.5);
  });

  it('caps the steps per frame and drops the backlog after a long stall', () => {
    const stepper = createFixedStepper(10, 5);
    let steps = 0;
    stepper.advance(10_000, () => steps++);
    expect(steps).toBe(5);
    stepper.advance(0, () => steps++);
    expect(steps).toBe(5);
  });
});
