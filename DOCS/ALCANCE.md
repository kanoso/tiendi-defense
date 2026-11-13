# Tower Defense Heroes — Definición y alcance

Estado: en desarrollo · Definido: 2026-11-11 · Última actualización: 2026-11-11

## 0. Avance

| Fase | Estado | Notas |
|---|---|---|
| 0 — Base | Hecha | |
| 1 — MVP jugable | Hecha | Probada por el autor. Falta la prueba con una persona que no conozca el juego. |
| 2 — Profundidad | Hecha | Ver "Diferencias con lo planeado". |
| 3 — Progresión | Hecha | 3 mapas (uno con doble entrada), selector de mapas, estrellas, 3 dificultades, rangos permanentes de héroes y guardado en el navegador. |
| 4 — Pulido y publicación | Hecha | Hecho: publicado en https://kanoso.github.io/tiendi-defense/ con despliegue automático desde la rama `main`. Hecho también: controles táctiles (todo lo que hace una tecla tiene un botón en pantalla) y aviso para girar el teléfono. Hechos además: pantalla completa y modo sin fin con puntuación y récord por mapa y dificultad. También: volumen en cuatro niveles, audio en dos formatos (Ogg y AAC, este último para Safari y iPhone), sonidos cargados en segundo plano para que el juego arranque aunque el audio falle, y una revisión de rendimiento (con más de 100 enemigos, la lógica usa el 0,1 % de un cuadro y el dibujo 0,3 ms). Se puede agregar a la pantalla de inicio del teléfono (manifiesto de app web, íconos y etiquetas de Safari) y abre a pantalla completa en horizontal. Los enemigos que un héroe bloquea se dibujan lado a lado en lugar de apilados (solo en pantalla: la simulación no cambia). Sin verificar en un iPhone real. |
| 5 — Cooperativo en línea | Hecha | Hecho: servidor propio (Node, un contenedor Docker que también sirve el juego), sala de espera con código de 4 letras, elección de héroes (cada uno elige hasta su parte; los que nadie elige se reparten al empezar), oro y vidas compartidos, oleada que empieza cuando todos están listos, vida de los enemigos +10 % por jugador adicional reconexión automática a la misma partida si se corta la conexión o se recarga la página, y señales rápidas sobre el mapa («¡Ayuda!» y «Voy yo», con botones o con las teclas H y V). Publicado en internet mediante un túnel de Cloudflare hacia el contenedor; las pruebas de dos jugadores pasan a través de él. Las pruebas de navegador, cooperativo incluido, corren en cada publicación. El sitio público no ofrece el cooperativo porque no tiene servidor. |
| Extra — Avance en el servidor | Hecho | Entrar con Google (token verificado en el servidor; se guarda solo un hash del identificador) o código de jugador sin datos personales: guarda estrellas, rangos y récords en el servidor y une el avance de varios dispositivos (lo mejor de cada uno; los rangos solo si las estrellas alcanzan). |
| Extra — Continuar partida | Hecho | La partida se guarda al terminar cada oleada, en el dispositivo y en la cuenta; el menú ofrece «Continuar» con la más reciente. Validada antes de cargarse (en el juego y en el servidor). No aplica al cooperativo. |

**Diferencias con lo planeado en la fase 2**

- **Música:** no se incluyó. Los efectos de sonido sí. Falta elegir una pista, que hay que escuchar antes de sumarla.
- **Animaciones:** los sprites son de una sola imagen. El movimiento se resuelve con un salto al caminar y el giro hacia donde avanzan, no con cuadros de animación.
- **Agregado:** pausa (`P`), que figuraba en los controles pero no en ninguna fase.
- **Agregado:** el guerrero suelta a un enemigo menor para frenar a uno más peligroso. Sin esa regla los jefes pasaban sin ser atacados.

**Cómo quedó la progresión (fase 3)**

- **Estrellas:** 3 por conservar al menos el 90 % de las vidas, 2 por la mitad, 1 por cualquier otra victoria. Se cuentan aparte en cada dificultad, así que hay 27 en total (3 mapas × 3 dificultades × 3).
- **Dificultad:** Fácil (enemigos con 20 % menos de vida y 30 % más de oro inicial), Normal y Difícil (15 % más de vida y 10 % menos de oro).
- **Rangos de héroe:** cada héroe tiene 3 rangos permanentes que cuestan 1, 2 y 3 estrellas. Cada rango suma 10 % de daño y de vida y quita 7 % de recarga a sus habilidades. Llevar a los cuatro al máximo cuesta 24 estrellas.
- **Desbloqueo:** un mapa se abre al ganar el anterior en cualquier dificultad.
- **Guardado:** en el navegador. No hay cuentas: el progreso no se comparte entre dispositivos.

**Comandos del proyecto**

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre el juego en el navegador |
| `npm test` | Pruebas de la lógica |
| `npm run e2e` | Pruebas en un navegador real |
| `npm run balance` | Simula partidas con jugadores automáticos y muestra hasta dónde llegan |
| `npm run build` | Genera la versión para publicar |

## 1. Resumen

Juego de defensa de torres en 2D, jugable desde el navegador. El jugador defiende un camino contra oleadas de enemigos combinando dos recursos: **torres fijas** que compra con oro y **4 héroes** que mueve libremente por el mapa. Cada héroe tiene un rol, sube de nivel y cuenta con una habilidad especial.

Una partida dura entre 10 y 15 minutos.

## 2. Objetivos y límites

**Objetivos**

- Una partida completa de principio a fin: empezar, jugar, ganar o perder, reiniciar.
- Que mover a los héroes sea una decisión que importa, no un adorno sobre las torres.
- Que se pueda abrir desde un enlace, sin instalar nada.

**Fuera de alcance** (en todas las fases de este documento)

- Multijugador competitivo (jugador contra jugador). El cooperativo entra en la fase 5.
- Cuentas de usuario y base de datos. El progreso se guarda en el navegador.
- Servidor propio en las fases 0 a 4. La fase 5 es la única que puede requerirlo.
- Gráficos 3D.
- Compras o monetización.

## 3. Cómo se juega

1. Empieza la partida con oro inicial, 20 vidas y los 4 héroes en el mapa.
2. El jugador coloca torres en los espacios habilitados y ubica a sus héroes.
3. Al iniciar la oleada, los enemigos recorren el camino hacia la salida.
4. Cada enemigo eliminado da oro y experiencia. Cada enemigo que llega a la salida quita vidas.
5. Entre oleadas hay una pausa para comprar, mejorar y reubicar.
6. Se gana al superar la última oleada. Se pierde al llegar a 0 vidas.

### Controles

| Acción | Control |
|---|---|
| Seleccionar héroe | Clic sobre el héroe o teclas `1` a `4` |
| Mover héroe | Clic en el destino con el héroe seleccionado |
| Usar habilidad | Tecla `Q` o botón en pantalla; luego clic en el objetivo si lo requiere |
| Construir torre | Clic en un espacio libre y elegir la torre |
| Iniciar oleada | Botón en pantalla o `Espacio` |
| Pausa | `P` o `Esc` |

## 4. Héroes

Los héroes atacan solos al enemigo más cercano dentro de su alcance. El jugador decide dónde se paran y cuándo usan la habilidad.

| Héroe | Rol | Ataque básico | Habilidad | Punto débil |
|---|---|---|---|---|
| Guerrero | Bloquea el paso | Cuerpo a cuerpo; detiene hasta 2 enemigos | Golpe sísmico: aturde en área | No alcanza enemigos voladores |
| Mago | Daño en área | Proyectil que explota | Meteoro: daño alto en una zona | Poca vida, ataque lento |
| Arquera | Un solo objetivo a distancia | Flecha rápida de largo alcance | Ráfaga: dispara a todos en su alcance | Daño bajo contra armadura |
| Soporte | Cura y ralentiza | Rayo débil que ralentiza | Zona de hielo: ralentiza y cura aliados dentro | Casi no hace daño |

**Reglas comunes**

- Ganan experiencia por las bajas que ocurren cerca de ellos. Nivel máximo: 5 en el MVP.
- Cada nivel aumenta vida y daño. La habilidad se desbloquea en el nivel 2.
- Si un héroe muere, reaparece en la base tras 15 segundos.
- Los niveles se reinician en cada partida (hasta la fase 3).

## 5. Torres

| Torre | Función | Costo relativo |
|---|---|---|
| Arquería | Un objetivo, cadencia rápida, alcanza voladores | Bajo |
| Cañón | Daño en área, lento, no alcanza voladores | Medio |
| Torre de hielo (fase 2) | Ralentiza, sin daño | Medio |
| Torre arcana (fase 2) | Daño alto que ignora armadura | Alto |

Cada torre se puede mejorar 2 veces y vender por el 60 % de lo invertido.

## 6. Enemigos

| Enemigo | Característica | Se contrarresta con |
|---|---|---|
| Soldado | Equilibrado | Cualquiera |
| Corredor | Rápido, poca vida | Arquera, ralentización |
| Blindado | Lento, con armadura | Mago, torre arcana |
| Volador (fase 2) | Ignora el bloqueo del guerrero | Arquera, arquería |
| Jefe | Mucha vida, quita 5 vidas si pasa | Todo el equipo coordinado |

## 7. Stack técnico

| Elemento | Elección | Motivo |
|---|---|---|
| Motor | Phaser 3 | Maduro, 2D, pensado para navegador |
| Lenguaje | TypeScript | Detecta errores antes de ejecutar |
| Empaquetado | Vite | Arranque rápido y recarga en caliente |
| Pruebas | Vitest | Se integra con Vite sin configuración extra |
| Publicación | Sitio estático (GitHub Pages, Netlify o similar) | No requiere servidor |

**Principio de arquitectura:** la lógica del juego (daño, oleadas, experiencia, economía) vive en funciones puras, separadas de Phaser y cubiertas con pruebas. Phaser solo dibuja y recibe la entrada del jugador. Los valores de balance están en archivos de datos, no dentro del código.

**Reglas para dejar abierta la puerta al cooperativo** (se aplican desde la fase 0):

- La simulación avanza en pasos de tiempo fijos, independientes de los cuadros por segundo del navegador.
- Todo lo aleatorio sale de un generador con semilla, para que dos máquinas obtengan el mismo resultado.
- Las acciones del jugador (mover héroe, usar habilidad, construir) se expresan como comandos que la lógica procesa, no como cambios directos desde la interfaz.

```
src/
  core/      lógica pura y probada (combate, oleadas, economía, niveles)
  data/      definiciones de héroes, torres, enemigos y oleadas
  scenes/    escenas de Phaser (menú, partida, fin)
  entities/  representación visual de héroes, torres y enemigos
  ui/        barra de estado, botones, panel de compra
```

## 8. Fases

### Fase 0 — Base

Proyecto creado, un mapa con su camino y un enemigo que lo recorre de principio a fin.

**Listo cuando:** el juego abre en el navegador y el enemigo llega a la salida.

### Fase 1 — MVP jugable

- Oleadas (10), vidas, oro, victoria y derrota.
- Los 4 héroes con movimiento, ataque básico, habilidad, niveles y reaparición.
- 2 torres (arquería y cañón) con compra, mejora y venta.
- 3 enemigos (soldado, corredor, blindado) y un jefe en la oleada final.
- Interfaz mínima: vidas, oro, oleada actual, retratos de héroes con recarga de habilidad.
- Gráficos con figuras geométricas.

**Listo cuando:** una persona que no conoce el juego puede completar una partida sin explicación.

### Fase 2 — Profundidad

- Torres de hielo y arcana.
- Enemigo volador y armadura con tipos de daño.
- Segunda habilidad por héroe (nivel 4).
- 20 oleadas y ajuste de balance.
- Sprites y animaciones propias en lugar de figuras.
- Sonido y música.
- Velocidad x2 y tutorial breve en la primera partida.

**Listo cuando:** existen al menos dos estrategias distintas que permiten ganar.

### Fase 3 — Progresión

- 3 mapas con caminos distintos, uno con doble entrada.
- Estrellas por mapa según vidas restantes.
- Mejoras permanentes de héroes entre partidas.
- Guardado del progreso en el navegador.
- Selector de dificultad.

**Listo cuando:** el progreso se conserva al cerrar y volver a abrir el navegador.

### Fase 4 — Pulido y publicación

- Controles táctiles y diseño adaptado a móvil.
- Modo sin fin con puntuación.
- Efectos visuales, pantalla de carga y opciones de volumen.
- Revisión de rendimiento con muchas unidades en pantalla.
- Publicación en un enlace público.

**Listo cuando:** el juego se mantiene fluido en un móvil de gama media.

### Fase 5 — Cooperativo en línea

De 2 a 4 jugadores defienden juntos el mismo mapa.

- Sala de espera: un jugador crea la partida y comparte un código o enlace para que los demás se unan.
- Reparto de héroes: cada jugador elige los suyos. Con 2 jugadores, 2 héroes cada uno; con 4, uno cada uno.
- Oro y vidas compartidos. Cualquier jugador puede construir, mejorar y vender torres.
- La oleada empieza cuando todos marcan que están listos.
- Señales rápidas sobre el mapa ("ayuda aquí", "voy yo") en lugar de chat de texto.
- La dificultad escala según la cantidad de jugadores.
- Si un jugador se desconecta, sus héroes siguen atacando solos y puede volver a entrar a la misma partida.
- El modo de un jugador se mantiene intacto y sigue funcionando sin conexión.

**Enfoque técnico:** servidor autoritativo que ejecuta la misma lógica de `src/core/` y envía el estado a los navegadores, que solo dibujan y mandan comandos. Opción recomendada: Colyseus sobre Node. Alternativa sin servidor propio: conexión directa entre navegadores (WebRTC) con un jugador como anfitrión, más barata pero menos estable.

**Listo cuando:** 4 jugadores en redes distintas completan una partida entera sin que sus pantallas muestren estados diferentes.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El cooperativo obliga a reescribir la lógica | Aplicar desde la fase 0 las tres reglas de la sección 7 |
| El servidor de la fase 5 genera costo mensual | Evaluar la alternativa entre navegadores antes de contratar hospedaje |
| El alcance crece antes de terminar el MVP | No empezar la fase 2 hasta cerrar el criterio de la fase 1 |
| Los héroes vuelven irrelevantes a las torres, o al revés | Balance en archivos de datos y pruebas sobre la lógica |
| Mover 4 héroes resulta agobiante | Atajos `1` a `4`, pausa entre oleadas y ataque automático |
| El arte retrasa el proyecto | Figuras geométricas hasta la fase 2 |

## 10. Decisiones pendientes

- Ambientación y nombres de los 4 héroes.
- ~~Origen del arte~~ — resuelto: paquetes de Kenney con licencia CC0 (detalle en `public/assets/CREDITS.md`). Se puede reemplazar por arte propio sin tocar la lógica.
- ~~Música de fondo~~ — resuelto: «JRPG Epic Rock Battle Theme #1» de HydroGene (CC0), en bucle, al 12 % del volumen elegido.
- Si el juego debe funcionar en móvil desde el MVP o recién en la fase 4.
- ~~Fase 5: servidor autoritativo o conexión directa entre navegadores~~ — resuelto: servidor propio que reparte las órdenes por turnos de 50 ms; cada navegador simula la misma partida y el servidor guarda la copia de referencia, que envía completa si alguno se desvía o se reconecta.
- ~~Fase 5: cómo publicar el servidor en internet~~ — resuelto: túnel de Cloudflare hacia el contenedor, que sirve el juego y el cooperativo desde la misma dirección.
