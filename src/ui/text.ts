import type Phaser from 'phaser';

/**
 * Changes a text's color only when it is different. Phaser repaints the whole
 * text and uploads it to the graphics card on every `setColor`, even with the
 * same color, which is wasteful for something called on every frame.
 * (`setText` already skips the work when the text is unchanged.)
 */
export function setColorIfChanged(text: Phaser.GameObjects.Text, color: string): void {
  if (text.style.color !== color) text.setColor(color);
}
