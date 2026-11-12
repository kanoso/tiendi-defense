# Créditos de los recursos

## Sprites

Los archivos de `sprites/` provienen de dos paquetes de **Kenney** (www.kenney.nl):

- **Tiny Dungeon** (1.0): héroes, enemigos e iconos de las torres de hielo y arcana.
- **Tiny Town**: terreno, árboles, base de las torres e iconos de arquería y cañón.

Licencia: [Creative Commons Zero (CC0)](http://creativecommons.org/publicdomain/zero/1.0/).
Se pueden usar en proyectos personales, educativos y comerciales. El crédito no es
obligatorio; se incluye como agradecimiento.

Los paquetes se descargaron de OpenGameArt:

- https://opengameart.org/content/tiny-dungeon
- https://opengameart.org/content/tiny-town

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
