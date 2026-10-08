// Adaptateur générique du direct (audit live 2D, 2026-10-07) : transforme un
// direct tel que le serveur le livre (`live` : events horodatés `airAt`,
// pauses, boxScoreA/B pour les cinq de départ, isHome) en l'état attendu par
// live-view.js / court2d.js (voir README.md), SANS dépendre de « mon club »,
// de `league.teams` ni de `currentMatch`. Contrat d'entrée :
//
//   createLiveAdapter({
//     live,                       // payload du serveur (viewLiveMatchForTeam, /api/spectate, /api/national/live, /api/replay)
//     teams: { A: {...}, B: {...} }, // dans le repère A/B du payload : { name, short, color, logo, sponsor, players: [{ id, name, pos, avatar, link }] , tactics }
//     mine: "A" | null,           // l'équipe du spectateur (feuille de match ouverte dessus), null si simple spectateur
//     quarterLength, overtimeLength,
//     dress: { courtLogo, arenaSponsor, courtStyle, meta },
//     presenter: { name, avatar } | null,
//   })
//   .applyEvent(ev) / .applyPause(pause) / .finish() / .tick(now) / .buildState(now) / .reset()
//
// Côté terrain, les joueurs sont identifiés « clé:#id » (clé = A/B du
// payload), même repère que les acteurs des événements. La feuille de match
// est alimentée par les deltas du moteur (`ev.delta`) ; un direct plus ancien
// (sans delta) retombe sur un comptage minimal par événement.
//
// Utilisé par le mode « spectateur » (matchs des autres clubs, sélections
// nationales, rediffusions des autres). Le direct de son propre club garde
// pour l'instant l'adaptateur historique de moteurbasket3.html (hmLive*),
// qui produit le même contrat.

const SPOT_GEOM = {
  ra: { d: [0.5, 4], a: [-80, 80] }, paint: { d: [4.5, 9.5], a: [-60, 60] },
  mbl: { d: [10, 18], a: [-88, -62] }, mwl: { d: [12, 20], a: [-58, -22] }, mtop: { d: [14, 21], a: [-20, 20] }, mwr: { d: [12, 20], a: [22, 58] }, mbr: { d: [10, 18], a: [62, 88] },
  c3l: { corner: -1 }, w3l: { d: [24, 26.5], a: [-58, -24] }, t3: { d: [24.5, 27], a: [-22, 22] }, w3r: { d: [24, 26.5], a: [24, 58] }, c3r: { corner: 1 },
};
function seededRandom(seed) {
  let t = (seed >>> 0) || 1;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
export function shotPoint(zone, teamIdx, seed, spot) {
  const rnd = seededRandom(Math.round(seed || 1));
  const r = (a, b) => a + rnd() * (b - a);
  let x, y;
  const g = spot && SPOT_GEOM[spot];
  if (g) {
    if (g.corner) { x = r(1, 11); y = g.corner < 0 ? r(1, 3) : 50 - r(1, 3); }
    else { const d = r(g.d[0], g.d[1]), a = r(g.a[0], g.a[1]) * Math.PI / 180; x = Math.max(1, 5.25 + d * Math.cos(a)); y = 25 + d * Math.sin(a); }
  } else {
    let d, a;
    if (zone === "paint") { d = r(0.5, 8); a = r(-80, 80); }
    else if (zone === "mid") { d = r(9, 21); a = r(-78, 78); }
    else if (rnd() < 0.25) { x = r(1, 13); y = rnd() < 0.5 ? r(0.8, 2.6) : 50 - r(0.8, 2.6); }
    else { d = r(24, 27.5); a = r(-66, 66); }
    if (x === undefined) { a *= Math.PI / 180; x = Math.max(1, 5.25 + d * Math.cos(a)); y = 25 + d * Math.sin(a); }
  }
  return { x: teamIdx === 0 ? 94 - x : x, y: Math.max(0.8, Math.min(49.2, y)) };
}
// Équipe qui a le ballon après `ev` ("A"/"B") : ev.possessionAfter (moteur
// depuis 2026-10-07), sinon l'ancien champ `possession` (directs antérieurs).
export function possessionAfterOf(ev) {
  if (!ev) return null;
  if (ev.possessionAfter === "A" || ev.possessionAfter === "B") return ev.possessionAfter;
  return ev.type !== "rebound" && (ev.possession === "A" || ev.possession === "B") ? ev.possession : (ev.type === "rebound" && (ev.team === "A" || ev.team === "B") ? ev.team : null);
}
// SOURCE DE VÉRITÉ de la possession du direct (audit 2026-10-07) : l'équipe
// qui a le ballon juste après le dernier événement diffusé `evs[prevIdx]`,
// telle que le moteur l'a décidée. Directs antérieurs (sans
// possessionAfter) : la prochaine action du quart qui porte une possession.
export function possessionAt(evs, prevIdx) {
  const prev = evs[prevIdx];
  if (!prev) return null;
  if (prev.possessionAfter === "A" || prev.possessionAfter === "B") return prev.possessionAfter;
  for (let i = prevIdx + 1; i < evs.length; i++) { if (evs[i].quarter !== prev.quarter) break; if (evs[i].possession === "A" || evs[i].possession === "B") return evs[i].possession; }
  return possessionAfterOf(prev);
}
// Temps mort EN COURS (demande du 2026-10-07, timer du panneau supérieur) :
// la pause « timeout » de la diffusion (moteur → schedulePlayback : airAt,
// durationMs, équipe home/away) qui couvre `now`. Pas de second minuteur :
// le temps restant se lit sur cette même pause. null hors temps mort.
export function activeTimeout(pauses, now) {
  const p = (pauses || []).find(x => x && x.kind === "timeout" && now >= x.airAt && now < x.airAt + x.durationMs);
  if (!p) return null;
  return { team: p.team === "home" ? 0 : p.team === "away" ? 1 : null, remaining: Math.ceil((p.airAt + p.durationMs - now) / 1000), endsAt: p.airAt + p.durationMs };
}
// Arrêt de jeu en cours (mise en scène du live 2D, 2026-10-08) : temps mort,
// pause entre quarts-temps ou mi-temps, avec son début et sa fin réels
// (pauses de server/liveMatch.js:schedulePlayback) — c'est la durée du show,
// jamais rallongée.
export function activeStoppage(pauses, now) {
  const p = (pauses || []).find(x => x && (x.kind === "timeout" || x.kind === "quarter-break" || x.kind === "halftime") && now >= x.airAt && now < x.airAt + x.durationMs);
  if (!p) return null;
  return { kind: p.kind, team: p.team === "home" ? 0 : p.team === "away" ? 1 : null, quarter: p.quarter || null, startAt: p.airAt, endsAt: p.airAt + p.durationMs };
}
export function clockSeconds(str) {
  if (typeof str === "number") return str;
  const m = /^(\d+):(\d+)$/.exec(String(str || ""));
  return m ? (+m[1]) * 60 + (+m[2]) : 0;
}
const DELTA_FIELDS = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "fgm2", "fga2", "fgm3", "fga3", "ftm", "fta", "plusMinus"];
const emptyRow = () => ({ pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, plusMinus: 0, seconds: 0, openSince: null });

export function createLiveAdapter(opts) {
  const live = opts.live;
  const QL = opts.quarterLength || 600, OL = opts.overtimeLength || 300;
  const isHome = !!live.isHome;
  const idx = key => ((key === "A") === isHome ? 0 : 1);          // 0 = domicile (attaque à droite)
  const other = key => (key === "A" ? "B" : "A");
  const keyOf = t => ((t === 0) === isHome ? "A" : "B");
  const teams = opts.teams;
  const presenter = opts.presenter || null;

  const st = {};
  function reset() {
    st.events = []; st.shots = []; st.fouls = []; st.raw = []; st.seq = 0; st.quarter = 1; st.final = false;
    st.scoreAB = { A: 0, B: 0 }; st.clock = QL; st.shotClock = null; st.possession = null; st.lastAirAt = 0;
    st.fat = {};
    st.rows = { A: new Map(), B: new Map() }; st.starters = { A: new Set(), B: new Set() }; st.onCourt = { A: new Set(), B: new Set() };
    st.elapsed = 0; st.run = { team: null, pts: 0, said: false }; st.prevScore = [0, 0]; st.moneyQ = null; st.finalSaid = false;
    for (const key of ["A", "B"]) {
      const box = key === "A" ? live.boxScoreA : live.boxScoreB;
      for (const r of (Array.isArray(box) ? box : [])) { if (r && r.id != null) { st.rows[key].set(r.id, { ...emptyRow(), name: r.name, pos: r.startPos || r.position || "" }); if (r.starter) st.starters[key].add(r.id); } }
      for (const p of ((teams[key] && teams[key].players) || [])) if (!st.rows[key].has(p.id)) st.rows[key].set(p.id, { ...emptyRow(), name: p.name, pos: p.pos || "" });
      for (const id of st.starters[key]) { st.onCourt[key].add(id); const row = st.rows[key].get(id); if (row) row.openSince = 0; }
    }
  }
  reset();

  const elapsedAt = (quarter, clockStr) => { let before = 0; for (let q = 1; q < quarter; q++) before += q <= 4 ? QL : OL; return before + ((quarter <= 4 ? QL : OL) - clockSeconds(clockStr)); };
  const rowOf = (key, id, name) => { let r = st.rows[key].get(id); if (!r) { r = { ...emptyRow(), name: name || "#" + id, pos: "" }; st.rows[key].set(id, r); } return r; };
  const pid = (key, name, id) => (id != null ? key + ":#" + id : name ? key + ":" + name : null);
  const closeInterval = (key, id) => { const r = st.rows[key].get(id); if (r && r.openSince != null) { r.seconds += Math.max(0, st.elapsed - r.openSince); r.openSince = null; } st.onCourt[key].delete(id); };
  const openInterval = (key, id, name) => { const r = rowOf(key, id, name); r.openSince = st.elapsed; st.onCourt[key].add(id); };

  function actors(ev) {
    const foul = ev.type === "foul" || ev.type === "unsportsmanlikeFoul" || ev.type === "technicalFoul";
    const offKey = ev.type === "rebound" ? (ev.offensive ? ev.team : other(ev.team)) : foul ? other(ev.team) : ev.team;
    const defKey = other(offKey);
    return {
      shooter: pid(offKey, ev.shooter, ev.shooterId), assister: pid(offKey, ev.assister, ev.assisterId), rebounder: pid(ev.team, ev.rebounder, ev.rebounderId),
      defender: pid(defKey, ev.defender, ev.defenderId), blocker: pid(defKey, ev.blocker, ev.blockerId), stealer: pid(defKey, ev.stealer, ev.stealerId),
      player: pid(ev.type === "foul" ? other(ev.team) : ev.team, ev.player, ev.playerId), replacement: pid(ev.team, ev.replacement, ev.replacementId),
      handler: pid(offKey, ev.handler, ev.handlerId), creator: pid(offKey, ev.creator, ev.creatorId),
    };
  }
  function facts(ev) {
    if (ev.team !== "A" && ev.team !== "B") return {};
    const foul = ev.type === "foul" || ev.type === "unsportsmanlikeFoul" || ev.type === "technicalFoul";
    const offKey = ev.type === "rebound" ? (ev.offensive ? ev.team : other(ev.team)) : foul ? other(ev.team) : ev.team;
    const passes = [];
    for (const id of [pid(offKey, ev.handler, ev.handlerId), pid(offKey, ev.creator, ev.creatorId), pid(offKey, ev.shooter, ev.shooterId)]) if (id && passes[passes.length - 1] !== id) passes.push(id);
    return { passes: passes.length ? passes : undefined, shotType: ev.shotType || undefined, quality: ev.quality || undefined, situation: ev.situation || undefined,
      possLen: typeof ev.possLen === "number" ? ev.possLen : undefined, spot: ev.spot || undefined, tovType: ev.tovType || undefined, foulType: ev.foulType || undefined };
  }
  function shotOf(ev, t) {
    const zone = ev.zone === "inside" ? "paint" : ev.zone;
    if (!(ev.team === "A" || ev.team === "B") || !zone) return null;
    let sIdx = null;
    if (ev.type === "shot" && ev.made) sIdx = t;
    else if (ev.type === "shot" && !ev.made && !ev.blocked && ev.defender) sIdx = t;
    else if (ev.type === "rebound") sIdx = ev.offensive ? t : 1 - t;
    if (sIdx === null) return null;
    return { team: sIdx, zone, ...shotPoint(zone, sIdx, Math.round(ev.airAt || st.seq), ev.spot) };
  }
  const TYPE = { shot: ev => (ev.made ? "made" : "miss"), rebound: () => "miss", freeThrow: () => "ft", foul: () => "foul", technicalFoul: () => "foul", unsportsmanlikeFoul: () => "foul", foulOut: () => "foul", technicalEjection: () => "foul", turnover: () => "turnover", substitution: () => "sub", shortHanded: () => "sub", injury: () => "injury", quarterStart: () => "period", quarterEnd: () => "period" };

  function applyStats(ev) {
    if (ev.fat && typeof ev.fat === "object") Object.assign(st.fat, ev.fat);
    if (ev.delta && typeof ev.delta === "object") {
      for (const key of ["A", "B"]) { const per = ev.delta[key]; if (!per) continue; for (const id in per) { const row = rowOf(key, Number(id)); for (const f of DELTA_FIELDS) if (typeof per[id][f] === "number") row[f] += per[id][f]; } }
      return;
    }
    // Direct sans delta (ancien) : comptage minimal.
    const t = ev.team; if (t !== "A" && t !== "B") return;
    switch (ev.type) {
      case "shot": { if (ev.shooterId == null) break; const r = rowOf(t, ev.shooterId, ev.shooter); const three = ev.zone === "three"; if (three) r.fga3++; else r.fga2++; if (ev.made) { r.pts += three ? 3 : 2; if (three) r.fgm3++; else r.fgm2++; if (ev.assisterId != null) rowOf(t, ev.assisterId, ev.assister).ast++; } else { if (ev.blockerId != null) rowOf(other(t), ev.blockerId, ev.blocker).blk++; if (ev.defenderId != null) rowOf(other(t), ev.defenderId, ev.defender).pf++; } break; }
      case "rebound": { if (ev.rebounderId != null) { const r = rowOf(t, ev.rebounderId, ev.rebounder); r.reb++; if (ev.offensive) r.oreb++; else r.dreb++; } const sk = ev.offensive ? t : other(t); if (ev.shooterId != null && !ev.blocked) { const r = rowOf(sk, ev.shooterId, ev.shooter); if (ev.zone === "three") r.fga3++; else r.fga2++; } break; }
      case "freeThrow": { if (ev.shooterId == null) break; const r = rowOf(t, ev.shooterId, ev.shooter); r.fta += ev.attempts || 0; r.ftm += ev.made || 0; r.pts += ev.made || 0; break; }
      case "turnover": { if (ev.playerId != null) rowOf(t, ev.playerId, ev.player).tov++; if (ev.stealerId != null) rowOf(other(t), ev.stealerId, ev.stealer).stl++; break; }
      case "foul": { if (ev.defenderId != null) rowOf(t, ev.defenderId, ev.defender).pf++; break; }
      default: break;
    }
  }

  function presenterSay(text, quarter, clock) {
    if (!presenter) return;
    st.events.push({ id: ++st.seq, type: "quote", kind: "quote", team: null, quarter, clock, text, score: null, highlight: false, speaker: presenter.name, avatar: presenter.avatar || "" });
  }
  function presenterOn(ev, out) {
    if (!presenter) return;
    const names = [0, 1].map(t => (teams[keyOf(t)] && teams[keyOf(t)].name) || (t ? "les visiteurs" : "les locaux"));
    const sc = [st.scoreAB[keyOf(0)], st.scoreAB[keyOf(1)]];
    const pick = arr => arr[Math.floor(seededRandom(Math.round(ev.airAt || st.seq))() * arr.length)];
    const lead = sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1, gap = Math.abs(sc[0] - sc[1]);
    if (out.score) {
      const gained = [sc[0] - st.prevScore[0], sc[1] - st.prevScore[1]];
      const t = gained[0] > 0 ? 0 : gained[1] > 0 ? 1 : null;
      if (t !== null) { const r = st.run; if (r.team === t) r.pts += gained[t]; else { r.team = t; r.pts = gained[t]; r.said = false; } if (r.pts >= 8 && !r.said) { r.said = true; presenterSay(pick([`${names[t]} sur un ${r.pts}-0, l'entraîneur adverse devrait vite réagir.`, `Série de ${r.pts} points sans réponse pour ${names[t]} : la salle s'enflamme !`, `${r.pts}-0 pour ${names[t]}, c'est le moment de tout changer en face.`]), out.quarter, out.clock); } }
      st.prevScore = sc;
      if (out.quarter >= 4 && out.clock <= 120 && gap <= 3 && st.moneyQ !== out.quarter) { st.moneyQ = out.quarter; presenterSay(pick(["Money time ! Chaque possession va peser lourd.", "Deux minutes, tout est encore possible : le banc est debout.", "On tient un vrai finish, les joueurs le savent."]), out.quarter, out.clock); }
    }
    if (ev.type === "quarterStart" && ev.quarter === 1) presenterSay(pick([`C'est parti entre ${names[0]} et ${names[1]} ! On espère du spectacle.`, `Entre-deux, le match commence. ${names[0]} reçoit ${names[1]}.`]), out.quarter, out.clock);
    if (ev.type === "quarterEnd") {
      if (ev.quarter === 2) presenterSay(lead === null ? "Mi-temps, tout reste à faire : égalité parfaite." : pick([`Mi-temps : ${names[lead]} mène de ${gap} point${gap > 1 ? "s" : ""}. Rendez-vous aux vestiaires.`, `${names[lead]} rentre aux vestiaires devant (${sc[0]}-${sc[1]}).`]), out.quarter, out.clock);
      else if (ev.quarter === 1 || ev.quarter === 3) presenterSay(lead === null ? "Fin de quart, et on est à égalité." : pick([`Fin du ${ev.quarter === 1 ? "premier" : "troisième"} quart : ${names[lead]} devant, ${sc[0]}-${sc[1]}.`, `${names[lead]} vire en tête (${sc[0]}-${sc[1]}) après ${ev.quarter === 1 ? "dix" : "trente"} minutes.`]), out.quarter, out.clock);
    }
  }

  function applyEvent(ev) {
    if (!ev || ev.type === "forfeit") return;
    const hasTeam = ev.team === "A" || ev.team === "B";
    const t = hasTeam ? idx(ev.team) : null;
    const clock = ev.clock != null ? clockSeconds(ev.clock) : 0;
    const quarter = ev.quarter || st.quarter;
    st.quarter = quarter; st.clock = clock;
    if (ev.score) st.scoreAB = { A: ev.score.A, B: ev.score.B };
    // Possession (audit possession live, 2026-10-07) : l'équipe qui a le
    // ballon APRÈS l'événement (ev.possessionAfter, moteur) ; un direct
    // plus ancien n'a que `possession` (lu comme avant).
    const after = possessionAfterOf(ev);
    if (after) st.possession = idx(after);
    if (ev.airAt) st.lastAirAt = Math.max(st.lastAirAt, ev.airAt);
    if (ev.quarter != null && ev.clock != null) st.elapsed = elapsedAt(ev.quarter, ev.clock);
    const sc = [st.scoreAB[keyOf(0)], st.scoreAB[keyOf(1)]];
    st.raw.push({ quarter, score: sc });
    const out = { id: ++st.seq, team: t, quarter, clock, text: ev.text || "", score: null, highlight: false, kind: ev.type, made: ev.made, offensive: ev.offensive,
      zone: ev.zone === "inside" ? "paint" : ev.zone || null, airAt: ev.airAt || null, possessionTeam: ev.possession === "A" || ev.possession === "B" ? idx(ev.possession) : null,
      possessionAfter: after ? idx(after) : null, blocked: !!ev.blocked,
      type: (TYPE[ev.type] || (() => "info"))(ev) };
    if (hasTeam) { out.actors = actors(ev); Object.assign(out, facts(ev)); }
    if ((ev.type === "shot" && ev.made) || (ev.type === "freeThrow" && (ev.made || 0) > 0)) out.score = sc;
    if (ev.type === "foulOut" || ev.type === "technicalEjection" || ev.type === "injury") out.highlight = true;
    if (ev.type === "quarterStart" || ev.type === "quarterEnd") out.team = null;
    st.events.push(out);
    if (hasTeam && (ev.type === "foul" || ev.type === "unsportsmanlikeFoul")) st.fouls.push({ team: t, quarter });
    if (hasTeam && ev.type === "shot" && !ev.made && ev.defender) st.fouls.push({ team: 1 - t, quarter });
    const shot = hasTeam ? shotOf(ev, t) : null;
    if (shot) { st.shots.push({ id: st.seq, quarter, clock, made: !!ev.made, shooter: ev.shooter || null, ...shot }); out.shot = { x: shot.x, y: shot.y }; }
    applyStats(ev);
    if (hasTeam) {
      if (ev.type === "substitution") { if (ev.playerId != null) closeInterval(ev.team, ev.playerId); if (ev.replacementId != null) openInterval(ev.team, ev.replacementId, ev.replacement); }
      else if (ev.type === "shortHanded") { if (ev.playerId != null) closeInterval(ev.team, ev.playerId); }
    }
    presenterOn(ev, out);
  }
  function applyPause(pause) {
    if (!pause || pause.kind !== "timeout") return;
    st.events.push({ id: ++st.seq, type: "timeout", kind: "timeout", team: pause.team === "home" ? 0 : pause.team === "away" ? 1 : null, quarter: pause.quarter || st.quarter, clock: st.clock,
      airAt: pause.airAt || null, durationMs: pause.durationMs || null, text: pause.label, score: null, highlight: true, toast: pause.label, remaining: typeof pause.remaining === "number" ? pause.remaining : null });
  }
  function finish() {
    st.final = true;
    if (!presenter || st.finalSaid) return;
    st.finalSaid = true;
    const names = [0, 1].map(t => (teams[keyOf(t)] && teams[keyOf(t)].name) || (t ? "les visiteurs" : "les locaux"));
    const sc = [st.scoreAB[keyOf(0)], st.scoreAB[keyOf(1)]];
    const w = sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1, gap = Math.abs(sc[0] - sc[1]);
    if (w !== null) presenterSay(gap <= 3 ? `C'est terminé ! ${names[w]} s'impose ${sc[0]}-${sc[1]} au bout du suspense.` : gap >= 20 ? `Fin du match : ${names[w]} a déroulé, ${sc[0]}-${sc[1]}.` : `Fin du match, victoire de ${names[w]} ${sc[0]}-${sc[1]}. Merci de nous avoir suivis !`, st.quarter, 0);
  }

  // Chrono interpolé entre le dernier événement diffusé et le prochain de
  // chrono différent (même quart), figé pendant les pauses — même règle que
  // le tableau de score historique (updateLiveClockTick).
  function tick(now) {
    const evs = live.events || [];
    const inPause = (live.pauses || []).some(p => now >= p.airAt && now < p.airAt + p.durationMs);
    if (inPause || st.final) { st.shotClock = null; return; }
    let prevIdx = -1;
    for (let i = 0; i < evs.length; i++) { if (evs[i].airAt <= now) prevIdx = i; else break; }
    if (prevIdx < 0) { st.shotClock = null; return; }
    const prev = evs[prevIdx], prevSec = clockSeconds(prev.clock);
    let runStart = prevIdx;
    while (runStart > 0 && evs[runStart - 1].quarter === prev.quarter && clockSeconds(evs[runStart - 1].clock) === prevSec) runStart--;
    let nextDiff = null;
    for (let i = prevIdx + 1; i < evs.length; i++) { if (evs[i].quarter !== prev.quarter) break; if (clockSeconds(evs[i].clock) !== prevSec) { nextDiff = evs[i]; break; } }
    if (!nextDiff) { st.shotClock = null; return; }
    const frac = Math.min(1, Math.max(0, (now - evs[runStart].airAt) / (nextDiff.airAt - evs[runStart].airAt)));
    const interp = prevSec - (prevSec - clockSeconds(nextDiff.clock)) * frac;
    st.clock = Math.max(0, Math.round(interp));
    st.shotClock = Math.max(0, Math.min(24, 24 - Math.max(0, prevSec - interp)));
    const poss = possessionAt(evs, prevIdx);
    if (poss) st.possession = idx(poss);
  }
  function nextAction(now) {
    if (st.final || live.pregame) return null;
    const after = Math.max(st.lastAirAt, 0);
    const ev = (live.events || []).find(e => e.airAt > after && e.airAt > now - 1 && e.type !== "forfeit" && e.type !== "timeout");
    if (!ev) return null;
    const hasTeam = ev.team === "A" || ev.team === "B";
    const t = hasTeam ? idx(ev.team) : null;
    const shot = hasTeam ? shotOf(ev, t) : null;
    return { kind: ev.type, team: t, zone: ev.zone === "inside" ? "paint" : ev.zone || null, offensive: ev.offensive, airAt: ev.airAt, shot: shot ? { x: shot.x, y: shot.y } : null,
      possessionTeam: ev.possession === "A" || ev.possession === "B" ? idx(ev.possession) : null, actors: hasTeam ? actors(ev) : {}, ...facts(ev) };
  }
  function halftime(now) {
    const p = (live.pauses || []).find(x => x.kind === "halftime" && now >= x.airAt && now < x.airAt + x.durationMs);
    return p ? Math.ceil((p.airAt + p.durationMs - now) / 1000) : null;
  }
  function timeouts(t) {
    const pauses = live.pauses || [];
    if (!pauses.some(p => p.kind === "timeout" && typeof p.remaining === "number") && live.seed == null) return { timeoutsLeft: 0, timeoutsTotal: 0 };
    const q = st.quarter, period = x => (x <= 2 ? 1 : x <= 4 ? 2 : x), total = q <= 2 ? 2 : q <= 4 ? 3 : 1;
    const last = st.events.filter(e => e.type === "timeout" && e.team === t && period(e.quarter) === period(q)).pop();
    const left = last && typeof last.remaining === "number" ? last.remaining : total - (last ? 1 : 0);
    return { timeoutsLeft: Math.max(0, left), timeoutsTotal: total };
  }

  function buildState(now = Date.now()) {
    const half = st.final ? null : halftime(now);
    const maxQ = Math.max(4, st.quarter);
    const endOfQ = []; st.raw.forEach(r => { endOfQ[r.quarter - 1] = r.score; });
    const quarterScores = [[], []]; let prev = [0, 0];
    for (let q = 0; q < maxQ; q++) { const end = endOfQ[q]; [0, 1].forEach(t => quarterScores[t].push(end ? end[t] - prev[t] : (q === st.quarter - 1 ? 0 : null))); if (end) prev = end; }
    const total = [st.scoreAB[keyOf(0)], st.scoreAB[keyOf(1)]];
    const nowElapsed = st.elapsed;
    const teamsOut = [0, 1].map(t => {
      const key = keyOf(t), team = teams[key] || {};
      const byId = new Map((team.players || []).map(p => [p.id, p]));
      const players = [...st.rows[key].entries()].map(([id, r]) => {
        const p = byId.get(id) || {};
        return { id: key + ":#" + id, name: r.name || p.name, pos: r.pos || p.pos || "", avatar: p.avatar || "", link: p.link || null, starter: st.starters[key].has(id),
          onCourt: !st.final && !live.pregame && st.onCourt[key].has(id), seconds: r.seconds + (r.openSince != null ? Math.max(0, nowElapsed - r.openSince) : 0),
          pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf, fg2m: r.fgm2, fg2a: r.fga2, fg3m: r.fgm3, fg3a: r.fga3, ftm: r.ftm, fta: r.fta,
          number: Number.isInteger(p.number) ? p.number : null, fatigue: typeof st.fat[id] === "number" ? st.fat[id] : null };
      });
      return { name: team.name || (t ? "Extérieur" : "Domicile"), short: team.short || (team.name || "?").slice(0, 3).toUpperCase(), sponsor: team.sponsor || null, score: total[t], quarterScores: quarterScores[t],
        teamFouls: st.fouls.filter(f => f.team === t && f.quarter === st.quarter).length, ...timeouts(t), color: team.color || null, logo: team.logo || "", mine: opts.mine === key, tactics: team.tactics || null, players };
    });
    const dress = opts.dress || {};
    return {
      status: st.final ? "final" : live.pregame ? "pregame" : half !== null ? "halftime" : "live",
      kickoffIn: live.pregame ? Math.max(0, Math.ceil((live.kickoffAt - now) / 1000)) : null,
      quarter: st.quarter, clock: st.final ? 0 : st.clock, shotClock: st.final ? null : st.shotClock,
      possession: st.final ? null : st.possession, halftimeResumeIn: half,
      timeout: st.final ? null : activeTimeout(live.pauses, now),
      stoppage: st.final ? null : activeStoppage(live.pauses, now), kickoffAt: live.kickoffAt || null,
      meta: dress.meta || null, courtLogo: dress.courtLogo || "", arenaSponsor: dress.arenaSponsor || null, courtStyle: dress.courtStyle || null, referees: dress.referees || null,
      teams: teamsOut, shots: st.shots, events: st.events, nextAction: st.final ? null : nextAction(now),
    };
  }
  return { applyEvent, applyPause, finish, tick, buildState, reset, get state() { return st; } };
}
