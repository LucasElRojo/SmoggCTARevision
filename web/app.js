"use strict";

// Bot weapon name -> base item IDs (tier and enchantment stripped). Keys are
// normalised with norm(); the guild's nicknames were confirmed by the user.
const DEFAULT_WEAPONS = {
  "Golem": ["2H_SHAPESHIFTER_KEEPER"],
  "Cobra": ["2H_SHAPESHIFTER_CRYSTAL"],
  "Heavy Mace": ["2H_MACE"],
  "Monarch": ["MAIN_MACE_CRYSTAL"],
  "Camlann": ["2H_MACE_MORGANA"],
  "Incubo": ["MAIN_MACE_HELL"],
  "Incubus": ["MAIN_MACE_HELL"],
  "1H Hammer": ["MAIN_HAMMER"],
  "SoB": ["2H_ROCKSTAFF_KEEPER"],
  "GA": ["2H_ARCANESTAFF"],
  "Oathkeepers": ["2H_DUALMACE_AVALON"],
  "Oathkeppers": ["2H_DUALMACE_AVALON"],
  "Icicle": ["2H_ICEGAUNTLETS_HELL"],
  "Perma": ["2H_ICECRYSTAL_UNDEAD"],
  "Carving": ["2H_CLEAVER_HELL"],
  "Realmbreaker": ["2H_AXE_AVALON"],
  "Shadowcaller": ["MAIN_CURSEDSTAFF_AVALON"],
  "Rotcaller": ["MAIN_CURSEDSTAFF_CRYSTAL"],
  "Damnation": ["2H_CURSEDSTAFF_MORGANA"],
  "Rootbound": ["2H_SHAPESHIFTER_SET2"],
  "Locus": ["2H_ENIGMATICORB_MORGANA"],
  "Hallow Fall": ["MAIN_HOLYSTAFF_AVALON"],
  "Fallen": ["2H_HOLYSTAFF_HELL"],
  "Exalted": ["2H_HOLYSTAFF_CRYSTAL"],
  "1h Nature": ["MAIN_NATURESTAFF"],
  "Longbow": ["2H_LONGBOW"],
  "Shaper": ["2H_CROSSBOW_CANNON_AVALON"],
  "Spiked": ["2H_KNUCKLES_SET3"],
  "Bracers": ["2H_KNUCKLES_SET2"],
  "Bloodletter": ["MAIN_RAPIER_MORGANA"],
  "Spirithunter": ["2H_HARPOON_HELL"],
  "Galas": ["2H_DUALSCIMITAR_UNDEAD"],
  "Battlemount": ["@battlemount"],
};

const BATTLEMOUNT = /(_BATTLE|SIEGE_BALLISTA|UNIQUE_MOUNT_(RHINO_SEASON|TOWER_CHARIOT|ARMORED_EAGLE|BEETLE|BEHEMOTH|ENT|BATTLESPIDER|BASTION|JUGGERNAUT|TANKBEETLE)_)/;
const PAGE = 51;

const STATUS = {
  ok: { label: "Correcto", icon: "✅" },
  wrong: { label: "Otra arma", icon: "❌" },
  check: { label: "Revisar", icon: "⚠️" },
  noeq: { label: "Sin equipo visible", icon: "⚠️" },
  unmapped: { label: "Arma sin mapear", icon: "❓" },
  absent: { label: "No participó", icon: "👻" },
  pending: { label: "Sin killboard", icon: "⏳" },
  bomb: { label: "Bomb", icon: "💣" },
  party: { label: "Otra party", icon: "🎯" },
  late: { label: "Llegó tarde", icon: "⏰" },
  unsigned: { label: "Sin anotarse", icon: "👀" },
  voice: { label: "En el canal", icon: "🎧" },
  skip: { label: "Skip", icon: "🚫" },
};

const $ = (id) => document.getElementById(id);
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let items = {};          // base ID -> English name
let config = { weapons: {}, players: {} };
let battles = [];        // listed battles
let battleOffset = 0;
let guildInfo = null;    // {Id, Name}
const selected = new Set();
let lastResult = null;

// ---------- API ----------

async function gi(path, params = {}) {
  const query = new URLSearchParams({ ...params, region: $("region").value });
  const resp = await fetch(`/api/gi/${path}?${query}`);
  if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`);
  return resp.json();
}

async function resolveGuild() {
  const name = $("guild").value.trim();
  if (guildInfo && norm(guildInfo.Name) === norm(name)) return guildInfo;
  const found = await gi("search", { q: name });
  const guilds = found.guilds || [];
  guildInfo = guilds.find((g) => g.Name.toLowerCase() === name.toLowerCase()) || null;
  if (!guildInfo) throw new Error(`No encontré el gremio "${name}" en este servidor.`);
  return guildInfo;
}

// ---------- configuration ----------

async function loadConfig() {
  try {
    const data = await (await fetch("/api/config")).json();
    config = { ...data, weapons: data.weapons || {}, players: data.players || {} };
  } catch {
    config = { weapons: {}, players: {} };
  }
  if (config.region) $("region").value = config.region;
  if (config.guild) $("guild").value = config.guild;
}

async function saveConfig() {
  await fetch("/api/config", { method: "POST", body: JSON.stringify(config, null, 2) });
}

function weaponTable() {
  const table = {};
  for (const [label, ids] of Object.entries(DEFAULT_WEAPONS)) table[norm(label)] = { label, ids };
  for (const [label, ids] of Object.entries(config.weapons)) {
    if (ids === null) delete table[norm(label)];
    else table[norm(label)] = { label, ids };
  }
  return table;
}

// The bot's name, then an item whose English name is or contains it.
function expectedFor(weapon) {
  const key = norm(weapon);
  const alias = weaponTable()[key];
  if (alias) return alias.ids;
  const weapons = Object.entries(items).filter(([id]) => !id.includes("MOUNT"));
  const exact = weapons.filter(([, name]) => norm(name) === key);
  if (exact.length) return exact.map(([id]) => id);
  const partial = weapons.filter(([, name]) => key.length >= 4 && norm(name).includes(key));
  return partial.length === 1 ? [partial[0][0]] : null;
}

// ---------- parsing the bot's list ----------

function parseList(text) {
  const entries = [];
  let party = "";
  let title = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cta = line.match(/CTA[^#\n]*#\s*(\d+)/i);
    if (cta && !title) title = `CTA #${cta[1]}`;
    const partyMatch = line.match(/^PARTY\s*(\d+)/i);
    if (partyMatch) { party = `Party ${partyMatch[1]}`; continue; }
    const m = line.match(/^(\d+)\s*[.)]\s*(.+)$/);
    if (!m) continue;
    const rest = m[2];
    const split = rest.search(/\s[—–-]\s/);
    if (split < 0) continue;
    const weapon = rest.slice(0, split).replace(/^[^\p{L}\p{N}]+/u, "").trim();
    let player = rest.slice(split + 3)
      .replace(/[🔒🔓]/gu, "")
      .replace(/[*_~`|]/g, "")
      .trim()
      .replace(/^@/, "")
      .replace(/[^\p{L}\p{N}>)]+$/u, "")
      .trim();
    const free = !player || /^libre$/i.test(player);
    entries.push({ pos: Number(m[1]), party, weapon, discord: free ? "" : player });
  }
  return { title, entries };
}

// The guild member list exported from the game: "Character Name", "Last Seen"
// ("Online" or a UTC date, MM/DD/YYYY HH:MM:SS) and "Roles", tab separated.
function parseMembers(text) {
  const members = [];
  for (const raw of text.split(/\r?\n/)) {
    const fields = raw.split(/\t|","|";"/).map((f) => f.trim().replace(/^"|"$/g, "").trim());
    if (fields.length < 2 || !fields[0] || /character\s*name|nombre/i.test(fields[0])) continue;
    const [name, seen, roles = ""] = fields;
    let lastSeen = null;
    const online = /^(online|en l[ií]nea|conectado)$/i.test(seen);
    const d = seen.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (d) {
      let [month, day] = [Number(d[1]), Number(d[2])];
      if (month > 12) [month, day] = [day, month];
      lastSeen = new Date(Date.UTC(Number(d[3]), month - 1, day, Number(d[4]), Number(d[5]), Number(d[6] || 0)));
    }
    if (!online && !lastSeen) continue;
    members.push({ name, online, lastSeen, roles: roles.split(";").filter(Boolean) });
  }
  return members;
}

function showMembersSummary() {
  const members = parseMembers($("members").value);
  const online = members.filter((m) => m.online).length;
  $("members-summary").textContent = members.length ? `${members.length} miembros, ${online} online al exportar.` : "";
  try { localStorage.setItem("cta-members", $("members").value); } catch {}
}

// Names of the people in the CTA's Discord voice channel, one per line (code
// fences, @ and bullets are ignored).
function parseVoice(text) {
  const names = [];
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.replace(/`/g, "").replace(/^[\s>*•\-@]+/, "").trim();
    if (name) names.push(name);
  }
  return [...new Map(names.map((n) => [norm(n), n])).values()];
}

function showVoiceSummary() {
  const names = parseVoice($("voice").value);
  $("voice-summary").textContent = names.length ? `${names.length} en el canal.` : "";
  try { localStorage.setItem("cta-voice", $("voice").value); } catch {}
}

// Matches a game name against the voice channel: exact (ignoring case and
// symbols), through the Discord → game aliases, or one letter off for names of
// five or more (I and l look the same in Discord).
function voiceIndex(names) {
  const keys = new Map(names.map((n) => [norm(n), n]));
  for (const [discord, game] of Object.entries(config.players)) {
    if (keys.has(norm(discord))) keys.set(norm(game), keys.get(norm(discord)));
  }
  const cache = new Map();
  const find = (name) => {
    const key = norm(name);
    if (cache.has(key)) return cache.get(key);
    let hit = keys.get(key) || null;
    if (!hit && key.length >= 5) {
      for (const [k, n] of keys) if (Math.abs(k.length - key.length) <= 1 && levenshtein(k, key) <= 1) { hit = n; break; }
    }
    cache.set(key, hit);
    return hit;
  };
  return { names, size: names.length, find };
}

const SKIP_ORDER = { during: 0, online: 1, after: 2 };
const SKIP_LABEL = {
  during: "Se desconectó durante la CTA",
  online: "Online al exportar la lista",
  after: "Se desconectó después de la CTA",
};

// Members connected around the CTA who are in none of the marked killboards.
// "Last Seen" is the last logout, so only a logout inside the battles' window
// proves the player was online during it; "Online" or a later logout is
// weaker: they may have logged in after the CTA.
function findSkippers(members, players, battleList, rows) {
  const start = Math.min(...battleList.map((b) => new Date(b.startTime)));
  const end = Math.max(...battleList.map((b) => new Date(b.endTime)));
  const signed = new Map(rows.map((r) => [norm(r.found?.player.name || r.discord), r]));
  return members.filter((m) => !players.has(norm(m.name))).map((m) => {
    let when = null;
    if (m.lastSeen && m.lastSeen >= start && m.lastSeen <= end) when = "during";
    else if (m.online) when = "online";
    else if (m.lastSeen && m.lastSeen > end) when = "after";
    return when && { ...m, when, signed: signed.get(norm(m.name)) || null };
  }).filter(Boolean).sort((a, b) => SKIP_ORDER[a.when] - SKIP_ORDER[b.when] || a.name.localeCompare(b.name));
}

function showListSummary() {
  const { title, entries } = parseList($("list").value);
  const signed = entries.filter((e) => e.discord);
  const parties = new Set(entries.map((e) => e.party)).size;
  const unmapped = [...new Set(signed.filter((e) => !expectedFor(e.weapon)).map((e) => e.weapon))];
  $("list-summary").innerHTML = entries.length
    ? `${esc(title || "Lista")}: ${signed.length} anotados de ${entries.length} puestos en ${parties} party(s).` +
      (unmapped.length ? ` <span class="error">Armas sin mapear: ${unmapped.map(esc).join(", ")} (agrégalas en Armas).</span>` : "")
    : "";
  try { localStorage.setItem("cta-list", $("list").value); } catch {}
}

// ---------- battles ----------

// Everything is shown in UTC, like the CTA hours and the game's member export.
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

// The API answers the battle list slowly (up to a minute for 50), so it loads
// by itself when the page opens and in pages of 50 on demand.
let loadingBattles = false;
async function loadBattles(more) {
  if (loadingBattles) return;
  loadingBattles = true;
  $("load-battles").disabled = $("more-battles").disabled = true;
  $("battle-status").textContent = "Cargando killboards del gremio… (la API de Albion puede tardar hasta un minuto)";
  try {
    const guild = await resolveGuild();
    if (!more) { battles = []; battleOffset = 0; }
    const page = await gi("battles", { offset: battleOffset, limit: 50, sort: "recent", guildId: guild.Id });
    battleOffset += 50;
    const known = new Set(battles.map((b) => String(b.id)));
    battles.push(...page.filter((b) => !known.has(String(b.id))));
    $("battle-status").textContent = "";
    renderBattles();
    $("more-battles").hidden = page.length < 50;
  } catch (err) {
    $("battle-status").innerHTML = `<span class="error">${esc(err.message)}</span>`;
  } finally {
    loadingBattles = false;
    $("load-battles").disabled = $("more-battles").disabled = false;
  }
}

function guildPlayers(b, gid) {
  return Object.values(b.players || {}).filter((p) => p.guildId === gid);
}

function renderBattles() {
  const gid = guildInfo?.Id;
  const minPlayers = Number($("min-players").value) || 0;
  const minGuild = Number($("min-guild").value) || 0;
  const visible = battles.filter((b) => selected.has(String(b.id)) ||
    (Object.keys(b.players || {}).length >= minPlayers && guildPlayers(b, gid).length >= minGuild));
  // The same characters show up in several killboards of one timer: count them once.
  const chosen = battles.filter((b) => selected.has(String(b.id)));
  const unique = new Set(chosen.flatMap((b) => guildPlayers(b, gid).map((p) => p.name.toLowerCase())));
  const summary = chosen.length
    ? `<p><b>${chosen.length}</b> killboard(s) marcados · <b>${unique.size}</b> jugadores únicos de ${esc(guildInfo.Name)}</p>` : "";
  const rows = visible.map((b) => {
    const players = Object.values(b.players || {});
    const ours = guildPlayers(b, gid).length;
    const g = (b.guilds || {})[gid] || {};
    const minutes = Math.max(1, Math.round((new Date(b.endTime) - new Date(b.startTime)) / 60000));
    const enemies = Object.values(b.guilds || {}).filter((x) => x.id !== gid)
      .sort((a, c) => (c.killFame || 0) - (a.killFame || 0)).slice(0, 4).map((x) => x.name);
    const sel = selected.has(String(b.id));
    return `<tr class="battle${sel ? " selected" : ""}" data-id="${b.id}">
      <td><input type="checkbox" ${sel ? "checked" : ""}></td>
      <td>${fmtTime(b.startTime)}</td><td>${minutes} min</td>
      <td>${b.id}</td><td>${players.length}</td><td><b>${ours}</b></td>
      <td>${g.kills ?? 0} / ${g.deaths ?? 0}</td><td>${b.totalKills}</td>
      <td class="muted">${enemies.map(esc).join(", ")}</td></tr>`;
  }).join("");
  const hidden = battles.length - visible.length;
  const oldest = battles.length ? fmtTime(battles[battles.length - 1].startTime) : "";
  const loaded = battles.length ? `<p class="hint">${battles.length} killboards cargados, hasta el ${oldest}` +
    (hidden ? ` · ${hidden} ocultos por el filtro` : "") + ". Usa «Cargar más antiguas» para seguir hacia atrás.</p>" : "";
  $("battles").innerHTML = summary + loaded + (visible.length ? `<table>
    <thead><tr><th></th><th>Inicio</th><th>Duración</th><th>ID</th><th>Jugadores</th><th>${esc(guildInfo.Name)}</th><th>K / D</th><th>Kills total</th><th>Otros gremios</th></tr></thead>
    <tbody>${rows}</tbody></table>` : battles.length ? "" : `<p class="muted">Sin batallas recientes.</p>`);
}

function selectedIds() {
  const ids = new Set(selected);
  for (const m of $("manual-ids").value.matchAll(/\d{6,}/g)) ids.add(m[0]);
  return [...ids];
}

// ---------- analysis ----------

const baseOf = (type) => type.replace(/^T\d_/, "").replace(/@\d+$/, "");
function tierOf(type) {
  const t = type.match(/^T(\d)_/);
  const e = type.match(/@(\d+)$/);
  return t ? `${t[1]}.${e ? e[1] : 0}` : "";
}

async function fetchBattle(id, progress) {
  const battle = await gi(`battles/${id}`);
  const events = [];
  // The API is slow per page: ask for four pages at a time until one is short.
  for (let offset = 0; offset < 10000; offset += PAGE * 4) {
    progress(`Batalla ${id}: ${events.length} de ~${battle.totalKills} kills leídas…`);
    const pages = await Promise.all([0, 1, 2, 3].map((i) =>
      gi(`events/battle/${id}`, { offset: offset + i * PAGE, limit: PAGE })));
    for (const page of pages) events.push(...page);
    if (pages.some((page) => page.length < PAGE)) break;
  }
  return { battle, events };
}

function collectPlayers(fetched, guild) {
  const players = new Map();
  const get = (name, id) => {
    const key = norm(name);
    if (!players.has(key)) players.set(key, { name, id, kills: 0, deaths: 0, weapons: new Map(), mounts: new Map(), seen: false, battles: new Set() });
    return players.get(key);
  };
  const seenEvents = new Set();
  for (const { battle, events } of fetched) {
    for (const p of Object.values(battle.players || {})) {
      if (p.guildId !== guild.Id) continue;
      const entry = get(p.name, p.id);
      entry.battles.add(battle.id);
      entry.kills += p.kills || 0;
      entry.deaths += p.deaths || 0;
    }
    for (const ev of events) {
      if (seenEvents.has(ev.EventId)) continue;
      seenEvents.add(ev.EventId);
      for (const p of [ev.Killer, ev.Victim, ...(ev.Participants || []), ...(ev.GroupMembers || [])]) {
        if (!p || p.GuildId !== guild.Id) continue;
        const entry = get(p.Name, p.Id);
        const eq = p.Equipment || {};
        if (eq.MainHand?.Type) {
          entry.seen = true;
          tally(entry.weapons, eq.MainHand.Type);
        }
        if (eq.Mount?.Type) tally(entry.mounts, eq.Mount.Type);
      }
    }
  }
  return players;
}

function tally(map, type) {
  const base = baseOf(type);
  const slot = map.get(base) || { base, types: new Set(), count: 0 };
  slot.types.add(type);
  slot.count++;
  map.set(base, slot);
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function findPlayer(discord, players, taken) {
  const alias = Object.entries(config.players).find(([k]) => norm(k) === norm(discord));
  const key = norm(alias ? alias[1] : discord);
  if (players.has(key)) return { player: players.get(key), guess: false };
  if (key.length < 3) return null;
  let best = null;
  for (const [k, p] of players) {
    if (taken.has(k)) continue;
    const dist = levenshtein(key, k);
    const contains = key.length >= 4 && k.length >= 4 && (k.includes(key) || key.includes(k));
    const score = contains ? 0.5 : dist;
    if ((dist <= 2 || contains) && (!best || score < best.score)) best = { player: p, score };
  }
  return best ? { player: best.player, guess: true } : null;
}

function judge(entry, found) {
  const expected = expectedFor(entry.weapon);
  if (!found) return { status: "absent", expected };
  const p = found.player;
  const used = [...p.weapons.values()].sort((a, b) => b.count - a.count);
  if (!expected) return { status: "unmapped", expected, used };
  if (expected.includes("@battlemount")) {
    const mounts = [...p.mounts.values()].filter((m) => BATTLEMOUNT.test(m.base));
    return { status: mounts.length ? "ok" : "check", expected, used, mounts: [...p.mounts.values()], note: mounts.length ? "" : "no se vio montura de batalla" };
  }
  if (!used.length) return { status: "noeq", expected, used };
  const match = used.filter((w) => expected.includes(w.base));
  if (!match.length) return { status: "wrong", expected, used };
  const others = used.filter((w) => !expected.includes(w.base));
  return { status: "ok", expected, used, note: others.length ? "también usó " + others.map(weaponName).join(", ") : "" };
}

// ---------- marks: bombs, other parties, late arrivals ----------

// Officers mark players by hand: a group (bomb or another party: players who
// fight outside the bot's parties and never sign up) and/or a late arrival.
// Both count as present. Marks belong to one CTA: every check starts without
// them, and the CTA's saved record (same date and hour) brings its marks back,
// so a pre-registration and the later check with the killboard share them.
const TAGS = {
  bomb: { label: "Bomb", icon: "💣" },
  party: { label: "Otra party", icon: "🎯" },
};
let tags = new Map(); // norm(name) -> { name, tag: "bomb" | "party" | null, late: bool }

// mark is "bomb", "party" or "late"; setting the active one again removes it.
function toggleMark(name, mark, on) {
  const key = norm(name);
  const t = tags.get(key) || { name, tag: null, late: false };
  if (mark === "late") t.late = on ?? !t.late;
  else t.tag = (on ?? t.tag !== mark) ? mark : null;
  if (t.tag || t.late) tags.set(key, t); else tags.delete(key);
}

const markOf = (name) => tags.get(norm(name)) || { tag: null, late: false };

function markButtons(name) {
  const m = markOf(name);
  const button = (mark, icon, label, active) =>
    `<button class="small ${active ? "primary" : "secondary"}" data-mark="${mark}" data-name="${esc(name)}" title="${active ? "Quitar" : "Marcar"}: ${label}">${icon}</button>`;
  return `<span class="marks">${button("bomb", "💣", "Bomb", m.tag === "bomb")}${button("party", "🎯", "Otra party", m.tag === "party")}${button("late", "⏰", "Llegó tarde", m.late)}</span>`;
}

function aliasFor(discord) {
  const alias = Object.entries(config.players).find(([k]) => norm(k) === norm(discord));
  return alias ? alias[1] : discord;
}

const rowName = (r) => r.found?.player.name || aliasFor(r.discord);

// ---------- analysis ----------

function matchRows(rows, players) {
  const taken = new Set();
  // Exact names first, so a fuzzy guess never takes someone else's player.
  for (const r of rows) {
    const exact = findPlayer(r.discord, players, new Set());
    if (exact && !exact.guess) { r.found = exact; taken.add(norm(exact.player.name)); }
  }
  for (const r of rows) {
    if (r.found) continue;
    r.found = findPlayer(r.discord, players, taken);
    if (r.found) taken.add(norm(r.found.player.name));
  }
  return taken;
}

async function analyze() {
  const ids = selectedIds();
  const { title, entries } = parseList($("list").value);
  const signed = entries.filter((e) => e.discord);
  const members = parseMembers($("members").value);
  const voiceNames = parseVoice($("voice").value);
  if (!signed.length && !members.length && !voiceNames.length) return showError("Pega la lista del bot, la de miembros o la del canal de Discord.");
  $("analyze").disabled = true;
  try {
    const guild = await resolveGuild();
    const fetched = [];
    for (const id of ids) fetched.push(await fetchBattle(id, (msg) => ($("progress").textContent = msg)));
    const provisional = !fetched.length;
    const battleList = fetched.map((f) => f.battle);
    const rows = signed.map((e) => ({ ...e }));
    let extras = [], skippers = null;
    if (provisional) {
      const roster = new Map(members.map((m) => [norm(m.name), { name: m.name, member: m }]));
      matchRows(rows, roster);
      for (const r of rows) Object.assign(r, { status: "pending", member: r.found?.player.member || null });
    } else {
      const players = collectPlayers(fetched, guild);
      const taken = matchRows(rows, players);
      for (const r of rows) Object.assign(r, judge(r, r.found));
      extras = [...players.entries()].filter(([k]) => !taken.has(k)).map(([, p]) => p);
      if (members.length) skippers = findSkippers(members, players, battleList, rows);
    }
    tags = new Map();
    lastResult = { title, rows, extras, skippers, members, voiceNames, battles: battleList, guild, provisional };
    $("progress").textContent = "";
    renderResults();
  } catch (err) {
    showError(err.message);
  } finally {
    $("analyze").disabled = false;
  }
}

function showError(msg) {
  $("progress").innerHTML = `<span class="error">${esc(msg)}</span>`;
}

// ---------- one list of every player ----------

// Every player with any signal: signed up, seen in the killboard, in the
// Discord channel, connected to the game around the CTA, or marked by hand.
// Marks change after the check, so the list is rebuilt on every render.
function playerList() {
  const { rows, extras, members = [], voiceNames = [], skippers, provisional } = lastResult;
  const voice = voiceIndex(voiceNames);
  const memberBy = new Map(members.map((m) => [norm(m.name), m]));
  const memberByVoice = new Map();
  for (const m of members) { const v = voice.find(m.name); if (v && !memberByVoice.has(norm(v))) memberByVoice.set(norm(v), m); }
  const findMember = (...names) => names.map((n) => memberBy.get(norm(n))).find(Boolean) || null;
  const skipBy = new Map((skippers || []).map((s) => [norm(s.name), s]));

  const list = [];
  const seen = new Set(), seenVoice = new Set();
  const add = (p) => {
    p.voiceName = p.voiceName || null;
    list.push(p);
    seen.add(norm(p.name));
    if (p.voiceName) seenVoice.add(norm(p.voiceName));
  };
  for (const r of rows) {
    const name = rowName(r);
    add({ name, row: r, member: r.member || findMember(name, r.discord), fought: provisional ? null : r.found?.player || null,
      voiceName: voice.find(name) || voice.find(r.discord) });
  }
  for (const p of extras) {
    if (!seen.has(norm(p.name))) add({ name: p.name, row: null, member: findMember(p.name), fought: p, voiceName: voice.find(p.name) });
  }
  for (const n of voice.names) {
    if (seenVoice.has(norm(n))) continue;
    const member = findMember(n) || memberByVoice.get(norm(n)) || null;
    const name = member?.name || n;
    if (seen.has(norm(name))) continue;
    add({ name, row: null, member, fought: null, voiceName: n });
  }
  for (const m of members) {
    if (seen.has(norm(m.name))) continue;
    if (provisional ? m.online : skipBy.has(norm(m.name))) add({ name: m.name, row: null, member: m, fought: null });
  }
  for (const t of tags.values()) {
    if (!seen.has(norm(t.name))) add({ name: t.name, row: null, member: findMember(t.name), fought: null, voiceName: voice.find(t.name) });
  }
  for (const p of list) {
    p.skip = skipBy.get(norm(p.name)) || null;
    Object.assign(p, assess(p, voice));
  }
  return { list, voice };
}

const PRESENT = ["ok", "wrong", "noeq", "check", "unmapped", "unsigned", "bomb", "party", "late"];
const ORDER = ["wrong", "absent", "skip", "check", "noeq", "unmapped", "voice", "pending", "late", "unsigned", "bomb", "party", "ok"];

function seenText(member) {
  return member?.lastSeen ? ` (visto ${fmtTime(member.lastSeen)})` : "";
}

// The player's state and the observations that explain it or ask about it.
function assess(p, voice) {
  const { provisional, battles: fetched } = lastResult;
  const hasMembers = lastResult.members?.length > 0;
  const mark = markOf(p.name);
  const r = p.row;
  const inVoice = !!p.voiceName;
  const obs = [];
  const o = (icon, text) => obs.push({ icon, text });

  let status;
  if (r) status = provisional ? "pending" : r.status;
  else if (p.fought) status = "unsigned";
  else if (inVoice) status = "voice";
  else status = "skip";
  if (mark.tag && ["absent", "pending", "unsigned", "voice", "skip"].includes(status)) status = mark.tag;
  if (mark.late && ["absent", "pending", "voice", "skip"].includes(status)) status = "late";
  const attended = PRESENT.includes(status) ? true : status === "absent" || status === "skip" ? false : null;

  if (mark.late) o("⏰", "Llegó tarde");
  if (mark.tag) o(TAGS[mark.tag].icon, `Jugó en ${mark.tag === "bomb" ? "una bomb" : "otra party"}`);
  if (r?.found?.guess) o("❓", `¿Es ${r.found.player.name}? Confírmalo`);
  if (r && !provisional) {
    if (r.status === "wrong") o("❌", `Usó ${usedText(r)} en vez de ${r.weapon}`);
    if (r.status === "noeq") o("⚠️", "Estuvo en la batalla, pero no se le vio el equipo");
    if (r.status === "check") o("⚠️", r.note || "Revisar a mano");
    if (r.status === "unmapped") o("❓", `«${r.weapon}» no está en la pestaña Armas`);
    if (r.status === "ok" && r.note) o("ℹ️", r.note);
    if (r.status === "absent" && !mark.tag && !mark.late) o("👻", inVoice ? "Estaba en el canal pero no salió en el killboard: ¿llegó tarde o no hizo kills?" : "Se anotó y no salió en el killboard");
  }
  if (p.fought && fetched.length > 1 && p.fought.battles?.size < fetched.length) {
    o("⏱️", `Solo salió en ${p.fought.battles.size} de ${fetched.length} killboards: ¿llegó tarde?`);
  }
  if (p.fought && !r && !mark.tag) o("👀", "Fue sin anotarse: ¿bomb u otra party?");
  if (hasMembers) {
    if (!p.member) {
      if (r || inVoice) o("❔", "No está en la lista de miembros: ¿otro nombre o no es del gremio?");
    } else if (!p.member.online) {
      if (inVoice) o("⚠️", `Desconectado del juego${seenText(p.member)} pero en el canal de Discord: ¿se cayó o llega tarde?`);
      else if (r && provisional) o("📴", `Desconectado del juego${seenText(p.member)}`);
    }
  }
  if (voice.size) {
    if (r && !inVoice && !mark.tag) o("🔇", "Anotado pero no está en el canal de Discord");
    if (!r && inVoice && !p.fought && !mark.tag && !mark.late) {
      o("🎧", provisional ? "En el canal sin anotarse: ¿bomb u otra party?" : "En el canal, sin anotarse y sin salir en el killboard");
    }
  }
  if (status === "skip") {
    o("🚫", p.skip && !provisional ? `${SKIP_LABEL[p.skip.when]}${p.skip.lastSeen ? ` (${fmtTime(p.skip.lastSeen)})` : ""}, sin salir en el killboard`
      : `Conectado al juego sin anotarse${voice.size ? " ni estar en el canal" : ""}`);
  }
  return { status, attended, obs, inVoice };
}

// ---------- rendering ----------

function weaponName(w) { return items[w.base] || w.base; }

function weaponHtml(w) {
  const type = [...w.types][0];
  return `<span class="weapon" title="${esc(type)}"><img src="https://render.albiononline.com/v1/item/${encodeURIComponent(type)}.png?size=56" loading="lazy" alt="">${esc(weaponName(w))} <span class="muted">${[...w.types].map(tierOf).join(", ")}</span></span>`;
}

function expectedHtml(ids) {
  if (!ids) return `<span class="error">sin mapear</span>`;
  return ids.map((id) => (id === "@battlemount" ? "montura de batalla" : esc(items[id] || id))).join(" / ");
}

function gameCell(p) {
  if (!lastResult.members?.length) return '<span class="muted">—</span>';
  if (!p.member) return '<span class="muted" title="No está en la lista de miembros">❔</span>';
  if (p.member.online) return "🟢 online";
  return `<span class="muted">📴 ${p.member.lastSeen ? fmtTime(p.member.lastSeen) : "desconectado"}</span>`;
}

function sortedList(list) {
  const byPos = $("res-sort")?.value === "pos";
  return [...list].sort((a, b) => byPos
    ? (a.row?.pos ?? 999) - (b.row?.pos ?? 999) || a.name.localeCompare(b.name)
    : ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.row?.pos ?? 999) - (b.row?.pos ?? 999) || a.name.localeCompare(b.name));
}

function renderResults() {
  const { battles: fetched, guild, provisional } = lastResult;
  const { list, voice } = playerList();
  const counts = {};
  for (const p of list) counts[p.status] = (counts[p.status] || 0) + 1;
  const hidden = new Set(lastResult.hiddenStatus || []);

  const body = sortedList(list).map((p) => {
    const r = p.row;
    const nameCell = r?.found?.guess
      ? `¿${esc(r.found.player.name)}? <button class="small" data-confirm="${esc(r.discord)}" data-name="${esc(r.found.player.name)}">Confirmar</button>`
      : esc(p.name);
    const discord = r && norm(r.discord) !== norm(p.name) ? `<div class="muted">@${esc(r.discord)}</div>` : "";
    const signedCell = r ? `<b>${esc(r.weapon)}</b> <span class="muted">#${r.pos}</span><div class="muted">${expectedHtml(r.expected || expectedFor(r.weapon))}</div>` : '<span class="muted">—</span>';
    const voiceCell = !voice.size ? '<span class="muted">—</span>' : p.inVoice ? `🎧${norm(p.voiceName) !== norm(p.name) ? ` <span class="muted">${esc(p.voiceName)}</span>` : ""}` : '<span class="muted">—</span>';
    const fought = p.fought;
    const kbCell = provisional ? "" : `<td>${fought ? [...fought.weapons.values()].sort((a, b) => b.count - a.count).map(weaponHtml).join("") || '<span class="muted">sin equipo visible</span>'
      : '<span class="muted">—</span>'}${r?.mounts?.length ? `<div class="muted">montura: ${r.mounts.map((m) => esc(items[m.base] || m.base)).join(", ")}</div>` : ""}</td>`;
    const obsCell = p.obs.map((x) => `<div class="obs">${x.icon} ${esc(x.text)}</div>`).join("");
    return `<tr data-status="${p.status}"${hidden.has(p.status) ? " hidden" : ""}>
      <td>${nameCell}${discord}</td><td>${signedCell}</td><td>${gameCell(p)}</td><td>${voiceCell}</td>${kbCell}
      <td><span class="status s-${p.status}">${STATUS[p.status].icon} ${STATUS[p.status].label}</span></td>
      <td class="obs-cell">${obsCell}</td><td>${markButtons(p.name)}</td></tr>`;
  }).join("");

  const banner = provisional
    ? `<p class="banner">⏳ <b>Pre-registro sin killboard.</b> Todavía no se puede saber quién fue ni con qué arma: solo quién se anotó, quién está conectado y quién está en el canal. Cuando aparezca el killboard, revisa de nuevo y regístralo con la misma fecha y hora para reemplazarlo.</p>`
    : `<p class="muted">Batalla(s): ${fetched.map((b) => `${b.id} (${fmtTime(b.startTime)})`).join(", ")} · ${esc(guild.Name)}</p>`;
  const present = ORDER.filter((s) => counts[s]);
  const names = new Set([...(lastResult.members || []).map((m) => m.name), ...lastResult.extras.map((p) => p.name), ...(lastResult.voiceNames || [])]);

  $("results").innerHTML = `${banner}
    <div class="counts">${present.map((s) => `<div>${STATUS[s].icon} ${STATUS[s].label}: <span>${counts[s]}</span></div>`).join("")}</div>
    <div class="row filters">
      <span>Mostrar:</span> ${present.map((s) => `<label><input type="checkbox" data-filter="${s}" ${hidden.has(s) ? "" : "checked"}> ${STATUS[s].label}</label>`).join("")}
      <label>Ordenar <select id="res-sort"><option value="status">por estado</option><option value="pos"${$("res-sort")?.value === "pos" ? " selected" : ""}>por puesto</option></select></label>
    </div>
    <div class="table-scroll"><table class="players"><thead><tr>
      <th>Jugador</th><th>Anotado</th><th>🎮 Juego</th><th>🎧 Canal</th>${provisional ? "" : "<th>⚔️ Killboard</th>"}
      <th>Estado</th><th>Observación</th><th title="💣 Bomb · 🎯 Otra party · ⏰ Llegó tarde">Marcar</th>
    </tr></thead><tbody id="result-body">${body}</tbody></table></div>
    <div class="row">
      <input id="tag-names" list="tag-candidates" size="40" placeholder="Marcar por nombre, separados por coma (de las fotos)">
      <datalist id="tag-candidates">${[...names].sort().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <button class="small" data-add-mark="bomb">💣 Bomb</button>
      <button class="small" data-add-mark="party">🎯 Otra party</button>
      <button class="small" data-add-mark="late">⏰ Llegó tarde</button>
      ${tags.size ? `<button class="small secondary" data-clear-tags>Limpiar marcas (${tags.size})</button>` : ""}
    </div>`;
  $("discord-step").hidden = false;
  renderDiscord();
  showSaveStep();
}

function usedText(r, withTier) {
  if (r.status === "check" && r.mounts) {
    return r.mounts.length ? "montura " + r.mounts.map((m) => items[m.base] || m.base).join(", ") : "sin montura de batalla";
  }
  return (r.used || []).map((w) => weaponName(w) + (withTier ? ` ${[...w.types].map(tierOf).join("/")}` : "")).join(", ");
}

function slotText() {
  const date = $("save-date").value, hour = $("save-hour").value.trim();
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}${hour ? ` ${hour} UTC` : ""}` : "";
}

// Section titles of the Discord message, in the order they are posted.
const MESSAGE_SECTIONS = [
  ["wrong", "❌ Usaron otra arma"],
  ["absent", "👻 Se anotaron y no fueron"],
  ["skip", "🚫 Conectados que no fueron", "🚫 Conectados sin anotarse"],
  ["check", "⚠️ Revisar"], ["noeq", "⚠️ Sin equipo visible"], ["unmapped", "❓ Arma sin mapear"],
  ["voice", "🎧 En el canal sin anotarse"],
  ["pending", "⏳ Anotados (sin killboard)"],
  ["late", "⏰ Llegaron tarde"],
  ["unsigned", "👀 Fueron sin anotarse"],
  ["bomb", "💣 Bombs"], ["party", "🎯 En otra party"],
  ["ok", "✅ Correctos"],
];

function discordMessage() {
  const { title, battles: fetched, guild, provisional } = lastResult;
  const { list, voice } = playerList();
  const withTier = $("opt-tier").checked;
  const skipSection = new Set();
  if (!$("opt-ok").checked) skipSection.add("ok");
  if (!$("opt-extra").checked) skipSection.add("unsigned");
  if (!$("opt-skip").checked) skipSection.add("skip");
  // The status already says it; keep only what adds to it.
  const redundant = { absent: ["👻"], skip: ["🚫"], voice: ["🎧"], unsigned: ["👀"], bomb: ["💣"], party: ["🎯"], late: ["⏰"], wrong: [] };

  const out = [];
  out.push(`## 📋 ${[title || "CTA", slotText(), guild.Name].filter(Boolean).join(" · ")}`);
  out.push(provisional ? "> ⏳ **Pre-registro**: todavía sin killboard." : `> Killboard${fetched.length > 1 ? "s" : ""}: ${fetched.map((b) => `\`${b.id}\``).join(", ")}`);
  const counts = {};
  for (const p of list) counts[p.status] = (counts[p.status] || 0) + 1;
  const signed = list.filter((p) => p.row).length;
  out.push([`📝 Anotados **${signed}**`, voice.size ? `🎧 En el canal **${voice.size}**` : "",
    ...ORDER.filter((s) => counts[s]).map((s) => `${STATUS[s].icon} ${STATUS[s].label} **${counts[s]}**`)].filter(Boolean).join("  ·  "));

  for (const [status, heading, provisionalHeading] of MESSAGE_SECTIONS) {
    if (skipSection.has(status)) continue;
    const group = sortedList(list.filter((p) => p.status === status));
    if (!group.length) continue;
    out.push("", `### ${(provisional && provisionalHeading) || heading} (${group.length})`);
    const extra = (p) => p.obs.filter((x) => !(redundant[status] || []).includes(x.icon));
    // Long lists of people without a signed-up slot: names with their icons only.
    if (group.every((p) => !p.row) && (group.length > 15 || group.every((p) => !extra(p).length))) {
      out.push(...nameLines(group.map((p) => p.name + extra(p).map((x) => ` ${x.icon}`).join(""))));
      continue;
    }
    for (const p of group) {
      const r = p.row;
      const who = r ? `\`${String(r.pos).padStart(2, "0")}\` ${r.weapon} · **${p.name}**` : `**${p.name}**`;
      let notes = p.obs.filter((x) => !(redundant[status] || []).includes(x.icon)).map((x) => `${x.icon} ${x.text}`);
      if (status === "wrong") notes = [`usó **${usedText(r, withTier)}**`, ...notes.filter((n) => !n.startsWith("❌"))];
      if (status === "unsigned" && p.fought) notes.unshift([...p.fought.weapons.values()].map((w) => weaponName(w) + (withTier ? ` ${[...w.types].map(tierOf).join("/")}` : "")).join(", ") || "sin equipo visible");
      out.push(`- ${who}${notes.length ? ` — ${notes.join(" · ")}` : ""}`);
    }
  }
  return out;
}

// Short lists as bullets; long ones as comma-separated lines, so the message
// does not run over several Discord posts.
function nameLines(names) {
  if (names.length <= 15) return names.map((n) => `- ${n}`);
  const lines = [];
  for (let i = 0; i < names.length; i += 12) lines.push(names.slice(i, i + 12).join(", "));
  return lines;
}

// Discord rejects messages over 2,000 characters: split on whole lines.
function chunks(lines, limit = 1900) {
  const parts = [];
  let current = "";
  for (const l of lines) {
    if (current && current.length + l.length + 1 > limit) { parts.push(current); current = ""; }
    current += (current ? "\n" : "") + l;
  }
  if (current) parts.push(current);
  return parts;
}

function renderDiscord() {
  if (!lastResult) return;
  const parts = chunks(discordMessage());
  $("discord").innerHTML = parts.map((p, i) => `<div class="chunk">
    <div class="row"><b>Mensaje ${i + 1} de ${parts.length}</b> <span class="muted">${p.length} caracteres</span>
    <button class="small" data-copy="${i}">Copiar</button></div>
    <textarea rows="${Math.min(24, p.split("\n").length + 1)}" id="chunk-${i}">${esc(p)}</textarea></div>`).join("");
}

// ---------- configuration tabs ----------

function idsFromInput(text) {
  const byName = new Map(Object.entries(items).map(([id, name]) => [norm(name), id]));
  return text.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    if (s.startsWith("@")) return s;
    const id = s.toUpperCase().replace(/^T\d_/, "").replace(/@\d+$/, "");
    return items[id] ? id : byName.get(norm(s)) || id;
  });
}

function renderWeapons() {
  const table = weaponTable();
  $("weapons-table").innerHTML = `<thead><tr><th>En el bot</th><th>Armas del juego</th><th></th></tr></thead><tbody>` +
    Object.values(table).sort((a, b) => a.label.localeCompare(b.label)).map((w) => `<tr>
      <td>${esc(w.label)}</td>
      <td><input data-alias="${esc(w.label)}" list="item-names" size="50" value="${esc(w.ids.map((id) => (id.startsWith("@") ? id : items[id] || id)).join(", "))}"></td>
      <td><button class="small secondary" data-remove="${esc(w.label)}">Quitar</button></td></tr>`).join("") + "</tbody>";
}

function renderPlayers() {
  $("players-table").innerHTML = `<thead><tr><th>Discord</th><th>En el juego</th><th></th></tr></thead><tbody>` +
    Object.entries(config.players).sort().map(([d, g]) => `<tr><td>${esc(d)}</td><td>${esc(g)}</td>
      <td><button class="small secondary" data-unplayer="${esc(d)}">Quitar</button></td></tr>`).join("") + "</tbody>";
}

async function setWeapon(label, ids) {
  for (const k of Object.keys(config.weapons)) if (norm(k) === norm(label)) delete config.weapons[k];
  config.weapons[label] = ids;
  await saveConfig();
  renderWeapons();
  showListSummary();
}

// ---------- wiring ----------

function bind() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== `tab-${b.dataset.tab}`));
  }));
  $("list").addEventListener("input", showListSummary);
  $("members").addEventListener("input", showMembersSummary);
  $("voice").addEventListener("input", showVoiceSummary);
  $("load-battles").addEventListener("click", () => loadBattles(false));
  $("more-battles").addEventListener("click", () => loadBattles(true));
  $("analyze").addEventListener("click", analyze);
  $("guild").addEventListener("change", async () => {
    guildInfo = null; battles = []; selected.clear(); $("battles").innerHTML = "";
    config.guild = $("guild").value.trim(); await saveConfig();
    loadBattles(false);
  });
  $("region").addEventListener("change", async () => {
    guildInfo = null; battles = []; selected.clear(); $("battles").innerHTML = "";
    config.region = $("region").value; await saveConfig();
    loadBattles(false);
  });
  ["min-players", "min-guild"].forEach((id) => $(id).addEventListener("input", () => {
    try { localStorage.setItem(`cta-${id}`, $(id).value); } catch {}
    if (guildInfo) renderBattles();
  }));
  ["opt-ok", "opt-extra", "opt-skip", "opt-tier"].forEach((id) => $(id).addEventListener("change", renderDiscord));

  $("battles").addEventListener("click", (e) => {
    const row = e.target.closest("tr.battle");
    if (!row) return;
    const id = row.dataset.id;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderBattles();
  });

  $("results").addEventListener("change", (e) => {
    if (e.target.id === "res-sort") { renderResults(); return; }
    const filter = e.target.dataset.filter;
    if (!filter) return;
    const hidden = new Set(lastResult.hiddenStatus || []);
    if (e.target.checked) hidden.delete(filter); else hidden.add(filter);
    lastResult.hiddenStatus = [...hidden];
    document.querySelectorAll(`#result-body tr[data-status="${filter}"]`).forEach((tr) => (tr.hidden = !e.target.checked));
  });
  $("results").addEventListener("click", async (e) => {
    const markBtn = e.target.closest("[data-mark]");
    if (markBtn) { toggleMark(markBtn.dataset.name, markBtn.dataset.mark); renderResults(); return; }
    const addBtn = e.target.closest("[data-add-mark]");
    if (addBtn) {
      for (const name of $("tag-names").value.split(/[,;\n]+/).map((n) => n.trim().replace(/^@/, "")).filter(Boolean)) {
        toggleMark(name, addBtn.dataset.addMark, true);
      }
      renderResults();
      return;
    }
    if (e.target.closest("[data-clear-tags]")) {
      if (await askYesNo("¿Quitar todas las marcas (bomb, otra party y llegó tarde)?")) { tags.clear(); renderResults(); }
      return;
    }
    const btn = e.target.closest("[data-confirm]");
    if (!btn) return;
    config.players[btn.dataset.confirm] = btn.dataset.name;
    await saveConfig();
    renderPlayers();
    for (const r of lastResult.rows) if (r.discord === btn.dataset.confirm && r.found) r.found.guess = false;
    renderResults();
  });
  $("discord").addEventListener("click", async (e) => {
    const i = e.target.dataset.copy;
    if (i === undefined) return;
    const area = $(`chunk-${i}`);
    try { await navigator.clipboard.writeText(area.value); } catch { area.select(); document.execCommand("copy"); }
    e.target.textContent = "¡Copiado!";
    setTimeout(() => (e.target.textContent = "Copiar"), 1500);
  });

  $("weapons-table").addEventListener("change", (e) => {
    const label = e.target.dataset.alias;
    if (label) setWeapon(label, idsFromInput(e.target.value));
  });
  $("weapons-table").addEventListener("click", async (e) => {
    const label = e.target.dataset.remove;
    if (!label) return;
    for (const k of Object.keys(config.weapons)) if (norm(k) === norm(label)) delete config.weapons[k];
    if (Object.keys(DEFAULT_WEAPONS).some((k) => norm(k) === norm(label))) config.weapons[label] = null;
    await saveConfig();
    renderWeapons();
    showListSummary();
  });
  $("add-alias").addEventListener("click", () => {
    const label = $("new-alias").value.trim();
    const ids = idsFromInput($("new-alias-items").value);
    if (!label || !ids.length) return;
    setWeapon(label, ids);
    $("new-alias").value = $("new-alias-items").value = "";
  });
  $("players-table").addEventListener("click", async (e) => {
    const d = e.target.dataset.unplayer;
    if (!d) return;
    delete config.players[d];
    await saveConfig();
    renderPlayers();
  });
  $("add-player").addEventListener("click", async () => {
    const d = $("new-discord").value.trim().replace(/^@/, "");
    const g = $("new-ingame").value.trim();
    if (!d || !g) return;
    config.players[d] = g;
    await saveConfig();
    renderPlayers();
    $("new-discord").value = $("new-ingame").value = "";
  });
}

// A Sí / No dialog; resolves true on Sí.
function askYesNo(message) {
  const dialog = $("confirm-dialog");
  $("confirm-text").textContent = message;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true });
  });
}

async function init() {
  try { localStorage.removeItem("cta-tags"); } catch {}
  items = await (await fetch("items.json")).json();
  $("item-names").innerHTML = [...new Set(Object.values(items))].sort().map((n) => `<option value="${esc(n)}">`).join("");
  await loadConfig();
  bind();
  try {
    $("list").value = localStorage.getItem("cta-list") || "";
    $("members").value = localStorage.getItem("cta-members") || "";
    $("voice").value = localStorage.getItem("cta-voice") || "";
    for (const id of ["min-players", "min-guild"]) {
      const v = localStorage.getItem(`cta-${id}`);
      if (v !== null) $(id).value = v;
    }
  } catch {}
  showListSummary();
  showMembersSummary();
  showVoiceSummary();
  renderWeapons();
  renderPlayers();
  loadBattles(false);
}

init();
