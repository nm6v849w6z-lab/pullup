"use strict";
// =====================================================================
// SÉLECTIONS NATIONALES — PHASE B (2026-10-05) : présélection, joueurs
// suivis, convocations et tactique de la sélection. S'appuie sur la phase A
// (server/nationalTeams.js : stock, mandats, éligibilité, calendrier,
// notifications) sans la réécrire.
//
// Données propres au sélectionneur, rangées sur son MANDAT (conservées
// dans l'historique à la fin du mandat, le suivant repart de listes vides) :
//   m.preselection : [ref] (24 au plus), m.watchlist : [ref] (40 au plus),
//   m.tactics : ordres de la sélection (forme snapshotTactics des clubs,
//   validés par Actions.validateOrdersSnapshot), m.nids / m.nidSeq.
// Un joueur est repéré par ref = { p: id, n: nom } : les ids ne sont uniques
// que dans un championnat, le nom lève l'ambiguïté et suit un transfert.
// Dans la tactique, chaque joueur reçoit un numéro propre à la sélection
// (`nid`), pour que deux joueurs de championnats différents ne se mélangent
// jamais.
//
// Convocations, liées au RASSEMBLEMENT (une par fenêtre internationale, une
// pour la phase finale, voir NationalTeams.seasonCalendar) et gardées en
// historique : store.convocations[teamId][gatheringId] = { gid, kind, label,
// season, startAt, endAt, freezeAt, players: [ref], frozenAt, auto,
// mandateId, changes: [] }. Règles (retour utilisateur 2026-10-05) :
//   - 15 joueurs au plus ; liste libre jusqu'à 3 jours avant le premier
//     match (freezeAt), puis FIGÉE : step() la complète si besoin
//     (présélection, puis meilleurs disponibles) et prévient chaque manager
//     de club concerné ;
//   - après le gel, seul un joueur devenu indisponible (blessé, plus
//     éligible) peut être remplacé par un éligible disponible ;
//   - pour chaque match, le sélectionneur pioche 12 joueurs dans ces 15
//     (tactique : lineup.convoked).
// Les sélections sans sélectionneur (intérim) sont convoquées de la même
// façon au gel (meilleurs disponibles).
//
// Vivier du sélectionneur (fiches « sélectionneur » : GEN, caractéristiques,
// forme, état physique, stats et derniers matchs en club ; jamais salaire,
// contrat ni potentiel) : recalculé au plus toutes les heures dans step()
// pour les sélections qui ont un sélectionneur, rangé À PART (une clé par
// sélection, poolStoreName) pour ne pas alourdir le stock principal.
// Notifications à envoyer depuis une route (qui n'a que la ligue du
// manager) : file store.outbox, vidée par step() (toutes les ligues).
// =====================================================================
const Engine = require("../engine.js");

const DAY = 24 * 3600 * 1000;
const LIMITS = { convocation: 15, matchSquad: 12, preselection: 24, watchlist: 40, freezeDays: 3, poolMax: 220 };

function NT() { return require("./nationalTeams.js"); }

// --- Repères joueurs ------------------------------------------------------
function refOf(p) { return { p: p.id, n: p.name }; }
function cleanRef(r) {
  if (!r || typeof r !== "object") return null;
  const p = Number(r.p);
  const n = String(r.n == null ? "" : r.n).slice(0, 80);
  return Number.isFinite(p) && n ? { p, n } : null;
}
function sameRef(a, b) { return !!(a && b && a.p === b.p && a.n === b.n); }
function refKey(r) { return `${r.p}|${r.n}`; }
function hasRef(list, r) { return (list || []).some(x => sameRef(x, r)); }

// --- Vivier ----------------------------------------------------------------
function poolStoreName(teamId) {
  const [country, cat] = String(teamId).split("-");
  return `nationalpool${String(country).replace(/[^a-z]/g, "")}${cat === "A" ? "a" : "u"}`;
}
async function loadPool(teamId, savePath) {
  const store = require("./store.js");
  try { return await store.loadWorldAuxRaw(poolStoreName(teamId), savePath); } catch (e) { return null; }
}
async function savePool(teamId, data, savePath) {
  const store = require("./store.js");
  await store.saveWorldAuxRaw(poolStoreName(teamId), data, savePath);
}
// Évaluation d'un match (comme une ligne de stats : points + rebonds +
// passes + interceptions + contres − pertes − tirs ratés).
function matchEff(e) {
  const fga = (e.fga2 || 0) + (e.fga3 || 0), fgm = (e.fgm2 || 0) + (e.fgm3 || 0);
  return (e.pts || 0) + (e.reb || 0) + (e.ast || 0) + (e.stl || 0) + (e.blk || 0) - (e.tov || 0) - (fga - fgm) - ((e.fta || 0) - (e.ftm || 0));
}
const r1 = v => Math.round(v * 10) / 10;
function coachPlayer(x, now) {
  const p = x.src;
  const log = Array.isArray(p.matchLog) ? p.matchLog : [];
  const gp = log.length;
  const sum = k => log.reduce((s, e) => s + (e[k] || 0), 0);
  let condition = typeof p.condition === "number" ? p.condition : null;
  try { if (Engine.currentCondition) condition = Math.round(Engine.currentCondition(p, now, x.club.recovery || undefined)); } catch (e) { /* valeur brute */ }
  return {
    p: p.id, n: p.name, name: p.name, age: p.age, position: p.position, height: p.height, look: p.look || null,
    ovr: Math.round(x.ovr), attrs: p.attrs ? { ...p.attrs } : null, condition,
    injuryUntil: typeof p.injuryUntil === "number" && p.injuryUntil > now ? p.injuryUntil : null, injuryType: p.injuryType || null,
    club: { name: x.club.name, division: x.club.division, country: x.club.country, leagueId: x.club.leagueId, idx: x.club.idx },
    season: { gp, min: gp ? r1(sum("min") / gp) : 0, pts: gp ? r1(sum("pts") / gp) : 0, reb: gp ? r1(sum("reb") / gp) : 0, ast: gp ? r1(sum("ast") / gp) : 0, eff: gp ? r1(log.reduce((s, e) => s + matchEff(e), 0) / gp) : 0 },
    last5: log.slice(-5).map(e => ({ at: e.at || null, opp: e.opponent || null, min: e.min || 0, pts: e.pts || 0, reb: e.reb || 0, ast: e.ast || 0, eff: matchEff(e) })),
  };
}
// Vivier d'une sélection : les meilleurs éligibles (LIMITS.poolMax), plus
// tous ceux des listes du sélectionneur et des convocations, même moins bien
// notés.
function buildPool(store, team, leagues, world, now) {
  const cfg = NT().configOf(store);
  const el = NT().eligiblePlayers(cfg, team, leagues, world, now).players;
  const m = NT().activeMandate(store, team.id);
  const keep = new Set();
  [...((m && m.preselection) || []), ...((m && m.watchlist) || [])].forEach(r => keep.add(refKey(r)));
  Object.values((store.convocations || {})[team.id] || {}).forEach(c => (c.players || []).forEach(r => keep.add(refKey(r))));
  const chosen = el.filter((x, i) => i < LIMITS.poolMax || keep.has(refKey(refOf(x.src))));
  return { v: 1, at: now, teamId: team.id, eligible: el.length, players: chosen.map(x => coachPlayer(x, now)) };
}

// --- Rassemblements ---------------------------------------------------------
function compLabel(kind) { return kind === "continental" ? "compétition continentale" : kind === "world" ? "Coupe du monde / tournoi de consolation" : "compétition internationale"; }
function gatheringsOf(store, team, season, calendarStartAt) {
  const cfg = NT().configOf(store);
  const pos = NT().cyclePos(cfg, season, team.cat);
  const phase = pos >= 0 ? cfg.cycle[pos] : null;
  const gs = NT().seasonCalendar(cfg, calendarStartAt, season, team.cat).map(c => {
    if (c.kind === "window") {
      return { gid: `s${season}w${c.n}`, kind: "window", n: c.n, label: `Fenêtre internationale ${c.n}`, comp: phase ? phase.kind : null, season, startAt: c.at, endAt: c.at, freezeAt: c.at - LIMITS.freezeDays * DAY };
    }
    return { gid: `s${season}f`, kind: "final", label: c.comp === "continental" ? "Phase finale continentale" : "Coupe du monde / tournoi de consolation", comp: c.comp, season, startAt: c.from, endAt: c.to, freezeAt: c.from - LIMITS.freezeDays * DAY };
  });
  // Exemptée (groupe de 3, pas de match ce dimanche-là) ou absente des
  // phases finales : pas de rassemblement, jamais de convocation.
  const NM = require("./nationalMatches.js");
  gs.forEach(g => {
    if (g.kind === "window") {
      const comp = NM.compOf(store, season, team.cat);
      g.bye = !!(comp && !comp.matches.some(m => m.gid === g.gid && (m.home === team.id || m.away === team.id)));
    } else {
      const fin = NM.finalsOf(store, season, team.cat);
      g.bye = !!(fin && !fin.tournaments.some(t => t.teams.includes(team.id)));
    }
  });
  return gs;
}
// Rassemblement en cours ou à venir (le premier dont la fin n'est pas passée).
function currentGathering(gs, now) { return gs.find(g => !g.bye && now < g.endAt + 6 * 3600 * 1000) || null; }
function convocationOf(store, teamId, gid) { return ((store.convocations || {})[teamId] || {})[gid] || null; }
function ensureConvocation(store, teamId, g, mandateId) {
  store.convocations = store.convocations || {};
  const byTeam = store.convocations[teamId] = store.convocations[teamId] || {};
  if (!byTeam[g.gid]) byTeam[g.gid] = { gid: g.gid, kind: g.kind, label: g.label, comp: g.comp || null, season: g.season, startAt: g.startAt, endAt: g.endAt, freezeAt: g.freezeAt, players: [], frozenAt: null, auto: false, mandateId: mandateId || null, changes: [] };
  return byTeam[g.gid];
}
// Disponibilité d'un joueur pour un rassemblement, d'après les fiches à jour
// (`byKey` : refKey → fiche du vivier ou des éligibles).
function statusOf(ref, byKey, g) {
  const x = byKey.get(refKey(ref));
  if (!x) return "ineligible";
  const injUntil = x.injuryUntil != null ? x.injuryUntil : (x.src && x.src.injuryUntil);
  if (typeof injUntil === "number" && injUntil > (g ? g.startAt : Date.now())) return "injured";
  return "ok";
}

// --- Dates en clair (notifications) ---------------------------------------
function fmtDay(at) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date(at));
}
function fmtHour(at) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(at)).replace(":", "h");
}
function convocationNotice(teamId, g, name) {
  const label = NT().teamLabel(teamId);
  if (g.kind === "window") {
    return {
      title: `Convocation en sélection : ${name}`,
      text: `Votre joueur ${name} est convoqué par le sélectionneur de ${label} pour la ${g.label.toLowerCase()} (${compLabel(g.comp)}), match le ${fmtDay(g.startAt)} à ${fmtHour(g.startAt)}. Indisponible pour votre club ce jour-là.`,
    };
  }
  return {
    title: `Convocation en sélection : ${name}`,
    text: `Votre joueur ${name} est convoqué par le sélectionneur de ${label} pour la ${g.label.toLowerCase()}, du ${fmtDay(g.startAt)} au ${fmtDay(g.endAt)}. Indisponible pour votre club pendant toute la phase finale.`,
  };
}
function queueNotice(store, club, entry) {
  if (!club || club.leagueId == null || club.idx == null) return;
  store.outbox = store.outbox || [];
  store.outbox.push({ ref: { leagueId: club.leagueId, idx: club.idx }, entry });
  if (store.outbox.length > 500) store.outbox.splice(0, store.outbox.length - 500);
}
function notifyConvoked(store, teamId, g, x, kind = "convoked") {
  const n = convocationNotice(teamId, g, x.name);
  queueNotice(store, x.club, { key: `nat_conv_${teamId}_${g.gid}_${x.club.leagueId}_${x.p != null ? x.p : x.id}_${kind}`, ...n });
}

// --- Passage du rattrapage du monde ---------------------------------------
// Appelé par NationalTeams.step (toutes les ligues en main). Renvoie
// { changed, pools: { teamId: data }, due: [échéances] }.
function step(store, leagues, world, now, season, calendarStartAt) {
  let changed = false;
  const pools = {};
  const due = [];
  const cfg = NT().configOf(store);
  // 1) Notifications en attente (envoyées depuis une route).
  if (Array.isArray(store.outbox) && store.outbox.length) {
    store.outbox.forEach(o => NT().notify(leagues, o.ref, o.entry, now));
    store.outbox = [];
    changed = true;
  }
  store.poolAt = store.poolAt || {};
  for (const team of Object.values(store.teams)) {
    const m = NT().activeMandate(store, team.id);
    // 2) Vivier du sélectionneur, au plus toutes les heures.
    if (m && (!store.poolAt[team.id] || now - store.poolAt[team.id] >= cfg.squadRefreshMs)) {
      pools[team.id] = buildPool(store, team, leagues, world, now);
      store.poolAt[team.id] = now;
      watchAlerts(store, m, team, pools[team.id], season, calendarStartAt, now);
      changed = true;
    }
    // Rappel (mode Sélectionneur) : la liste se fige dans moins de 24 h.
    if (m && cfg.matchesLive && typeof calendarStartAt === "number") {
      for (const g of gatheringsOf(store, team, season, calendarStartAt)) {
        if (now < g.freezeAt - DAY || now >= g.freezeAt) continue;
        const conv = convocationOf(store, team.id, g.gid);
        const n = conv ? conv.players.length : 0;
        if (coachFeed(m, { key: `freeze_${g.gid}`, kind: "convocation", at: now, title: "Les convocations doivent être finalisées", text: `${g.label} : liste figée dans moins de 24 h (${n} / ${LIMITS.convocation} joueurs). Les places libres seront complétées automatiquement.` })) changed = true;
      }
    }
    // 3) Gel des convocations 3 jours avant le premier match (seulement une
    // fois les matchs internationaux en service, cfg.matchesLive).
    if (typeof calendarStartAt !== "number" || !cfg.matchesLive) continue;
    for (const g of gatheringsOf(store, team, season, calendarStartAt)) {
      if (now < g.freezeAt) { due.push(g.freezeAt); continue; }
      if (now >= g.startAt + 6 * 3600 * 1000 || g.bye) continue;
      // Phase finale : seulement les sélections engagées dans un tournoi.
      if (g.kind === "final" && !require("./nationalMatches.js").tournamentOf(store, season, team.cat, team.id)) continue;
      const conv = convocationOf(store, team.id, g.gid);
      if (conv && conv.frozenAt) continue;
      freezeConvocation(store, team, g, m, leagues, world, now);
      changed = true;
    }
  }
  // Historique borné : 3 saisons de convocations par sélection.
  Object.values(store.convocations || {}).forEach(byTeam => {
    Object.keys(byTeam).forEach(gid => { if (byTeam[gid].season < season - 2) { delete byTeam[gid]; changed = true; } });
  });
  // Notifications du gel : envoyées tout de suite (ligues en main).
  if (Array.isArray(store.outbox) && store.outbox.length) {
    store.outbox.forEach(o => NT().notify(leagues, o.ref, o.entry, now));
    store.outbox = [];
  }
  return { changed, pools, due };
}
function freezeConvocation(store, team, g, m, leagues, world, now) {
  const cfg = NT().configOf(store);
  const el = NT().eligiblePlayers(cfg, team, leagues, world, now).players;
  const byKey = new Map(el.map(x => [refKey(refOf(x.src)), x]));
  const conv = ensureConvocation(store, team.id, g, m ? m.id : null);
  const kept = conv.players.filter(r => statusOf(r, byKey, g) === "ok");
  const list = kept.slice(0, LIMITS.convocation);
  const before = list.length;
  // Complément : présélection (meilleurs d'abord), puis meilleurs
  // disponibles (2 par poste d'abord, comme le groupe de l'intérim).
  const pre = ((m && m.preselection) || []).map(r => byKey.get(refKey(r))).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const add = x => { const r = refOf(x.src); if (list.length < LIMITS.convocation && !hasRef(list, r) && statusOf(r, byKey, g) === "ok") list.push(r); };
  pre.forEach(add);
  const avail = el.filter(x => statusOf(refOf(x.src), byKey, g) === "ok");
  NT().pickSquad(avail, LIMITS.convocation).forEach(add);
  avail.forEach(add);
  conv.players = list;
  conv.frozenAt = now;
  conv.auto = !m || list.length > before;
  conv.mandateId = m ? m.id : null;
  // Managers de club prévenus (un message par joueur).
  list.forEach(r => {
    const x = byKey.get(refKey(r));
    if (x) notifyConvoked(store, team.id, g, { name: x.name, p: x.id, club: x.club });
  });
  return conv;
}

// --- Mode Sélectionneur (phase E) : notifications propres -------------------
// Fil du mandat (m.feed) : jamais dans le fil du club. Clé unique par
// notification (pas de doublon). Renvoie true si ajoutée.
const FEED_MAX = 60;
function coachFeed(m, entry) {
  if (!m) return false;
  m.feed = Array.isArray(m.feed) ? m.feed : [];
  if (entry.key && m.feed.some(e => e.key === entry.key)) return false;
  m.feedSeq = (m.feedSeq || 0) + 1;
  m.feed.unshift({ id: m.feedSeq, ...entry });
  if (m.feed.length > FEED_MAX) m.feed.length = FEED_MAX;
  return true;
}
// Alertes sur les joueurs de la présélection, des convocations et des
// suivis (au recalcul du vivier) : blessure, très bonne performance en club.
function watchAlerts(store, m, team, pool, season, calendarStartAt, now) {
  const byKey = poolMap(pool);
  const cur = typeof calendarStartAt === "number" ? currentGathering(gatheringsOf(store, team, season, calendarStartAt), now) : null;
  const conv = cur ? convocationOf(store, team.id, cur.gid) : null;
  const tracked = new Map();
  [["preselection", m.preselection], ["watchlist", m.watchlist], ["convocation", conv && conv.players]].forEach(([why, list]) => (list || []).forEach(r => { if (!tracked.has(refKey(r))) tracked.set(refKey(r), why); }));
  m.alertState = m.alertState || {};
  tracked.forEach((why, k) => {
    const x = byKey.get(k);
    if (!x) return;
    const st = m.alertState[k] = m.alertState[k] || {};
    if (x.injuryUntil && st.inj !== x.injuryUntil) {
      st.inj = x.injuryUntil;
      const days = Math.max(1, Math.ceil((x.injuryUntil - now) / DAY));
      const hit = cur && x.injuryUntil > cur.startAt;
      coachFeed(m, { key: `inj_${k}_${x.injuryUntil}`, kind: "injury", at: now, title: `${x.name} est blessé`, text: `${x.injuryType || "Blessure"}, ${days} jour${days > 1 ? "s" : ""} d'indisponibilité${hit ? " : il ne pourra pas participer au prochain rassemblement" : ""}.`, player: { p: x.p, n: x.n } });
    }
    const last = (x.last5 || [])[x.last5.length - 1];
    if (last && last.at && last.eff >= 25 && (st.perf || 0) < last.at) {
      st.perf = last.at;
      coachFeed(m, { key: `perf_${k}_${last.at}`, kind: "performance", at: now, title: `${x.name} vient de réaliser une excellente performance`, text: `${last.pts} points, ${last.reb} rebonds, ${last.ast} passes${last.opp ? ` contre ${last.opp}` : ""} avec ${x.club.name} (évaluation ${last.eff}).`, player: { p: x.p, n: x.n } });
    }
  });
}
// Statistiques des joueurs en sélection (matchs joués depuis `since`).
function playerStatsOf(store, teamId, since) {
  const NM = require("./nationalMatches.js");
  const rows = new Map();
  NM.resultsOf(store, teamId).filter(r => r.at >= (since || 0)).forEach(r => {
    const md = NM.matchDetail(store, r.id);
    const box = md ? (md.home === teamId ? md.boxHome : md.boxAway) : [];
    box.forEach(b => {
      if (!b.ref) return;
      const k = refKey(b.ref);
      const s = rows.get(k) || { ref: b.ref, name: b.name, position: b.position, club: b.club ? b.club.name : null, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
      if (b.min > 0) { s.gp++; s.min += b.min; s.pts += b.pts; s.reb += b.reb; s.ast += b.ast; s.stl += b.stl; s.blk += b.blk; }
      rows.set(k, s);
    });
  });
  return [...rows.values()].filter(s => s.gp > 0).sort((a, b) => b.gp - a.gp || b.pts - a.pts);
}
// Bilan d'un mandat (en cours ou terminé).
function mandateReport(store, m) {
  const NM = require("./nationalMatches.js");
  const end = m.endedAt || Infinity;
  const res = NM.resultsOf(store, m.teamId).filter(r => r.at >= m.startedAt && r.at <= end);
  let wins = 0, losses = 0, pf = 0, pa = 0;
  res.forEach(r => { const home = r.home === m.teamId; const f = home ? r.scoreHome : r.scoreAway, a = home ? r.scoreAway : r.scoreHome; pf += f; pa += a; if (f > a) wins++; else losses++; });
  const stats = playerStatsOf(store, m.teamId, m.startedAt).filter(s => true);
  const used = stats.length;
  const fresh = stats.filter(s => { const c = (store.caps || {})[refKey(s.ref)]; return c && c.first && c.first.teamId === m.teamId && c.first.at >= m.startedAt && c.first.at <= end; }).map(s => s.name);
  // Qualifications et compétitions des saisons du mandat.
  const seasons = [];
  for (let s = m.fromSeason; s <= m.toSeason; s++) {
    const q = NM.qualifView(store, m.teamId, s);
    const f = NM.finalsView(store, m.teamId, s);
    const t = f && f.tournaments[0];
    const rank = t && t.ranking ? t.ranking.indexOf(m.teamId) + 1 : null;
    const cfg = NT().configOf(store), pos = NT().cyclePos(cfg, s, store.teams[m.teamId].cat);
    seasons.push({
      season: s, comp: q ? q.comp : pos >= 0 ? cfg.cycle[pos].kind : null,
      qualified: q && q.finalStatus ? q.finalStatus === "qualified" : null,
      groupRank: q && q.group ? ((q.group.standings.find(r => r.teamId === m.teamId) || {}).rank || null) : null,
      tournament: t ? { label: t.label, kind: t.kind, rank, of: t.ranking ? t.ranking.length : t.groups.reduce((n, g) => n + g.standings.length, 0), stage: rank ? stageOfRank(t, m.teamId) : null } : null,
    });
  }
  const finishes = seasons.filter(s => s.tournament && s.tournament.rank && s.tournament.kind !== "consolation");
  const best = finishes.sort((a, b) => a.tournament.rank - b.tournament.rank)[0];
  return {
    teamId: m.teamId, label: NT().teamLabel(m.teamId), coach: m.pseudo || (m.clubName ? `Manager de ${m.clubName}` : "Sélectionneur"),
    fromSeason: m.fromSeason, toSeason: m.toSeason, seasons: m.toSeason - m.fromSeason + 1, startedAt: m.startedAt, endedAt: m.endedAt || null,
    played: res.length, wins, losses, winPct: res.length ? Math.round((wins / res.length) * 100) : null, pf, pa,
    playersUsed: used, newInternationals: fresh.length, newNames: fresh.slice(0, 20),
    topScorers: stats.slice().sort((a, b) => b.pts - a.pts).slice(0, 3).map(s => ({ name: s.name, pts: s.pts, gp: s.gp })),
    seasonsDetail: seasons, bestFinish: best ? `${best.tournament.stage} · ${best.tournament.label}` : null,
    results: res.slice(0, 12).map(r => ({ id: r.id, at: r.at, home: r.home, away: r.away, scoreHome: r.scoreHome, scoreAway: r.scoreAway, label: r.label || (r.w ? `Fenêtre internationale ${r.w}` : null) })),
  };
}
function stageOfRank(t, teamId) {
  const r = t.ranking.indexOf(teamId) + 1;
  if (r === 1) return "Vainqueur";
  if (r === 2) return "Finaliste";
  if (t.matches.some(m => m.stage === "sf" && (m.home === teamId || m.away === teamId))) return r === 3 ? "3e place" : "Demi-finale";
  if (t.matches.some(m => m.stage === "qf" && (m.home === teamId || m.away === teamId))) return "Quart de finale";
  return "Phase de poules";
}
function markSeen(store, me, body, now) {
  const m = coachMandate(store, me, body && body.teamId);
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  m.feedSeenId = m.feedSeq || 0;
  return { ok: true };
}

// --- Actions du sélectionneur (routes) -----------------------------------
function fail(error, status = 400) { return { ok: false, status, error }; }
function coachMandate(store, me, teamId) {
  const m = NT().activeMandate(store, teamId);
  if (!m || !me || m.key !== me.key) return null;
  return m;
}
function poolMap(pool) { return new Map(((pool && pool.players) || []).map(x => [refKey(x), x])); }
// Liste du sélectionneur : présélection ou joueurs suivis.
function setListMember(store, me, body, now, ctx) {
  const m = coachMandate(store, me, body && body.teamId);
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  const list = body.list === "watchlist" ? "watchlist" : body.list === "preselection" ? "preselection" : null;
  if (!list) return fail("Liste inconnue.");
  const r = cleanRef(body.player);
  if (!r) return fail("Joueur invalide.");
  m[list] = Array.isArray(m[list]) ? m[list] : [];
  if (body.on === false) {
    m[list] = m[list].filter(x => !sameRef(x, r));
    return { ok: true, [list]: m[list] };
  }
  if (hasRef(m[list], r)) return { ok: true, [list]: m[list] };
  if (!poolMap(ctx.pool).has(refKey(r))) return fail("Ce joueur n'est pas sélectionnable pour cette sélection.");
  const max = list === "watchlist" ? LIMITS.watchlist : LIMITS.preselection;
  if (m[list].length >= max) return fail(list === "watchlist" ? `${max} joueurs suivis au maximum.` : `Présélection : ${max} joueurs au maximum.`);
  m[list].push(r);
  return { ok: true, [list]: m[list] };
}
// Liste des convoqués d'un rassemblement, avant le gel.
function setConvocation(store, me, body, now, ctx) {
  const m = coachMandate(store, me, body && body.teamId);
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  const team = store.teams[body.teamId];
  const g = gatheringsOf(store, team, ctx.season, ctx.calendarStartAt).find(x => x.gid === body.gatheringId);
  if (!g) return fail("Rassemblement inconnu.", 404);
  const conv0 = convocationOf(store, team.id, g.gid);
  if ((conv0 && conv0.frozenAt) || now >= g.freezeAt) return fail("La liste est figée (3 jours avant le premier match) : seul un joueur indisponible peut encore être remplacé.");
  if (!Array.isArray(body.players)) return fail("Liste de joueurs attendue.");
  const refs = [];
  for (const raw of body.players) {
    const r = cleanRef(raw);
    if (!r) return fail("Joueur invalide.");
    if (!hasRef(refs, r)) refs.push(r);
  }
  if (refs.length > LIMITS.convocation) return fail(`${LIMITS.convocation} joueurs convoqués au maximum.`);
  const pm = poolMap(ctx.pool);
  const bad = refs.find(r => !pm.has(refKey(r)));
  if (bad) return fail(`${bad.n} n'est pas sélectionnable pour cette sélection.`);
  const conv = ensureConvocation(store, team.id, g, m.id);
  conv.players = refs;
  conv.mandateId = m.id;
  conv.updatedAt = now;
  return { ok: true, convocation: conv };
}
// Remplacement d'un convoqué devenu indisponible, après le gel.
function replaceConvoked(store, me, body, now, ctx) {
  const m = coachMandate(store, me, body && body.teamId);
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  const team = store.teams[body.teamId];
  const g = gatheringsOf(store, team, ctx.season, ctx.calendarStartAt).find(x => x.gid === body.gatheringId);
  const conv = g && convocationOf(store, team.id, g.gid);
  if (!g || !conv) return fail("Rassemblement inconnu.", 404);
  if (!conv.frozenAt) return fail("Liste pas encore figée : modifiez-la directement.");
  if (now >= g.endAt + 6 * 3600 * 1000) return fail("Rassemblement terminé.");
  const out = cleanRef(body.out), inn = cleanRef(body.in);
  if (!out || !inn) return fail("Joueurs invalides.");
  if (!hasRef(conv.players, out)) return fail(`${out.n} ne fait pas partie des convoqués.`);
  if (hasRef(conv.players, inn)) return fail(`${inn.n} est déjà convoqué.`);
  const pm = poolMap(ctx.pool);
  const st = statusOf(out, pm, g);
  if (st === "ok") return fail(`${out.n} est disponible : la liste est figée, il ne peut pas être remplacé.`);
  if (!pm.has(refKey(inn))) return fail(`${inn.n} n'est pas sélectionnable pour cette sélection.`);
  if (statusOf(inn, pm, g) !== "ok") return fail(`${inn.n} n'est pas disponible.`);
  conv.players = conv.players.map(r => sameRef(r, out) ? inn : r);
  conv.changes = conv.changes || [];
  conv.changes.push({ at: now, out, in: inn, reason: st });
  // Retiré du match de la tactique s'il y figurait.
  if (m.tactics && m.tactics.lineup) m.tactics = scrubTactics(m, m.tactics, conv.players);
  notifyConvoked(store, team.id, g, pm.get(refKey(inn)), "replacement");
  return { ok: true, convocation: conv };
}

// --- Tactique ------------------------------------------------------------
function nidOf(m, r) {
  m.nids = m.nids || {};
  const k = refKey(r);
  if (!m.nids[k]) { m.nidSeq = (m.nidSeq || 0) + 1; m.nids[k] = m.nidSeq; }
  return m.nids[k];
}
// Joueurs dont la tactique peut parler : les convoqués du rassemblement en
// cours ou à venir, sinon la présélection (préparer avant les convocations).
function tacticsRoster(store, m, team, ctx) {
  const g = currentGathering(gatheringsOf(store, team, ctx.season, ctx.calendarStartAt), Date.now());
  const conv = g && convocationOf(store, team.id, g.gid);
  const refs = conv && conv.players.length ? conv.players : (m.preselection || []);
  return { gathering: g, refs };
}
// Retire de la tactique les joueurs qui ne sont plus dans `refs`.
function scrubTactics(m, tactics, refs) {
  const allowed = new Set(refs.map(r => nidOf(m, r)));
  const t = JSON.parse(JSON.stringify(tactics));
  const L = t.lineup || {};
  Object.keys(L.starters || {}).forEach(pos => { if (L.starters[pos] != null && !allowed.has(L.starters[pos])) L.starters[pos] = null; });
  Object.keys(L.backupPositions || {}).forEach(id => { if (!allowed.has(Number(id))) delete L.backupPositions[id]; });
  if (L.minutes) Object.values(L.minutes).forEach(mm => Object.keys(mm).forEach(id => { if (!allowed.has(Number(id))) delete mm[id]; }));
  if (Array.isArray(L.convoked)) L.convoked = L.convoked.filter(id => allowed.has(id));
  return t;
}
function setTactics(store, me, body, now, ctx) {
  const m = coachMandate(store, me, body && body.teamId);
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  const team = store.teams[body.teamId];
  const { refs } = tacticsRoster(store, m, team, ctx);
  const pm = poolMap(ctx.pool);
  const players = refs.map(r => ({ id: nidOf(m, r), position: (pm.get(refKey(r)) || {}).position || null }));
  const Actions = require("./actions.js");
  const v = Actions.validateOrdersSnapshot({ players }, body.orders);
  if (!v.ok) return fail(v.error);
  const L = v.value.lineup;
  if (Array.isArray(L.convoked) && L.convoked.length > LIMITS.matchSquad) return fail(`${LIMITS.matchSquad} joueurs au maximum sur la feuille de match.`);
  // Titulaires pris parmi les 12 de la feuille de match.
  if (Array.isArray(L.convoked) && L.convoked.length) {
    const sheet = new Set(L.convoked);
    const out = Object.values(L.starters).find(id => id != null && !sheet.has(id));
    if (out != null) return fail("Un titulaire doit faire partie des 12 joueurs de la feuille de match.");
  }
  // Consignes de marquage (Surveiller) : même validation que les clubs.
  if (body.orders && body.orders.watchAssignments !== undefined) {
    const w = validateWatch(body.orders.watchAssignments);
    if (!w.ok) return fail(w.error);
    v.value.watchAssignments = w.value;
  }
  m.tactics = { ...v.value, updatedAt: now };
  return { ok: true, tactics: m.tactics };
}
function validateWatch(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: "watchAssignments doit être un tableau." };
  if (raw.length > Engine.MAX_WATCH_ASSIGNMENTS) return { ok: false, error: `Au maximum ${Engine.MAX_WATCH_ASSIGNMENTS} consignes de marquage.` };
  const value = [];
  for (const w of raw) {
    if (!w || !NT().POSITIONS.includes(w.position) || !Engine.WATCH_FOCUS_EFFECTS[w.focus]) return { ok: false, error: "Consigne de marquage invalide." };
    value.push({ position: w.position, focus: w.focus });
  }
  return { ok: true, value };
}
// Ordres par défaut d'une sélection (ceux d'un club neuf).
function defaultOrders() {
  return {
    offensivePriorities: ["Équilibrée", "Pick & Roll", "Jeu en mouvement"], defense: "Homme à homme", rhythm: "Normal",
    tacticalTier: "débutant", screenDefense: "Aucune consigne", helpDefense: "Moyenne", postDefense: "Classique",
    closeoutStyle: "Contrôlé", offRebStyle: "Normal", endgameManagement: "Standard", watchAssignments: [],
    lineup: { starters: { Meneur: null, "Arrière": null, "Ailier shooteur": null, "Ailier fort": null, Pivot: null }, backupPositions: {} },
  };
}

// --- Vue du sélectionneur ----------------------------------------------------
function coachView(store, me, teamId, now, ctx) {
  const team = store.teams[teamId];
  if (!team) return fail("Sélection inconnue.", 404);
  const m = coachMandate(store, me, teamId);
  if (!m) return fail("Réservé au sélectionneur de cette sélection.", 403);
  const pool = ctx.pool;
  const pm = poolMap(pool);
  const gs = gatheringsOf(store, team, ctx.season, ctx.calendarStartAt);
  const cur = currentGathering(gs, now);
  const gatherings = gs.map(g => {
    const conv = convocationOf(store, team.id, g.gid);
    const players = ((conv && conv.players) || []).map(r => ({ ref: r, nid: nidOf(m, r), status: statusOf(r, pm, g) }));
    return { ...g, frozen: !!(conv && conv.frozenAt) || now >= g.freezeAt, frozenAt: conv ? conv.frozenAt : null, auto: !!(conv && conv.auto), players, changes: (conv && conv.changes) || [], past: now >= g.endAt + 6 * 3600 * 1000 };
  });
  const { refs } = tacticsRoster(store, m, team, ctx);
  const nidPlayers = refs.map(r => ({ nid: nidOf(m, r), ref: r }));
  return {
    ok: true, now, season: ctx.season,
    team: { id: team.id, country: team.country, cat: team.cat, label: NT().teamLabel(team.id) },
    mandate: NT().publicMandate(m),
    limits: LIMITS,
    pool: pool ? { at: pool.at, eligible: pool.eligible, players: pool.players } : null,
    preselection: m.preselection || [], watchlist: m.watchlist || [],
    gatherings, currentGid: cur ? cur.gid : null,
    tactics: m.tactics || defaultOrders(), tacticsPlayers: nidPlayers,
    // Mode Sélectionneur (phase E) : notifications, statistiques, bilan.
    feed: (m.feed || []).slice(0, 40), unread: Math.max(0, (m.feedSeq || 0) - (m.feedSeenId || 0)),
    stats: playerStatsOf(store, team.id, m.startedAt),
    report: mandateReport(store, m),
    pastMandates: store.mandates.filter(x => x.key === m.key && x.endedAt && x.report).slice(-5).map(x => x.report),
    options: {
      offense: Object.keys(Engine.OFFENSE_PROFILES), defense: Object.keys(Engine.DEFENSES), rhythm: Object.keys(Engine.RHYTHMS),
      screenDefense: Object.keys(Engine.SCREEN_DEFENSES), helpDefense: Object.keys(Engine.HELP_DEFENSE_LEVELS), postDefense: Object.keys(Engine.POST_DEFENSES),
      closeoutStyle: Object.keys(Engine.CLOSEOUT_STYLES), offRebStyle: Object.keys(Engine.OFF_REBOUND_STYLES), endgameManagement: Object.keys(Engine.ENDGAME_MANAGEMENT),
      watchFocus: Object.keys(Engine.WATCH_FOCUS_EFFECTS), maxWatch: Engine.MAX_WATCH_ASSIGNMENTS, maxOffense: 3,
    },
  };
}

// --- Administration : nommer un sélectionneur (essais, intérim) -----------
function adminAppoint(store, teamId, me, season, now, leagues) {
  const team = store.teams[teamId];
  if (!team) return fail("Sélection inconnue (ex. fr-A, fr-U21).", 404);
  if (!me) return fail("Club introuvable ou sans manager.", 404);
  const cfg = NT().configOf(store);
  // Élection en cours pour cette sélection : annulée (nomination directe).
  const el = NT().currentElection(store, teamId);
  if (el) { el.status = "cancelled"; el.result = { at: now, cancelled: true, appointed: true }; }
  const prev = NT().activeMandate(store, teamId);
  if (prev) NT().endMandate(store, prev, "dismissed", now, leagues);
  NT().mandatesOfKey(store, me.key).forEach(x => NT().endMandate(store, x, "dismissed", now, leagues));
  const mandate = {
    id: `m${(store.seq = (store.seq || 1) + 1)}`, teamId, key: me.key, ref: me.ref, pseudo: me.pseudo, clubName: me.clubName,
    electionId: null, appointed: true, votes: 0, fromSeason: season, toSeason: NT().mandateEndSeason(cfg, season, team.cat),
    startedAt: now, endedAt: null, endReason: null,
  };
  store.mandates.push(mandate);
  team.mandateId = mandate.id;
  // Vivier calculé au prochain passage du monde.
  if (store.poolAt) delete store.poolAt[teamId];
  return { ok: true, mandate: NT().publicMandate(mandate) };
}

module.exports = {
  LIMITS, refOf, refKey, sameRef, cleanRef, poolStoreName, loadPool, savePool, coachPlayer, buildPool, matchEff,
  gatheringsOf, currentGathering, convocationOf, statusOf, convocationNotice, step, freezeConvocation,
  setListMember, setConvocation, replaceConvoked, setTactics, coachView, defaultOrders, adminAppoint,
  coachFeed, watchAlerts, playerStatsOf, mandateReport, markSeen,
};
