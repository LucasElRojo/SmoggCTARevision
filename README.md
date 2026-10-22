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
2. **Lista del bot**: pega el mensaje de anotados (todas las partys que haya).
   Opcional: en «Lista de miembros del gremio» pega la lista de miembros
   exportada del juego ("Character Name", "Last Seen", "Roles") para ver quién
   estaba conectado y no fue (ver «Conectados que no fueron» abajo).
3. **Batalla**: los killboards del gremio aparecen solos (los 50 más recientes).
   Filtra por mínimo de jugadores (30 por defecto) o del gremio, y usa
   «Cargar más antiguas» para seguir hacia atrás de a 50: los killboards a veces
   tardan días en aparecer. Marca todos los killboards del timer: un mismo
   personaje puede salir en varios y cuenta una sola vez.
4. **Revisar armas**: muestra, por puesto, qué arma usó cada uno.
5. **Mensaje para Discord**: copia el texto (se parte en mensajes de menos de
   2.000 caracteres si hace falta).
6. **Guardar en el historial**: pon la fecha y la hora UTC de la CTA (la app
   sugiere la más cercana entre 22:00, 00:00, 02:00 y 04:00, pero tú decides) y
   pulsa «Guardar CTA». Si ya había una CTA con esa fecha y hora, se reemplaza.

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
| ✗ | Se anotó y no fue. |
| 🚫 | Estaba conectado y no fue (si se pegó la lista de miembros al revisar). |
| · | No se anotó ni fue. |
| vacía | Todavía no era del gremio (o ya se había ido). |

Al lado de cada jugador: % de asistencia, veces que fue, veces que se anotó,
veces que se anotó y no fue, veces con arma equivocada, veces que fue sin
anotarse, skips y su arma más usada. Arriba, la asistencia global y el promedio
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
| 👻 No participó | No aparece en los killboards marcados (o se anotó con otro nombre). |
| 👀 GENTE NO REGISTRADA | Jugadores del gremio que estuvieron en la batalla pero no estaban en la lista. |
| 🚫 Conectados que no fueron | Miembros de la lista del juego que no aparecen en ningún killboard marcado. |

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
