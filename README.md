# CTA Checker

Compara la lista de anotados del bot de Discord con el arma que cada jugador
usó de verdad en la batalla, según los killboards públicos de Albion Online.
No usa albionbb: lee la misma API pública del juego (`gameinfo.albiononline.com`).

## Cómo usarlo

1. Abre `CTAChecker.exe` (Windows). Se abre el navegador en `http://127.0.0.1:8765`.
   Deja la ventana negra abierta mientras lo usas; ciérrala para salir.
   - Mac: `CTAChecker-mac` (Apple Silicon) o `CTAChecker-mac-intel`.
   - Linux: `CTAChecker-linux`.
   No hace falta instalar nada.
2. **Datos de la CTA** (paso 1): pega lo que tengas, todo es opcional salvo
   una de las tres listas:
   - el mensaje de anotados del bot (todas las partys que haya);
   - la lista de miembros exportada del juego ("Character Name", "Last Seen",
     "Roles"): dice quién está conectado;
   - los nombres de quienes están en el canal de voz de Discord, uno por línea.
3. **Batalla**: los killboards del gremio aparecen solos (los 50 más recientes).
   Filtra por mínimo de jugadores (30 por defecto) o del gremio, y usa
   «Cargar más antiguas» para seguir hacia atrás de a 50: los killboards a veces
   tardan días en aparecer. Marca todos los killboards del timer: un mismo
   personaje puede salir en varios y cuenta una sola vez. Sin killboard marcado,
   «Revisar» hace un pre-registro (ver abajo).
4. **Revisar**: una sola lista con todos los jugadores (ver abajo).
5. **Mensaje para Discord**: copia el texto (se parte en mensajes de menos de
   2.000 caracteres si hace falta).
6. **Guardar en el historial**: pon la fecha y la hora UTC de la CTA (la app
   sugiere la más cercana entre 22:00, 00:00, 02:00 y 04:00, pero tú decides) y
   pulsa «Registrar», o «No registrar» si no quieres guardarla. Si ya había una
   CTA con esa fecha y hora, pregunta antes de reemplazarla.

Todas las horas se muestran en UTC, como las CTAs y la lista de miembros del juego.

### La lista de jugadores

Aparece todo jugador con alguna señal: anotado en el bot, visto en el
killboard, en el canal de Discord, conectado al juego o marcado a mano. Columnas:

| Columna | Qué muestra |
|---|---|
| Jugador | Nombre en el juego (y el de Discord si es distinto). «¿Nombre?» + Confirmar si el nombre se adivinó. |
| Anotado | Arma y puesto en el bot. |
| 🎮 Juego | 🟢 online, 📴 desconectado con la hora en que se le vio, ❔ no está en la lista de miembros. |
| 🎧 Canal | Si está en el canal de Discord (y con qué nombre, si es distinto). |
| ⚔️ Killboard | Armas con las que salió (solo con killboard). |
| Estado | Ver la tabla «Estados». |
| Observación | Lo que llama la atención, con ícono, por ejemplo: ⚠️ «Desconectado del juego pero en el canal de Discord: ¿se cayó o llega tarde?», 🔇 «Anotado pero no está en el canal», ⏱️ «Solo salió en 1 de 3 killboards: ¿llegó tarde?», ❔ «No está en la lista de miembros: ¿otro nombre?». |
| Marcar | 💣 Bomb, 🎯 Otra party, ⏰ Llegó tarde. |

Se puede ordenar por estado (lo más grave primero) o por puesto, y ocultar
estados. Debajo de la lista se pueden marcar varios nombres a la vez, escritos
separados por coma mirando las fotos de las partys.

### Marcas: bombs, otras partys y llegadas tarde

- **💣 Bomb / 🎯 Otra party**: quien juega en una bomb u otra party no se anota
  en el bot. Cuenta como presente.
- **⏰ Llegó tarde**: asistió aunque llegó tarde. Un anotado que no sale en el
  killboard (o un pre-registro, alguien en el canal o un skip) pasa a contar
  como presente, con la advertencia; quien sí salió en el killboard conserva su
  estado de arma y queda anotado como tarde.

Las marcas son **de cada CTA**: cada revisión empieza sin marcas, porque quien
fue de bomb en una CTA puede ir a la zerg principal en la siguiente. Si la
fecha y la hora UTC del paso 6 coinciden con una CTA ya registrada (por ejemplo
un pre-registro que ahora revisas con el killboard), sus marcas se cargan
solas. «Limpiar marcas» las quita todas.

### Pre-registro sin killboard

Los killboards pueden tardar días en aparecer. Si pulsas «Revisar» sin marcar
ningún killboard, la app hace un **pre-registro** con las listas que pegaste:
quién se anotó, quién está conectado al juego y quién está en el canal, con las
mismas observaciones. Los nombres del canal se cruzan sin importar mayúsculas,
con los alias de la pestaña Jugadores y tolerando una letra distinta (I y l).

Al registrarlo, la app avisa «Estás registrando sin el killboard, ¿estás
seguro?» (Sí / No). Se guarda marcado con ⏳: los anotados y los que solo están
en el canal no cuentan para el % de asistencia (todavía no se sabe si fueron),
pero sí quedan los skips, las bombs y las llegadas tarde. Cuando aparezca el
killboard, revisa de nuevo con las mismas listas y regístralo con la misma
fecha y hora para reemplazarlo.

## Asistencia

La pestaña **Asistencia** ocupa toda la pantalla: una fila por jugador y una
columna por CTA guardada (fecha, hora UTC y cuántos fueron). Cada celda muestra
el arma que llevó, con el borde según cómo le fue:

| Celda | Qué significa |
|---|---|
| Borde verde | Fue con el arma anotada. |
| Borde rojo | Fue con otra arma. |
| Borde amarillo | Fue, pero no se le vio el equipo o hay que revisarlo. |
| Borde azul | Fue sin anotarse. |
| Borde morado | Fue en una bomb u otra party. |
| ⏳ | Pre-registro: se anotó, pero aún no hay killboard (no cuenta para el %). |
| 🎧 | Pre-registro: estaba en el canal sin anotarse (no cuenta para el %). |
| Borde punteado / ⏰ | Llegó tarde. |
| ✗ | Se anotó y no fue. |
| 🚫 | Estaba conectado y no fue (si se pegó la lista de miembros al revisar). |
| · | No se anotó ni fue. |
| vacía | Todavía no era del gremio (o ya se había ido). |

Al lado de cada jugador: % de asistencia, veces que fue, veces que se anotó,
veces que se anotó y no fue, veces con arma equivocada, veces que fue sin
anotarse, veces en bomb u otra party, llegadas tarde, skips y su arma más usada. Al pasar el mouse por una celda se ven las observaciones de esa CTA. Arriba, la asistencia global y el promedio
por CTA. Se puede filtrar por fechas y por hora, buscar, ordenar y exportar a
CSV (se abre con Excel).

**Miembros del gremio**: pega cada día la lista exportada del juego en la
sección de abajo y pulsa «Actualizar miembros». Muestra quién entró y quién ya
no está. Quien salió o fue expulsado deja de contar desde ese día y se oculta
con «Solo miembros actuales», pero su historial se conserva. La asistencia de
cada jugador se cuenta desde el primer día en que aparece (en una lista o en
una CTA) hasta la última lista que lo incluía.

El historial se guarda en `cta-checker-history.json`, junto al programa. Antes
de cada guardado se copia la versión anterior en `backups/` (se guardan las 100
últimas). Copia ese archivo junto con el `.exe` para llevarte el historial a
otra PC.

## Estados

| Estado | Qué significa |
|---|---|
| ✅ Correcto | Usó el arma anotada (si además usó otra, se indica). |
| ❌ Otra arma | Se le vio el equipo y ninguna arma coincide. |
| ⚠️ Revisar | Battlemount sin montura de batalla vista. |
| ⚠️ Sin equipo visible | Estuvo en la batalla, pero no participó en ninguna kill, así que la API no muestra su equipo. |
| ❓ Arma sin mapear | El nombre del bot no está en la pestaña Armas. |
| 👻 No participó | Se anotó y no aparece en los killboards marcados (o se anotó con otro nombre). |
| ⏳ Sin killboard | Pre-registro: se anotó, todavía no se sabe si fue. |
| 👀 Sin anotarse | Salió en el killboard sin estar en la lista del bot. |
| 🎧 En el canal | Está en el canal de Discord, sin anotarse y sin salir en el killboard. |
| 🚫 Skip | Conectado al juego, sin anotarse (ni en el canal) o sin salir en el killboard. |
| 💣 Bomb / 🎯 Otra party | Marcado a mano: jugó en otro grupo. |
| ⏰ Llegó tarde | Marcado a mano: asistió tarde. |

### Conectados que no fueron

"Last Seen" es la última desconexión, en hora UTC. Según eso, cada miembro que
no aparece en los killboards cae en uno de tres grupos:

- **Se desconectó durante la CTA**: su última desconexión cae entre el inicio y
  el fin de los killboards marcados. Es la prueba más fuerte de que estaba
  conectado y no fue.
- **Online al exportar la lista**: solo es fiable si la exportaste durante o
  justo después de la CTA; si no, pudo entrar cuando ya había terminado.
- **Se desconectó después de la CTA**: estuvo conectado en algún momento
  posterior al inicio, pero pudo entrar tarde.

Quien se desconectó antes de que empezara no aparece. Quien fue pero no estuvo
en ninguna kill tampoco sale en el killboard, así que revisa antes de sancionar.

## De dónde salen los datos

- `/battles?guildId=…`: killboards del gremio.
- `/events/battle/{id}`: cada kill con el equipo completo del que mata, del que
  muere, de los que participaron y de su grupo. El arma se toma de `MainHand`.
  Solo se ve el equipo de quien estuvo en al menos una kill.

## Pestañas Armas y Jugadores

- **Armas**: a qué arma del juego corresponde cada nombre del bot ("Golem",
  "SoB", "GA"…). Vienen cargados los apodos del gremio; por ejemplo Golem es
  Earthrune Staff, Cobra es Stillgaze Staff y Galas es Galatine Pair.
- **Jugadores**: para quien se anota en Discord con un nombre distinto al del
  personaje. Si la app encuentra un nombre parecido, muestra «¿Nombre?» y el
  botón Confirmar lo guarda aquí.

Lo que cambies se guarda en `cta-checker-config.json`, junto al programa.
Cópialo junto con el `.exe` para llevarte la configuración a otra PC.

## Compilar

Necesita Go 1.25 o superior: ejecuta `build.cmd` para crear los ejecutables en `dist/`.
`scripts/build_items.py` regenera `web/items.json` (nombres de armas) a partir de
`formatted/items.txt` de ao-bin-dumps.
