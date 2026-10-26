"use strict";

// Attendance history: every checked CTA is saved, by hand, under its UTC date
// and hour, with one record per player (signed up or not, went or not, weapon
// used). The guild roster is pasted daily so players who left stop counting.
// Stored in cta-checker-attHistory.json beside the program; the server keeps a
// timestamped copy before every save.

const CTA_HOURS = [22, 0, 2, 4];

let attHistory = { ctas: [], members: {} };

async function loadHistory() {
  try {
    const data = await (await fetch("/api/history")).json();
    attHistory = { ...data, ctas: data.ctas || [], members: data.members || {} };
  } catch {
    attHistory = { ctas: [], members: {} };
  }
}

async function saveHistory() {
  const resp = await fetch("/api/history", { method: "POST", body: JSON.stringify(attHistory) });
  if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`);
}

const ctaKey = (c) => `${c.date}T${c.hour}`;
const isoDate = (d) => d.toISOString().slice(0, 10);
const shortDate = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

function normHour(text) {
  const m = String(text || "").trim().match(/^(\d{1,2})(?::?(\d{2}))?/);
  if (!m || Number(m[1]) > 23) return null;
  return `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
}

// ---------- saving a checked CTA ----------

// Suggests the CTA hour closest to the first battle's start, and the UTC date
// that puts that hour nearest to it (a 00:00 CTA fought from 23:58 belongs to
// the next day).
function suggestSlot(start) {
  let best = null;
  for (const hour of CTA_HOURS) {
    for (const shift of [-1, 0, 1]) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + shift, hour));
      const dist = Math.abs(d - start);
      if (!best || dist < best.dist) best = { d, dist };
    }
  }
  if (best.dist > 90 * 60000) best = { d: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), start.getUTCHours())) };
  return { date: isoDate(best.d), hour: `${String(best.d.getUTCHours()).padStart(2, "0")}:00` };
}

// Results re-render on every bomb / party mark: suggest the slot once per
// check so a date or hour typed by hand is kept.
function showSaveStep() {
  $("save-step").hidden = false;
  if (lastResult.slotSuggested) return;
  lastResult.slotSuggested = true;
  $("save-status").textContent = "";
  const starts = lastResult.battles.map((b) => new Date(b.startTime));
  const slot = suggestSlot(starts.length ? new Date(Math.min(...starts)) : new Date());
  $("save-date").value = slot.date;
  $("save-hour").value = slot.hour;
  renderDiscord();
}

// One record per listed player (see playerList). attended is null when it is
// unknown (a pre-registration, or only seen in the Discord channel): such
// entries are kept but left out of attendance rates.
function buildCtaRecord(date, hour) {
  const { title, battles: battleList, guild, provisional } = lastResult;
  const { list, voice } = playerList();
  const typesOf = (weapons) => [...(weapons || [])].sort((a, b) => b.count - a.count).map((w) => [...w.types][0]);
  const players = list.map((p) => {
    const r = p.row, mark = markOf(p.name);
    return {
      name: p.name, discord: r?.discord, pos: r?.pos, party: r?.party, signedWeapon: r?.weapon,
      signed: !!r, attended: p.attended, status: p.status,
      used: typesOf(r?.used || (p.fought ? p.fought.weapons.values() : [])),
      online: p.member ? !!p.member.online : undefined,
      voice: voice.size ? p.inVoice : undefined,
      late: mark.late || undefined,
      skip: p.attended === false ? (p.skip?.when || (p.status === "skip" ? "online" : null)) : null,
      obs: p.obs.map((x) => `${x.icon} ${x.text}`),
    };
  });
  return {
    date, hour, title, guild: guild.Name, provisional: !!provisional,
    battles: battleList.map((b) => ({ id: b.id, start: b.startTime, end: b.endTime })),
    savedAt: new Date().toISOString(), players,
  };
}

async function saveCta() {
  const date = $("save-date").value;
  const hour = normHour($("save-hour").value);
  if (!date || !hour) { $("save-status").innerHTML = `<span class="error">Pon la fecha y la hora UTC.</span>`; return; }
  if (lastResult.provisional && !(await askYesNo(
    "Estás registrando sin el killboard. Se guardará como pre-registro (⏳): quién se anotó, quién estaba conectado y las bombs. " +
    "Cuando aparezca el killboard, revisa de nuevo y regístralo con la misma fecha y hora para reemplazarlo. ¿Estás seguro?"))) {
    $("save-status").textContent = "No se registró.";
    return;
  }
  const record = buildCtaRecord(date, hour);
  const existing = attHistory.ctas.findIndex((c) => ctaKey(c) === ctaKey(record));
  if (existing >= 0) {
    const old = attHistory.ctas[existing];
    const what = old.provisional ? "un pre-registro" : "una CTA";
    if (!(await askYesNo(`Ya hay ${what} guardado el ${shortDate(date)} a las ${hour} UTC. ¿Reemplazarlo con esta revisión?`))) {
      $("save-status").textContent = "No se registró.";
      return;
    }
    attHistory.ctas.splice(existing, 1);
  }
  attHistory.ctas.push(record);
  attHistory.ctas.sort((a, b) => ctaKey(a).localeCompare(ctaKey(b)));
  try {
    await saveHistory();
    const went = record.players.filter((p) => p.attended).length;
    $("save-status").textContent = record.provisional
      ? `Pre-registro guardado: ${shortDate(date)} ${hour} UTC.`
      : `Registrada: ${shortDate(date)} ${hour} UTC · ${went} fueron.`;
  } catch (err) {
    $("save-status").innerHTML = `<span class="error">No se pudo guardar: ${esc(err.message)}</span>`;
  }
}

// ---------- roster ----------

function rosterSummary() {
  const all = Object.values(attHistory.members);
  const current = all.filter((m) => !m.left);
  return { all, current };
}

async function updateRoster() {
  const parsed = parseMembers($("roster-input").value);
  const date = $("roster-date").value || isoDate(new Date());
  if (!parsed.length) { $("roster-status").innerHTML = `<span class="error">No reconocí ninguna línea de la lista.</span>`; return; }
  const inList = new Set(parsed.map((m) => norm(m.name)));
  const joined = [], left = [];
  for (const m of parsed) {
    const key = norm(m.name);
    const known = attHistory.members[key];
    if (!known || known.left) joined.push(m.name);
    attHistory.members[key] = { ...(known || { firstSeen: date }), name: m.name, roles: m.roles, lastSeen: date, left: false };
  }
  for (const [key, m] of Object.entries(attHistory.members)) {
    if (!inList.has(key) && !m.left) { m.left = true; m.leftOn = date; left.push(m.name); }
  }
  attHistory.rosterDate = date;
  try {
    await saveHistory();
    $("roster-status").textContent = `${parsed.length} miembros al ${shortDate(date)}.`;
    $("roster-info").innerHTML =
      (joined.length ? `<p><b>Nuevos (${joined.length}):</b> ${joined.map(esc).join(", ")}</p>` : "") +
      (left.length ? `<p><b>Ya no están (${left.length}):</b> ${left.map(esc).join(", ")}</p>` : "");
    renderAttendance();
  } catch (err) {
    $("roster-status").innerHTML = `<span class="error">No se pudo guardar: ${esc(err.message)}</span>`;
  }
}

// ---------- statistics ----------

function filteredCtas() {
  const from = $("att-from").value, to = $("att-to").value, hour = $("att-hour").value;
  return attHistory.ctas.filter((c) => (!from || c.date >= from) && (!to || c.date <= to) && (!hour || c.hour === hour));
}

// A player counts for the CTAs from the day they first show up (in a roster
// or in a CTA) until the last roster that still listed them, if they left.
function playerStats(ctas) {
  const players = new Map();
  const get = (name) => {
    const key = norm(name);
    if (!players.has(key)) players.set(key, { key, name, cells: new Map(), first: null });
    return players.get(key);
  };
  for (const c of attHistory.ctas) {
    for (const e of c.players) {
      const p = get(e.name);
      if (!p.first || c.date < p.first) p.first = c.date;
    }
  }
  for (const [key, m] of Object.entries(attHistory.members)) {
    const p = players.get(key) || get(m.name);
    p.name = m.name;
    p.member = m;
    if (!p.first || m.firstSeen < p.first) p.first = m.firstSeen;
  }
  for (const c of ctas) for (const e of c.players) get(e.name).cells.set(ctaKey(c), e);

  for (const p of players.values()) {
    const eligible = ctas.filter((c) => c.date >= p.first && !(p.member?.left && c.date > p.member.lastSeen) &&
      p.cells.get(ctaKey(c))?.attended !== null);
    p.eligible = new Set(eligible.map(ctaKey));
    const entries = eligible.map((c) => p.cells.get(ctaKey(c))).filter(Boolean);
    p.total = eligible.length;
    p.attended = entries.filter((e) => e.attended).length;
    p.signed = entries.filter((e) => e.signed).length;
    p.noshow = entries.filter((e) => e.signed && !e.attended).length;
    p.wrong = entries.filter((e) => e.signed && e.attended && e.status === "wrong").length;
    p.unsigned = entries.filter((e) => !e.signed && e.attended && e.status === "unsigned").length;
    p.bombs = entries.filter((e) => e.status === "bomb" || e.status === "party").length;
    p.late = entries.filter((e) => e.late && e.attended).length;
    p.skips = entries.filter((e) => e.skip && !e.attended).length;
    p.rate = p.total ? p.attended / p.total : 0;
    const weapons = new Map();
    for (const e of entries) if (e.attended && e.used?.[0]) {
      const base = baseOf(e.used[0]);
      weapons.set(base, { type: e.used[0], count: (weapons.get(base)?.count || 0) + 1 });
    }
    p.mainWeapon = [...weapons.values()].sort((a, b) => b.count - a.count)[0] || null;
  }
  return [...players.values()];
}

// ---------- rendering ----------

function cellHtml(c, p) {
  const key = ctaKey(c);
  const e = p.cells.get(key);
  // Unknown attendance is left out of the counts, so check it before eligibility.
  const notes = e?.obs?.length ? `\n${e.obs.join("\n")}` : "";
  if (e?.attended === null) {
    if (!e.signed) return `<td><span class="cell c-pending" title="${esc(`En el canal de Discord sin anotarse${notes}`)}">🎧</span></td>`;
    return `<td><span class="cell c-pending" title="${esc(`Anotado como ${e.signedWeapon} (#${e.pos}) · pre-registro sin killboard${e.online ? " · estaba online" : ""}${e.voice === true ? " · en el canal" : e.voice === false ? " · no estaba en el canal" : ""}${notes}`)}">⏳</span></td>`;
  }
  if (!p.eligible.has(key)) return `<td></td>`;
  if (!e) return `<td class="muted" title="No se anotó y no fue">·</td>`;
  const skip = e.skip ? ` · ${SKIP_LABEL[e.skip]}` : "";
  if (!e.attended) {
    return e.signed
      ? `<td><span class="cell c-noshow" title="${esc(`Anotado como ${e.signedWeapon} (#${e.pos}) y no fue${skip}${notes}`)}">✗</span></td>`
      : `<td><span class="cell c-skip" title="${esc(`No se anotó y no fue${skip}${notes}`)}">🚫</span></td>`;
  }
  const type = e.used?.[0];
  const used = (e.used || []).map((t) => `${items[baseOf(t)] || baseOf(t)} ${tierOf(t)}`).join(", ") || "sin equipo visible";
  const tag = ["bomb", "party", "late"].includes(e.status) ? STATUS[e.status] : null;
  const what = tag ? `${tag.icon} ${tag.label}` + (e.signed ? ` · anotado: ${e.signedWeapon} (#${e.pos})` : "")
    : e.signed ? `Anotado: ${e.signedWeapon} (#${e.pos}) · ${STATUS[e.status]?.label || e.status}` : "Fue sin anotarse";
  const cls = (tag ? `c-${e.status}` : e.signed ? `c-${e.status}` : "c-unsigned") + (e.late ? " late" : "");
  const icon = type ? `<img src="https://render.albiononline.com/v1/item/${encodeURIComponent(type)}.png?size=40" loading="lazy" alt="">` : tag ? tag.icon : "?";
  return `<td><span class="cell ${cls}" title="${esc(`${what} · Usó: ${used}${notes}`)}">${icon}</span></td>`;
}

function renderAttendance() {
  const ctas = filteredCtas();
  const { current } = rosterSummary();
  const onlyMembers = $("att-members").checked && current.length > 0;
  const search = norm($("att-search").value);
  let players = playerStats(ctas).filter((p) => (!onlyMembers || (p.member && !p.member.left)) && (!search || p.key.includes(search)));
  players = players.filter((p) => p.total > 0 || p.member);
  const sort = $("att-sort").value;
  const by = {
    rate: (a, b) => b.rate - a.rate || b.attended - a.attended,
    attended: (a, b) => b.attended - a.attended,
    noshow: (a, b) => b.noshow - a.noshow,
    wrong: (a, b) => b.wrong - a.wrong,
    unsigned: (a, b) => b.unsigned - a.unsigned,
    name: () => 0,
  }[sort];
  players.sort((a, b) => by(a, b) || a.name.localeCompare(b.name));

  const sum = (f) => players.reduce((n, p) => n + p[f], 0);
  const slots = sum("total");
  const perCta = ctas.map((c) => c.players.filter((e) => e.attended).length);
  $("att-summary").innerHTML = ctas.length ? [
    `CTAs: <span>${ctas.length}</span>`,
    `Asistencia global: <span>${slots ? Math.round((sum("attended") / slots) * 100) : 0}%</span>`,
    `Promedio por CTA: <span>${Math.round(perCta.reduce((a, b) => a + b, 0) / ctas.length)}</span> jugadores`,
    `❌ Arma equivocada: <span>${sum("wrong")}</span>`,
    `✗ Anotó y no fue: <span>${sum("noshow")}</span>`,
    `👀 Fue sin anotarse: <span>${sum("unsigned")}</span>`,
    `💣 Bomb / otra party: <span>${sum("bombs")}</span>`,
    `⏰ Llegaron tarde: <span>${sum("late")}</span>`,
    `Jugadores: <span>${players.length}</span>`,
  ].map((t) => `<div>${t}</div>`).join("") : `<p class="muted">Todavía no hay CTAs guardadas en este rango. Revisa una CTA y usa «Guardar CTA».</p>`;

  $("att-legend").innerHTML = [
    ["c-ok", "Arma correcta"], ["c-wrong", "Otra arma"], ["c-noeq", "Sin equipo visible / revisar"],
    ["c-unsigned", "Fue sin anotarse"], ["c-bomb", "Bomb / otra party"], ["c-late", "Llegó tarde", "⏰"], ["c-noshow", "Anotó y no fue", "✗"],
    ["c-skip", "Conectado y no fue", "🚫"], ["c-pending", "Pre-registro (sin killboard)", "⏳"],
  ].map(([cls, label, mark]) => `<span class="legend-item"><span class="cell ${cls}">${mark || ""}</span>${label}</span>`).join("") +
    `<span class="legend-item">· no se anotó ni fue</span><span class="legend-item">vacío: aún no era del gremio</span>`;

  const head = `<thead><tr>
    <th class="sticky">Jugador</th><th>Asistencia</th><th>Fue</th><th>Anotó</th><th>Anotó y no fue</th>
    <th>Arma equivocada</th><th>Sin anotarse</th><th>Bomb / otra party</th><th>Tarde</th><th>Skips</th><th>Arma principal</th>
    ${ctas.map((c, i) => `<th class="cta" title="${esc((c.title || "") + (c.provisional ? " · pre-registro sin killboard" : ""))}">${c.provisional ? "⏳ " : ""}${shortDate(c.date)}<br>${c.hour}<br>👥 ${perCta[i]}</th>`).join("")}
  </tr></thead>`;
  const body = players.map((p) => {
    const pct = Math.round(p.rate * 100);
    const main = p.mainWeapon ? `<span class="weapon"><img src="https://render.albiononline.com/v1/item/${encodeURIComponent(p.mainWeapon.type)}.png?size=40" loading="lazy" alt="">${esc(items[baseOf(p.mainWeapon.type)] || baseOf(p.mainWeapon.type))}</span>` : "";
    const roles = p.member?.roles?.length ? ` <span class="muted">${esc(p.member.roles.join(", "))}</span>` : "";
    return `<tr class="${p.member?.left ? "left" : ""}">
      <td class="sticky">${esc(p.name)}${p.member?.left ? ' <span class="muted">(salió)</span>' : ""}${roles}</td>
      <td class="n"><span class="rate">${pct}%</span><span class="bar"><i style="width:${pct}%"></i></span></td>
      <td class="n">${p.attended}/${p.total}</td><td class="n">${p.signed}</td>
      <td class="n">${p.noshow || ""}</td><td class="n">${p.wrong || ""}</td>
      <td class="n">${p.unsigned || ""}</td><td class="n">${p.bombs || ""}</td><td class="n">${p.late || ""}</td><td class="n">${p.skips || ""}</td><td>${main}</td>
      ${ctas.map((c) => cellHtml(c, p)).join("")}</tr>`;
  }).join("");
  $("att-table").innerHTML = head + `<tbody>${body}</tbody>`;

  renderCtaList();
  const date = attHistory.rosterDate;
  if (!$("roster-status").textContent) {
    $("roster-status").textContent = current.length ? `${current.length} miembros actuales (lista del ${shortDate(date)}).` : "Aún no hay lista de miembros.";
  }
}

function renderCtaList() {
  const rows = [...attHistory.ctas].reverse().map((c) => {
    const count = (f) => c.players.filter(f).length;
    return `<tr>
      <td>${shortDate(c.date)}/${c.date.slice(0, 4)}</td><td>${c.hour} UTC</td><td>${esc(c.title || "")}</td>
      <td>${c.provisional ? "⏳ Pre-registro" : "Completa"}</td>
      <td class="muted">${c.battles.map((b) => b.id).join(", ")}</td>
      <td class="n">${count((e) => e.signed)}</td><td class="n">${count((e) => e.attended)}</td>
      <td class="n">${count((e) => e.status === "wrong")}</td><td class="n">${count((e) => e.signed && e.attended === false)}</td>
      <td class="n">${count((e) => !e.signed && e.attended && e.status === "unsigned")}</td>
      <td class="n">${count((e) => e.status === "bomb" || e.status === "party")}</td><td class="n">${count((e) => e.skip && e.attended === false)}</td>
      <td><button class="small secondary" data-delete-cta="${esc(ctaKey(c))}">Eliminar</button></td></tr>`;
  }).join("");
  $("att-ctas").innerHTML = attHistory.ctas.length ? `<table><thead><tr>
    <th>Fecha</th><th>Hora</th><th>CTA</th><th>Tipo</th><th>Killboards</th><th>Anotados</th><th>Fueron</th>
    <th>Arma equivocada</th><th>Anotó y no fue</th><th>Sin anotarse</th><th>Bomb / otra party</th><th>Conectados que no fueron</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">Ninguna todavía.</p>`;
}

function exportCsv() {
  const ctas = filteredCtas();
  const players = playerStats(ctas).filter((p) => p.total > 0);
  const code = (c, p) => {
    if (!p.eligible.has(ctaKey(c))) return "";
    const e = p.cells.get(ctaKey(c));
    if (!e) return "";
    if (e.attended === null) return "pre-registro";
    if (!e.attended) return e.signed ? "anotó y no fue" : "conectado y no fue";
    if (["bomb", "party", "late"].includes(e.status)) return STATUS[e.status].label;
    const weapon = e.used?.[0] ? items[baseOf(e.used[0])] || baseOf(e.used[0]) : "?";
    return e.signed ? `${weapon}${e.status === "wrong" ? " (otra arma)" : ""}` : `${weapon} (sin anotarse)`;
  };
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Jugador", "Asistencia %", "Fue", "CTAs", "Anotó", "Anotó y no fue", "Arma equivocada", "Sin anotarse", "Bomb / otra party", "Tarde", "Skips",
    ...ctas.map((c) => `${c.date} ${c.hour}`)].map(q).join(";")];
  for (const p of players) {
    lines.push([p.name, Math.round(p.rate * 100), p.attended, p.total, p.signed, p.noshow, p.wrong, p.unsigned, p.bombs, p.late, p.skips,
      ...ctas.map((c) => code(c, p))].map(q).join(";"));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `asistencia-${isoDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- wiring ----------

function bindHistory() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelector("main").classList.toggle("wide", b.dataset.tab === "attendance");
    if (b.dataset.tab === "attendance") renderAttendance();
  }));
  $("save-cta").addEventListener("click", saveCta);
  $("skip-save").addEventListener("click", () => { $("save-status").textContent = "No se registró."; });
  ["save-date", "save-hour"].forEach((id) => $(id).addEventListener("input", renderDiscord));
  $("roster-save").addEventListener("click", updateRoster);
  $("att-csv").addEventListener("click", exportCsv);
  ["att-from", "att-to", "att-hour", "att-members", "att-sort"].forEach((id) => $(id).addEventListener("change", renderAttendance));
  $("att-search").addEventListener("input", renderAttendance);
  $("att-ctas").addEventListener("click", async (e) => {
    const key = e.target.dataset.deleteCta;
    if (!key) return;
    const c = attHistory.ctas.find((x) => ctaKey(x) === key);
    if (!c || !(await askYesNo(`¿Eliminar del historial la CTA del ${shortDate(c.date)} a las ${c.hour} UTC?`))) return;
    attHistory.ctas = attHistory.ctas.filter((x) => ctaKey(x) !== key);
    await saveHistory();
    renderAttendance();
  });
}

(async () => {
  await loadHistory();
  $("roster-date").value = isoDate(new Date());
  bindHistory();
})();
