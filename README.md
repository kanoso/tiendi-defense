# Tower Defense Heroes

Juego de defensa de torres en 2D para el navegador. Además de construir torres,
el jugador mueve a cuatro héroes por el mapa, cada uno con su rol y sus habilidades.

**Jugar:** https://kanoso.github.io/tiendi-defense/

## Cómo se juega

- Elige una dificultad y un mapa. Ganar un mapa abre el siguiente.
- Construye torres en los círculos con `+` y ubica a tus héroes.
- Inicia cada oleada. Si un enemigo llega a la salida, pierdes vidas.
- Las estrellas que ganas sirven para mejorar a los héroes de forma permanente.
- En el modo **Sin fin** las oleadas no terminan: cuenta el puntaje, y se guarda
  el récord de cada mapa.

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

También se juega solo con toques: cada acción tiene un botón en pantalla, y las
habilidades están en la tarjeta de cada héroe. En el teléfono, en horizontal.

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
| `npm run e2e` | Pruebas en un navegador real (Chromium) |
| `npm run e2e:webkit` | Las mismas pruebas en WebKit, el motor de Safari. En Windows falla la de carga de sonidos, porque esa versión de WebKit no trae audio |
| `npm run balance` | Simula partidas con jugadores automáticos: hasta dónde llegan y cuánto cuesta cada tick |
| `npm run build` | Genera la versión para publicar en `dist/` |
| `npm run server` | Construye el juego y arranca el servidor del cooperativo, que también sirve el juego, en el puerto 8787 |

Cada cambio en la rama `main` se publica solo en GitHub Pages, siempre que las
pruebas de la lógica pasen.

## Cooperativo

De 2 a 4 jugadores defienden el mismo mapa, cada uno con una parte de los
héroes. Necesita un servidor: el botón «Cooperativo» del menú solo aparece
cuando hay uno que responde. El sitio público usa el servidor indicado en
`VITE_COOP_SERVER` al construirlo (ver `.github/workflows/deploy.yml`), que
debe incluir el dominio del sitio en `ALLOWED_ORIGINS`.

Para jugarlo en una red local:

```
npm run server
```

y cada jugador abre `http://<dirección de esa máquina>:8787`. Uno crea la sala
y comparte el código de 4 letras. En la sala cada uno elige sus héroes; los que
nadie elija se reparten al empezar, y la partida empieza cuando todos están
listos. Durante el juego, «¡Ayuda!» y «Voy yo» (o las teclas H y V, donde esté
el puntero) marcan un punto del mapa para los demás. Si se corta la conexión o
se recarga la página, el juego vuelve solo a la misma partida.
«Salir» (dos toques seguidos, o Enter dos veces) deja la partida y vuelve al
menú; los demás siguen jugando.

Con Docker, después de `npm run build` y `npm run build:server`:

```
docker compose -f deploy/docker-compose.yml up -d --build
```

`HOST_PORT` cambia el puerto. `npm run e2e` prueba el cooperativo con dos
navegadores contra un servidor local; `COOP_SERVER=http://host:puerto` apunta
esas pruebas a un servidor que ya esté en marcha.

Todos los jugadores simulan la misma partida: el servidor solo reparte las
órdenes por turnos y guarda una copia de referencia, que envía completa si
alguien se desvía o vuelve tras perder la conexión.

## Guardar el avance

Con el servidor en marcha, «Guardar avance» en el menú da un código de jugador
(como `KXT4-9QPM`) que guarda estrellas, rangos y récords sin pedir nombre ni
email. Escribiendo ese código en otro dispositivo, el avance de los dos se une:
de cada cosa queda lo mejor. Cada partida ganada se guarda sola.

El servidor guarda las cuentas en `DATA_DIR` (con Docker, en el volumen
`progress`), un archivo por cuenta nombrado con un hash del código: el código
mismo nunca se escribe en disco. Los códigos que no existen cuentan como
intentos fallidos, y tras varios seguidos el servidor hace esperar.

## Cómo está armado

Phaser 3, TypeScript y Vite. La lógica del juego vive en `src/core/` como
funciones puras y deterministas, separadas del motor gráfico: Phaser solo dibuja
el estado y convierte lo que hace el jugador en comandos. Los valores de balance
están en `src/data/`.

El alcance, las fases y el avance están en [`DOCS/ALCANCE.md`](DOCS/ALCANCE.md).

## Créditos

Los sprites y los sonidos son de [Kenney](https://www.kenney.nl), con licencia
CC0. El detalle está en [`public/assets/CREDITS.md`](public/assets/CREDITS.md).
