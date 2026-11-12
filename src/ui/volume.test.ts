import { describe, expect, it } from 'vitest';
import { nextVolume, parseVolume, VOLUME_STEPS, volumeLabel } from './volume';

describe('nextVolume', () => {
  it('steps down from full volume to silence', () => {
    let volume = 1;
    const visited = [volume];
    for (let i = 0; i < VOLUME_STEPS.length - 1; i++) {
      volume = nextVolume(volume);
      visited.push(volume);
    }
    expect(visited).toEqual([...VOLUME_STEPS]);
    expect(visited[visited.length - 1]).toBe(0);
  });

  it('goes back to full volume after silence', () => {
    expect(nextVolume(0)).toBe(1);
  });

  it('treats a volume that is not one of the steps as the nearest one', () => {
    expect(nextVolume(0.95)).toBe(nextVolume(1));
  });
});

describe('parseVolume', () => {
  it('starts at full volume when nothing was saved', () => {
    expect(parseVolume(null, null)).toBe(1);
  });

  it('reads back a saved step', () => {
    expect(parseVolume('0.3', null)).toBe(0.3);
    expect(parseVolume('0', null)).toBe(0);
  });

  it('falls back to full volume when the saved value makes no sense', () => {
    expect(parseVolume('loud', null)).toBe(1);
    expect(parseVolume('7', null)).toBe(1);
    expect(parseVolume('-1', null)).toBe(1);
  });

  it('keeps players who had muted the game, before volume existed, muted', () => {
    expect(parseVolume(null, '1')).toBe(0);
    expect(parseVolume(null, '0')).toBe(1);
  });

  it('prefers the saved volume over the old mute setting', () => {
    expect(parseVolume('0.6', '1')).toBe(0.6);
  });
});

describe('volumeLabel', () => {
  it('names silence as muted', () => {
    expect(volumeLabel(0)).toBe('Mudo');
  });

  it('shows the other steps as a percentage', () => {
    expect(volumeLabel(1)).toBe('Vol 100');
    expect(volumeLabel(0.6)).toBe('Vol 60');
  });
});
