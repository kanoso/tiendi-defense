# Créditos de los recursos

## Sprites

Los archivos de `sprites/` provienen de tres paquetes, todos con licencia
[Creative Commons Zero (CC0)](http://creativecommons.org/publicdomain/zero/1.0/).
Se pueden usar en proyectos personales, educativos y comerciales. El crédito no es
obligatorio; se incluye como agradecimiento.

Dos son de **Kenney** (www.kenney.nl), descargados de OpenGameArt:

- **Tiny Dungeon** (1.0): iconos de las torres de hielo y arcana.
  https://opengameart.org/content/tiny-dungeon
- **Tiny Town**: terreno, árboles, base de las torres e iconos de arquería y cañón.
  https://opengameart.org/content/tiny-town

Los héroes y los enemigos son del paquete **16x16 DungeonTileset II** (versión 1.7),
de **0x72**: https://0x72.itch.io/dungeontileset-ii

Cada archivo es una tira horizontal con los cuadros de animación de un personaje,
separados por 1 píxel transparente: primero los 4 cuadros de reposo (`idle_anim_f0`
a `f3`), luego los 4 de carrera (`run_anim_f0` a `f3`) y, si el personaje lo tiene,
el cuadro de golpe (`hit_anim_f0`).

| Archivo del juego | Personaje original | Tamaño de cada cuadro | Cuadro de golpe |
|---|---|---|---|
| `hero-warrior.png` | `knight_m` | 16 × 28 | Sí |
| `hero-mage.png` | `wizzard_m` | 16 × 28 | Sí |
| `hero-archer.png` | `elf_f` | 16 × 28 | Sí |
| `hero-support.png` | `doc` | 16 × 23 | No |
| `enemy-soldier.png` | `orc_warrior` | 16 × 23 | No |
| `enemy-runner.png` | `goblin` | 16 × 16 | No |
| `enemy-armored.png` | `masked_orc` | 16 × 23 | No |
| `enemy-flyer.png` | `imp` | 16 × 16 | No |
| `enemy-boss.png` | `big_demon` | 32 × 36 | No |

Si se cambia el tamaño de los cuadros o su cantidad, hay que actualizar
`UNIT_SHEETS` en `src/entities/units.ts`; una prueba comprueba que coincidan.

Solo se copiaron los sprites que el juego usa, renombrados según su función.

## Sonidos

Los archivos de `audio/` provienen de otros dos paquetes de **Kenney**, también con
licencia CC0:

- **RPG Audio** (50 RPG sound effects): https://opengameart.org/content/50-rpg-sound-effects
- **Interface Sounds** (1.0): https://opengameart.org/content/interface-sounds

| Archivo del juego | Archivo original | Paquete |
|---|---|---|
| `shot.ogg` | `drawKnife1.ogg` | RPG Audio |
| `cast.ogg` | `bookFlip2.ogg` | RPG Audio |
| `kill.ogg` | `handleCoins.ogg` | RPG Audio |
| `sell.ogg` | `handleCoins2.ogg` | RPG Audio |
| `build.ogg` | `metalLatch.ogg` | RPG Audio |
| `upgrade.ogg` | `metalClick.ogg` | RPG Audio |
| `hero-down.ogg` | `dropLeather.ogg` | RPG Audio |
| `life-lost.ogg` | `error_006.ogg` | Interface Sounds |
| `level-up.ogg` | `confirmation_002.ogg` | Interface Sounds |
| `wave-start.ogg` | `maximize_003.ogg` | Interface Sounds |
| `wave-clear.ogg` | `confirmation_001.ogg` | Interface Sounds |
| `victory.ogg` | `confirmation_004.ogg` | Interface Sounds |
| `defeat.ogg` | `minimize_006.ogg` | Interface Sounds |
| `select.ogg` | `click_002.ogg` | Interface Sounds |
| `menu.ogg` | `open_001.ogg` | Interface Sounds |
| `refused.ogg` | `error_004.ogg` | Interface Sounds |

Cada sonido está además en `.m4a` (AAC), convertido desde el `.ogg` con ffmpeg,
para los navegadores que no reproducen Ogg. Al cambiar un sonido hay que
reemplazar los dos archivos.

Para cambiar un sonido basta con reemplazar el archivo, o editar el volumen y la
frecuencia en `src/ui/SoundPlayer.ts`.

## Música

`music-battle.ogg` y `music-battle.m4a` son **JRPG Epic Rock Battle Theme #1**, de
**HydroGene**, con licencia [CC0](http://creativecommons.org/publicdomain/zero/1.0/):

- https://opengameart.org/content/jrpg-epic-rock-battle-theme-1

Se usa la parte de bucle (`jrpg_battle_loop.mp3`), que se repite sin cortes;
convertida con ffmpeg a Ogg Vorbis (calidad 3) y a AAC (96 kb/s). El autor no
exige crédito; se incluye como agradecimiento.

El volumen de la música respecto de los efectos está en `MUSIC` dentro de
`src/ui/SoundPlayer.ts`.
