# Tower Defense Heroes

Juego de defensa de torres en 2D para el navegador. Además de construir torres,
el jugador mueve a cuatro héroes por el mapa, cada uno con su rol y sus habilidades.

**Jugar:** https://kanoso.github.io/tiendi-defense/

## Cómo se juega

- Elige una dificultad y un mapa. Ganar un mapa abre el siguiente.
- Construye torres en los círculos con `+` y ubica a tus héroes.
- Inicia cada oleada. Si un enemigo llega a la salida, pierdes vidas.
- Las estrellas que ganas sirven para mejorar a los héroes de forma permanente.

| Acción | Control |
|---|---|
| Elegir héroe | Teclas `1` a `4` o clic sobre él |
| Mover héroe | Clic en el mapa |
| Habilidades | `Q` y `W` |
| Construir, mejorar o vender una torre | Clic en un círculo con `+` o en la torre |
| Iniciar oleada | `Espacio` |
| Velocidad x2 | `F` |
| Pausa | `P` |
| Silenciar | `M` |

## Desarrollo

Requiere Node 22 o superior.

```
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre el juego en el navegador con recarga automática |
| `npm test` | Pruebas de la lógica |
| `npm run e2e` | Pruebas en un navegador real |
| `npm run balance` | Simula partidas con jugadores automáticos y muestra hasta dónde llegan |
| `npm run build` | Genera la versión para publicar en `dist/` |

Cada cambio en la rama `main` se publica solo en GitHub Pages, siempre que las
pruebas de la lógica pasen.

## Cómo está armado

Phaser 3, TypeScript y Vite. La lógica del juego vive en `src/core/` como
funciones puras y deterministas, separadas del motor gráfico: Phaser solo dibuja
el estado y convierte lo que hace el jugador en comandos. Los valores de balance
están en `src/data/`.

El alcance, las fases y el avance están en [`DOCS/ALCANCE.md`](DOCS/ALCANCE.md).

## Créditos

Los sprites y los sonidos son de [Kenney](https://www.kenney.nl), con licencia
CC0. El detalle está en [`public/assets/CREDITS.md`](public/assets/CREDITS.md).
