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
3. **Batalla**: los killboards del gremio aparecen solos (los 50 más recientes).
   Filtra por mínimo de jugadores (30 por defecto) o del gremio, y usa
   «Cargar más antiguas» para seguir hacia atrás de a 50: los killboards a veces
   tardan días en aparecer. Marca todos los killboards del timer: un mismo
   personaje puede salir en varios y cuenta una sola vez.
4. **Revisar armas**: muestra, por puesto, qué arma usó cada uno.
5. **Mensaje para Discord**: copia el texto (se parte en mensajes de menos de
   2.000 caracteres si hace falta).

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
