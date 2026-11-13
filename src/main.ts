import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './data/rules';
import { GameScene } from './scenes/GameScene';
import { onlineFeatures } from './net/online';
import { MenuScene } from './scenes/MenuScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#4f7a3a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // The first scene listed is the one shown on load.
  scene: [MenuScene, GameScene],
});

// Co-op and saved progress, when a server offers them. Asked right away, so a
// game opened straight from a link also keeps its progress there.
void onlineFeatures();

// Handle for inspecting the running game from the browser console.
(globalThis as { __game?: Phaser.Game }).__game = game;
