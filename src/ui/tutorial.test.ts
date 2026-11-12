import { describe, expect, it } from 'vitest';
import { Tutorial, TUTORIAL_STEPS } from './tutorial';

describe('Tutorial', () => {
  it('starts on the first step', () => {
    const tutorial = new Tutorial();
    expect(tutorial.finished).toBe(false);
    expect(tutorial.text).toContain(TUTORIAL_STEPS[0].text);
  });

  it('numbers the step it is showing', () => {
    const tutorial = new Tutorial();
    expect(tutorial.text).toContain(`1/${TUTORIAL_STEPS.length}`);
  });

  it('moves on when the player does what the step asks', () => {
    const tutorial = new Tutorial();
    tutorial.handle(TUTORIAL_STEPS[0].awaits);
    expect(tutorial.text).toContain(TUTORIAL_STEPS[1].text);
  });

  it('skips ahead when the player already does something from a later step', () => {
    const tutorial = new Tutorial();
    tutorial.handle(TUTORIAL_STEPS[3].awaits);
    expect(tutorial.text).toContain(TUTORIAL_STEPS[4].text);
  });

  it('never goes back when the player repeats an earlier action', () => {
    const tutorial = new Tutorial();
    tutorial.handle(TUTORIAL_STEPS[2].awaits);
    tutorial.handle(TUTORIAL_STEPS[0].awaits);
    expect(tutorial.text).toContain(TUTORIAL_STEPS[3].text);
  });

  it('finishes after the last step', () => {
    const tutorial = new Tutorial();
    for (const step of TUTORIAL_STEPS) tutorial.handle(step.awaits);
    expect(tutorial.finished).toBe(true);
    expect(tutorial.text).toBeNull();
  });

  it('can be skipped at any point', () => {
    const tutorial = new Tutorial();
    tutorial.handle(TUTORIAL_STEPS[0].awaits);
    tutorial.skip();
    expect(tutorial.finished).toBe(true);
    expect(tutorial.text).toBeNull();
  });

  it('ignores what happens after it has finished', () => {
    const tutorial = new Tutorial();
    tutorial.skip();
    tutorial.handle(TUTORIAL_STEPS[0].awaits);
    expect(tutorial.finished).toBe(true);
  });

  it('can start already finished, for players who have seen it', () => {
    const tutorial = new Tutorial(true);
    expect(tutorial.finished).toBe(true);
    expect(tutorial.text).toBeNull();
  });
});
