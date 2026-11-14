# Escuadra (nombre provisional) — Definición y alcance

Estado: idea descartada el 2026-11-14; se guarda como referencia · Definido: 2026-11-14

## 1. Resumen

RPG táctico 2D de vista superior, jugable desde el navegador. El jugador guía a un grupo de **4 héroes** por un mundo hecho de casillas. Se camina de a una casilla por paso, en cuatro direcciones, y las paredes y el agua bloquean el paso.

Los enemigos se ven en el mapa. Cuando uno descubre al grupo, **la pelea empieza en el mismo lugar, sin cambiar de pantalla**: los héroes se despliegan en las casillas cercanas y se pelea por turnos sobre ese mismo terreno. Al ganar, se sigue explorando desde ahí.

Una zona se recorre en 20 a 30 minutos.

## 2. Objetivos y límites

**Objetivos**

- Que caminar se sienta fluido aunque sea por casillas: el personaje se desliza de una casilla a otra con su animación, y mantener la tecla apretada sigue caminando sin pausas.
- Que el terreno importe en la pelea: dónde se para cada héroe cambia el resultado.
- Que cada héroe tenga un rol que no se pueda reemplazar con otro.
- Que se pueda abrir desde un enlace, sin instalar nada.

**Fuera de alcance** (en todas las fases de este documento)

- Encuentros al azar: todo enemigo se ve en el mapa antes de pelear.
- Capturar o coleccionar criaturas.
- Jugador contra jugador.
- Historia con muchos diálogos: solo carteles y textos cortos.
- Mapas generados al azar (se puede evaluar después de la fase 4).

## 3. Exploración

- Movimiento en 4 direcciones, una casilla por paso. Mientras un paso no termina, no empieza otro.
- El grupo camina en fila: los otros tres héroes siguen las pisadas del primero.
- Casillas: suelo, pared, agua, pasto alto, puerta, cofre, cartel.
- Los enemigos patrullan un recorrido fijo o esperan quietos, y miran hacia una dirección. Cada uno ve unas casillas en línea recta, y las paredes le cortan la vista.
- Si el grupo entra en la vista de un enemigo, empieza la pelea. Si el jugador ataca primero a un enemigo de espaldas, su grupo arranca con ventaja (por ejemplo, el primer turno).

## 4. Combate

- La pelea usa el mismo mapa. Se juega dentro de un área alrededor del encuentro, y los enemigos cercanos que vean la pelea se suman.
- **Turnos por bando:** primero mueven todos los héroes, en el orden que elija el jugador; después todos los enemigos.
- Cada héroe, en su turno, se mueve hasta N casillas y hace una acción: atacar, usar una habilidad, usar un objeto o esperar.
- **Terreno:**
  - Pared: bloquea el paso y la vista.
  - Agua: no se puede cruzar, pero se puede atacar por encima.
  - Pasto alto: quien está dentro es más difícil de acertar.
  - Puerta: se abre y se cierra; cerrada cuenta como pared.
- **Línea de vista:** los ataques a distancia necesitan ver al objetivo.
- **Zona de control:** pasar al lado de un guerrero cuesta todo el movimiento que le queda a quien pasa.
- Se gana al derrotar a todos los enemigos y se pierde si caen los 4 héroes. Un héroe caído vuelve con poca vida al terminar la pelea.

## 4b. Controles

| Acción | Teclado y mouse | Pantalla táctil |
|---|---|---|
| Caminar | Flechas o WASD (mantener para seguir caminando) | Cruz de dirección en pantalla, abajo a la izquierda |
| Interactuar (cartel, cofre, puerta) | Espacio o Enter | Botón de acción, abajo a la derecha |
| Pelea: elegir héroe | Clic en el héroe o teclas 1 a 4 | Tocar el héroe |
| Pelea: mover | Clic en la casilla destino | Tocar la casilla destino |
| Pelea: atacar o usar habilidad | Clic en el objetivo, o teclas Q/W | Botón de la acción y después tocar el objetivo |
| Terminar el turno | Tecla E | Botón «Fin del turno» |

En la pelea, en pantalla táctil no se usa la cruz: se toca directo la casilla, que es más rápido que caminar paso a paso. Las casillas a las que puede llegar el héroe elegido se marcan en el mapa.

## 5. Héroes

El arte sale del paquete 0x72 DungeonTileset II (CC0), el mismo que usa Tower Defense Heroes.

| Héroe | Rol | Movimiento | Ataque | Habilidad |
|---|---|---|---|---|
| Guerrero | Frente y bloqueo | 4 casillas | Cuerpo a cuerpo | Desafío: obliga a los enemigos cercanos a atacarlo |
| Arquera | Daño a distancia | 5 casillas | A distancia, con línea de vista | Disparo cargado: más daño si no se movió en el turno |
| Mago | Daño en área | 3 casillas | A distancia | Explosión: daña una zona de 3×3, incluidos los aliados |
| Soporte | Curación | 4 casillas | Cuerpo a cuerpo débil | Curar a un aliado a 2 casillas |

## 6. Enemigos (primera tanda)

| Enemigo | Comportamiento |
|---|---|
| Soldado | Va hacia el héroe más cercano y ataca cuerpo a cuerpo |
| Tirador | Se queda a distancia y busca línea de vista |
| Bruto | Lento, mucha vida, empuja una casilla al golpear |
| Jefe de zona | Uno por zona, con reglas propias |

## 7. Reglas técnicas desde la fase 0

Son las mismas tres reglas de Tower Defense Heroes, para que el cooperativo de la fase 5 no obligue a reescribir la lógica:

- La lógica del juego vive aparte de lo que se dibuja y no depende de Phaser.
- Todo lo aleatorio sale de un generador con semilla.
- El juego avanza solo con órdenes ("mover héroe a la casilla x,y", "atacar a z"), que se pueden grabar y volver a reproducir.

Al ser por turnos, la tercera regla sale casi sola.

## 8. Fases

### Fase 0 — Base

- Proyecto (Vite + TypeScript + Phaser), pruebas de la lógica y pruebas en el navegador.
- Un mapa armado en un editor de mapas y cargado en el juego.
- Caminar por casillas con choques contra paredes y agua.

**Listo cuando:** se recorre un mapa de punta a punta caminando, y las pruebas corren en cada cambio.

### Fase 1 — MVP jugable

- El grupo en fila, 2 héroes (guerrero y arquera), 2 tipos de enemigo.
- Enemigos con vista; la pelea empieza en el mismo mapa.
- Combate por turnos con movimiento, ataque, línea de vista, victoria y derrota.
- Un mapa chico con 3 peleas y una salida.

**Listo cuando:** una persona que no conoce el juego llega a la salida sin ayuda.

### Fase 2 — Profundidad

- Los 4 héroes con sus habilidades, los 4 tipos de enemigo y el terreno completo (pasto alto, puertas, zona de control).
- Niveles de héroe y objetos (pociones).
- Animaciones de ataque y de daño, y sonido.

### Fase 3 — Progresión

- 3 zonas conectadas, cada una con su jefe.
- Cofres y equipo.
- Guardado en el navegador.

### Fase 4 — Pulido y publicación

- Controles táctiles y teléfono en horizontal.
- Opciones de volumen y de velocidad de animación.
- Publicación en un enlace público.

**Listo cuando:** el juego anda fluido en un móvil de gama media.

### Fase 5 — Cooperativo en línea

- 2 a 4 jugadores reparten los héroes.
- Al explorar, cada uno maneja su héroe (con el grupo en fila, o libres dentro de una distancia máxima; ver decisiones pendientes).
- En la pelea comparten el turno del bando: cada uno mueve sus héroes.
- Se puede reusar el servidor de Tower Defense Heroes (salas con código, reconexión, órdenes por turnos).

**Listo cuando:** 4 jugadores en redes distintas completan una zona sin que sus pantallas muestren estados diferentes.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| La IA de los enemigos se vuelve difícil de hacer y de probar | Reglas simples y predecibles primero, cada una con pruebas sobre la lógica |
| Caminar por casillas se siente rígido | Probar la sensación en la fase 0, antes de construir encima |
| Las peleas en el mapa abierto quedan desordenadas | Limitar la pelea a un área y marcarla en pantalla |
| Diseñar mapas lleva más tiempo que programar | Usar un editor de mapas desde la fase 0 |
| El alcance crece antes de cerrar el MVP | No empezar la fase 2 hasta cumplir el criterio de la fase 1 |

## 10. Decisiones pendientes

- Nombre y ambientación.
- Editor de mapas. Recomendado: Tiled (gratuito; Phaser carga sus mapas directamente).
- En exploración, ¿se ve solo al primer héroe o al grupo en fila?
- Turnos: por bando (propuesto) o por orden de velocidad de cada unidad.
- ¿Los héroes caídos vuelven al terminar la pelea (propuesto) o se pierden hasta descansar?
- Cooperativo: al explorar, ¿el grupo va siempre junto o cada uno se mueve libre?
- ¿Proyecto nuevo o carpeta dentro de Tower Defense Heroes para compartir el servidor?
