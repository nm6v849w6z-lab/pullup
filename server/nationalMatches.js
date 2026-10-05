"use strict";
// =====================================================================
// SÉLECTIONS NATIONALES — PHASE C (2026-10-05) : les 3 fenêtres
// internationales (dimanches des semaines 2, 4 et 6, 20h), groupes de
// qualification, matchs, classements, historique.
//
// Règles (retour utilisateur 2026-10-05) :
//   - chaque saison du cycle, A et U21 indépendantes : groupes de 4 au plus
//     par continent (Europe 10 pays → 4/3/3, Amérique 4, Asie 3), têtes de
//     série d'après le niveau des sélections, un match par fenêtre (une
//     équipe d'un groupe de 3 est exempte une fois) ;
//   - saison continentale : se qualifient pour la phase finale de la
//     dernière semaine les 2 premiers de chaque groupe européen + les 2
//     meilleurs 3es (8 sur 10), tous les pays d'Amérique et d'Asie (le
//     classement donne les têtes de série) ; les autres jouent la
//     consolation (phase D) ;
//   - saison Coupe du monde : la qualification se fait sur le classement
//     continental de la saison précédente (phase D) ; les groupes de la
//     saison fixent les têtes de série ;
//   - fatigue NORMALE (récupération du moteur sans bonus : seule la phase
//     finale aura une récupération améliorée) ; les matchs de championnat et
//     de coupe ne bougent pas, le match international s'ajoute le dimanche.
//
// Match : moteur des clubs (Engine.MatchEngine) sur une « coquille »
// d'équipe garnie des VRAIS joueurs convoqués (comme les amicaux, voir
// server/friendlies.js:playFriendlyMatch) : forme physique, blessures et
// minutes s'appliquent aux vrais joueurs, puis l'entrée « national » est
// retirée de leur journal (jamais dans les stats de club). Les ids de
// joueurs n'étant uniques que dans un championnat, chaque joueur reçoit un
// id provisoire le temps du match (remis aussitôt après).
//
// Stockage : store.intl["<saison>-<cat>"] = { season, cat, comp, groups:
// [{ id, continent, label, teams }], matches: [{ id, groupId, w, home,
// away, at, status, scoreHome, scoreAway, quarterScores, boxHome, boxAway,
// forfeit, injuries }] } — 3 saisons gardées.
// =====================================================================
const Engine = require("../engine.js");

const CONTINENTS = {
  "Europe": ["fr", "it", "es", "de", "gr", "lt", "pl", "pt", "be", "ch"],
  "Amérique": ["us", "br", "ar", "ca"],
  "Asie": ["cn", "hk", "tw"],
};
const GROUP_MAX = 4;
const TEMP_ID_BASE = 9000000;

function NT() { return require("./nationalTeams.js"); }
function NC() { return require("./nationalCoach.js"); }

function continentOf(country) {
  return Object.keys(CONTINENTS).find(k => CONTINENTS[k].includes(country)) || "Europe";
}
function compKey(season, cat) { return `${season}-${cat}`; }
function compOf(store, season, cat) { return ((store.intl || {})[compKey(season, cat)]) || null; }

// Calendrier « round-robin » d'un groupe sur 3 fenêtres (domicile alterné).
const RR = {
  4: [[[0, 1], [2, 3]], [[2, 0], [1, 3]], [[0, 3], [1, 2]]],
  3: [[[0, 1]], [[2, 0]], [[1, 2]]],
  2: [[[0, 1]], [[1, 0]], [[0, 1]]],
};
function groupSizes(n) {
  const k = Math.ceil(n / GROUP_MAX);
  const sizes = new Array(k).fill(Math.floor(n / k));
  for (let i = 0; i < n % k; i++) sizes[i]++;
  return sizes;
}
// Niveau d'une sélection (têtes de série) : moyenne des 12 meilleurs GEN.
function strengthOf(store, team, leagues, world, now) {
  const el = NT().eligiblePlayers(NT().configOf(store), team, leagues, world, now).players;
  const top = el.slice(0, 12);
  return top.length ? top.reduce((s, x) => s + x.ovr, 0) / top.length : 0;
}
// Tirage des groupes d'une saison et d'une catégorie (une fois).
function drawGroups(store, season, cat, comp, leagues, world, now, calendarStartAt) {
  const gs = NC().gatheringsOf(store, { id: `fr-${cat}`, country: "fr", cat }, season, calendarStartAt).filter(g => g.kind === "window");
  const groups = [];
  const matches = [];
  let letter = 0;
  for (const [continent, countries] of Object.entries(CONTINENTS)) {
    const teams = countries.map(c => store.teams[NT().teamIdOf(c, cat)]).filter(Boolean)
      .map(t => ({ id: t.id, s: strengthOf(store, t, leagues, world, now) }))
      .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));
    const k = groupSizes(teams.length).length;
    const buckets = Array.from({ length: k }, () => []);
    // Serpentin : les têtes de série réparties, puis les chapeaux suivants
    // (1-2-3, 3-2-1, 1-2-3…) : groupes de niveau proche.
    teams.forEach((t, i) => {
      const round = Math.floor(i / k), pos = i % k;
      buckets[round % 2 === 0 ? pos : k - 1 - pos].push(t.id);
    });
    buckets.forEach(ids => {
      const id = `g${String.fromCharCode(65 + letter++)}`;
      groups.push({ id, continent, label: `Groupe ${id.slice(1)}`, teams: ids });
      const rr = RR[ids.length] || [];
      rr.forEach((round, w) => round.forEach(([h, a]) => {
        const g = gs[w];
        if (!g) return;
        matches.push({ id: `${season}${cat}${id}w${w + 1}${h}${a}`, groupId: id, w: w + 1, gid: g.gid, home: ids[h], away: ids[a], at: g.startAt, status: "scheduled" });
      }));
    });
  }
  store.intl = store.intl || {};
  store.intl[compKey(season, cat)] = { season, cat, comp, drawnAt: now, groups, matches };
  return store.intl[compKey(season, cat)];
}

// --- Classement --------------------------------------------------------------
// Victoire 2 points, défaite 1 (forfait 0), comme au basket FIBA. Départage :
// points, confrontations directes entre égaux, différence, points marqués.
function standings(comp, groupId) {
  const g = comp.groups.find(x => x.id === groupId);
  if (!g) return [];
  const rows = new Map(g.teams.map(id => [id, { teamId: id, played: 0, wins: 0, losses: 0, points: 0, pf: 0, pa: 0, diff: 0 }]));
  const played = comp.matches.filter(m => m.groupId === groupId && m.status === "played");
  played.forEach(m => {
    const h = rows.get(m.home), a = rows.get(m.away);
    if (!h || !a) return;
    const homeWin = m.scoreHome > m.scoreAway;
    [[h, m.scoreHome, m.scoreAway, homeWin, m.forfeit === "home" || m.forfeit === "both"], [a, m.scoreAway, m.scoreHome, !homeWin, m.forfeit === "away" || m.forfeit === "both"]].forEach(([r, f, ag, won, ff]) => {
      r.played++; r.pf += f; r.pa += ag; r.diff = r.pf - r.pa;
      if (won) { r.wins++; r.points += 2; } else { r.losses++; r.points += ff ? 0 : 1; }
    });
  });
  const list = [...rows.values()];
  const h2h = (a, b) => {
    const tied = list.filter(x => x.points === a.points).map(x => x.teamId);
    let wa = 0, wb = 0;
    played.forEach(m => {
      if (!tied.includes(m.home) || !tied.includes(m.away)) return;
      const w = m.scoreHome > m.scoreAway ? m.home : m.away;
      if (w === a.teamId) wa++; if (w === b.teamId) wb++;
    });
    return wb - wa;
  };
  list.sort((a, b) => b.points - a.points || h2h(a, b) || b.diff - a.diff || b.pf - a.pf || a.teamId.localeCompare(b.teamId));
  list.forEach((r, i) => { r.rank = i + 1; });
  return list;
}
// Qualifiés pour la phase finale continentale (saison continentale) :
// Europe 2 premiers par groupe + 2 meilleurs 3es ; Amérique et Asie : tous.
// Renvoie { teamId: "qualified" | "consolation" } (+ `final` quand tous les
// matchs sont joués).
function qualification(comp) {
  const out = {};
  const done = comp.matches.every(m => m.status === "played");
  if (comp.comp !== "continental") return { status: {}, final: done };
  const byCont = {};
  comp.groups.forEach(g => { (byCont[g.continent] = byCont[g.continent] || []).push(g); });
  Object.entries(byCont).forEach(([cont, groups]) => {
    if (cont !== "Europe") { groups.forEach(g => g.teams.forEach(t => { out[t] = "qualified"; })); return; }
    const thirds = [];
    groups.forEach(g => standings(comp, g.id).forEach(r => {
      if (r.rank <= 2) out[r.teamId] = "qualified";
      else if (r.rank === 3) thirds.push(r);
      else out[r.teamId] = "consolation";
    }));
    // Meilleurs 3es : part de victoires, puis différence par match.
    const rate = r => (r.played ? r.wins / r.played : 0);
    thirds.sort((a, b) => rate(b) - rate(a) || (b.played ? b.diff / b.played : 0) - (a.played ? a.diff / a.played : 0) || b.pf - a.pf || a.teamId.localeCompare(b.teamId));
    thirds.forEach((r, i) => { out[r.teamId] = i < 2 ? "qualified" : "consolation"; });
  });
  return { status: out, final: done };
}

// --- Jouer un match -------------------------------------------------------
// Équipe « coquille » d'une sélection : les 12 joueurs du match (tactique
// du sélectionneur, sinon les meilleurs disponibles des 15), ids provisoires.
function buildSide(store, teamId, gid, leagues, world, at, tempIds) {
  const cfg = NT().configOf(store);
  const team = store.teams[teamId];
  const el = NT().eligiblePlayers(cfg, team, leagues, world, at).players;
  const byKey = new Map(el.map(x => [NC().refKey(NC().refOf(x.src)), x]));
  const conv = NC().convocationOf(store, teamId, gid);
  const fit = x => !(Engine.isCurrentlyInjured && Engine.isCurrentlyInjured(x.src, at));
  let pool = ((conv && conv.players) || []).map(r => byKey.get(NC().refKey(r))).filter(Boolean).filter(fit);
  // Pas de convocation (ne devrait pas arriver après le gel) : meilleurs disponibles.
  if (!pool.length) pool = NT().pickSquad(el.filter(fit), NC().LIMITS.convocation);
  const m = NT().activeMandate(store, teamId);
  const tactics = m && m.tactics;
  const nidOf = x => (m && m.nids ? m.nids[NC().refKey(NC().refOf(x.src))] : null);
  // Les 12 du match.
  let sheet = pool;
  const tl = tactics && tactics.lineup;
  if (tl && Array.isArray(tl.convoked) && tl.convoked.length) {
    const wanted = pool.filter(x => tl.convoked.includes(nidOf(x)));
    const rest = pool.filter(x => !wanted.includes(x)).sort((a, b) => b.ovr - a.ovr);
    sheet = wanted.concat(rest);
  } else sheet = pool.slice().sort((a, b) => b.ovr - a.ovr);
  sheet = sheet.slice(0, NC().LIMITS.matchSquad);
  const shell = Engine.generateTeam(NT().teamLabel(teamId), 1, team.country);
  shell.isHuman = false;
  shell.players = sheet.map(x => x.src);
  // Ids provisoires (uniques sur le match), remis par restoreIds.
  sheet.forEach(x => { const tmp = TEMP_ID_BASE + tempIds.size + 1; tempIds.set(tmp, { player: x.src, id: x.src.id, club: x.club }); x.src.id = tmp; });
  const tmpOf = x => x.src.id;
  const byNid = new Map(sheet.map(x => [nidOf(x), x]));
  // Tactique : réglages du sélectionneur, sinon ordres par défaut.
  const orders = tactics || NC().defaultOrders();
  (Engine.TACTIC_PRESET_FIELDS || ["offensivePriorities", "defense", "rhythm", "tacticalTier", "screenDefense", "helpDefense", "postDefense", "closeoutStyle", "offRebStyle", "endgameManagement"])
    .forEach(k => { if (orders[k] !== undefined) shell[k] = Array.isArray(orders[k]) ? [...orders[k]] : orders[k]; });
  shell.watchAssignments = Array.isArray(orders.watchAssignments) ? orders.watchAssignments.map(w => ({ ...w })) : [];
  const starters = {}, backupPositions = {};
  const used = new Set();
  NT().POSITIONS.forEach(pos => {
    const x = tl && tl.starters && tl.starters[pos] != null ? byNid.get(tl.starters[pos]) : null;
    if (x && !used.has(x)) { starters[pos] = tmpOf(x); used.add(x); }
  });
  NT().POSITIONS.forEach(pos => {
    if (starters[pos] != null) return;
    const cand = sheet.filter(x => !used.has(x)).sort((a, b) => ((b.src.position === pos) - (a.src.position === pos)) || b.ovr - a.ovr)[0];
    if (cand) { starters[pos] = tmpOf(cand); used.add(cand); }
  });
  sheet.filter(x => !used.has(x)).forEach(x => {
    const nid = nidOf(x);
    const pos = tl && tl.backupPositions && tl.backupPositions[nid] ? tl.backupPositions[nid] : [NT().POSITIONS.includes(x.src.position) ? x.src.position : "Meneur"];
    backupPositions[tmpOf(x)] = [...pos];
  });
  let minutes = null;
  if (tl && tl.minutes) {
    minutes = {};
    Object.entries(tl.minutes).forEach(([pos, mm]) => {
      Object.entries(mm).forEach(([nid, v]) => { const x = byNid.get(Number(nid)); if (x) { minutes[pos] = minutes[pos] || {}; minutes[pos][tmpOf(x)] = v; } });
    });
  }
  shell.lineup = { starters, backupPositions, convoked: sheet.map(tmpOf), ...(minutes ? { minutes } : {}) };
  return { shell, sheet, convoked: ((conv && conv.players) || []).slice() };
}
function boxOf(rows, tempIds) {
  return (rows || []).map(r => {
    const t = tempIds.get(r.id);
    return {
      ref: t ? { p: t.id, n: t.player.name } : null, name: r.name, position: r.position, min: r.min,
      pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf,
      fgm2: r.fgm2, fga2: r.fga2, fgm3: r.fgm3, fga3: r.fga3, ftm: r.ftm, fta: r.fta, plusMinus: r.plusMinus || 0, starter: r.starter || undefined,
      club: t ? { name: t.club.name, leagueId: t.club.leagueId, idx: t.club.idx } : null,
    };
  });
}
function playMatch(store, comp, m, leagues, world, now) {
  const tempIds = new Map();
  const injuries = [];
  let home, away;
  try {
    home = buildSide(store, m.home, m.gid, leagues, world, m.at, tempIds);
    away = buildSide(store, m.away, m.gid, leagues, world, m.at, tempIds);
    // Blessures : rangées dans le carnet du VRAI club une fois les ids remis.
    // Connaissance tactique des joueurs : celle de leur club, jamais touchée.
    [home.shell, away.shell].forEach(sh => { sh.recordInjury = entry => { injuries.push(entry); }; sh.syncCollectiveTrainingLog = () => {}; sh.updateTacticalKnowledge = () => {}; });
    const homeOk = home.shell.hasValidLineup(), awayOk = away.shell.hasValidLineup();
    if (homeOk && awayOk) {
      const tacticsUsed = { home: Engine.tacticsSnapshotFor(home.shell), away: Engine.tacticsSnapshotFor(away.shell) };
      const result = new Engine.MatchEngine(home.shell, away.shell, { homeAdvantage: true }).simulate(m.at);
      m.scoreHome = result.finalScore.A; m.scoreAway = result.finalScore.B;
      m.quarterScores = { home: result.quarterScores.A, away: result.quarterScores.B };
      m.boxHome = boxOf(result.boxScoreA, tempIds); m.boxAway = boxOf(result.boxScoreB, tempIds);
      // Fatigue normale (moteur des clubs), puis entrée retirée du journal.
      Engine.recordMatchStatsForTeam(home.shell, -1, "national", m.at, null, tacticsUsed.home);
      Engine.recordMatchStatsForTeam(away.shell, -1, "national", m.at, null, tacticsUsed.away);
    } else if (!homeOk && !awayOk) { m.forfeit = "both"; m.scoreHome = 0; m.scoreAway = 0; }
    else if (!homeOk) { m.forfeit = "home"; m.scoreHome = 0; m.scoreAway = Engine.FORFEIT_SCORE; }
    else { m.forfeit = "away"; m.scoreHome = Engine.FORFEIT_SCORE; m.scoreAway = 0; }
  } finally {
    // Ids d'origine remis quoi qu'il arrive.
    for (const t of tempIds.values()) t.player.id = t.id;
  }
  for (const t of tempIds.values()) {
    if (Array.isArray(t.player.matchLog)) t.player.matchLog = t.player.matchLog.filter(e => e.competition !== "national");
  }
  m.convokedHome = home ? home.convoked : [];
  m.convokedAway = away ? away.convoked : [];
  m.status = "played";
  m.playedAt = now;
  // Blessures : carnet et suivi du vrai club, managers prévenus.
  m.injuries = [];
  injuries.forEach(entry => {
    const t = tempIds.get(entry.playerId);
    if (!t) return;
    const lg = leagues.get(t.club.leagueId);
    const club = lg && lg.teams[t.club.idx];
    if (club && typeof club.recordInjury === "function") club.recordInjury({ ...entry, playerId: t.id, opponentName: entry.opponentName || null });
    m.injuries.push({ ref: { p: t.id, n: t.player.name }, type: entry.injuryType || "Blessure", until: t.player.injuryUntil || null });
    NT().notify(leagues, { leagueId: t.club.leagueId, idx: t.club.idx }, {
      key: `nat_inj_${m.id}_${t.id}`, title: `Blessé en sélection : ${t.player.name}`,
      text: `${t.player.name} s'est blessé avec ${NT().teamLabel(home && home.sheet.some(x => x.src === t.player) ? m.home : m.away)} (${entry.injuryType || "blessure"}).`,
    }, now);
  });
  // Résultat au sélectionneur de chaque équipe.
  [[m.home, m.scoreHome, m.scoreAway, m.away], [m.away, m.scoreAway, m.scoreHome, m.home]].forEach(([tid, pf, pa, opp]) => {
    const md = NT().activeMandate(store, tid);
    if (!md) return;
    NT().notify(leagues, md.ref, {
      key: `nat_res_${m.id}_${tid}`, title: `${NT().teamLabel(tid)} : ${pf > pa ? "victoire" : "défaite"} ${pf}-${pa} contre ${NT().teamLabel(opp)}`,
      text: `Fenêtre internationale ${m.w}, qualifications.`,
    }, now);
  });
  return m;
}

// --- Passage du rattrapage du monde ---------------------------------------
function step(store, leagues, world, now, season, calendarStartAt) {
  const cfg = NT().configOf(store);
  let changed = false;
  const due = [];
  if (!cfg.matchesLive || typeof calendarStartAt !== "number") return { changed, due };
  for (const cat of NT().CATEGORIES) {
    const pos = NT().cyclePos(cfg, season, cat);
    if (pos < 0) continue;
    let comp = compOf(store, season, cat);
    if (!comp) { comp = drawGroups(store, season, cat, cfg.cycle[pos].kind, leagues, world, now, calendarStartAt); changed = true; }
    for (const m of comp.matches) {
      if (m.status !== "scheduled") continue;
      if (now < m.at) { due.push(m.at); continue; }
      // Liste figée d'abord (si le passage du gel a été manqué).
      const g = NC().gatheringsOf(store, store.teams[m.home], season, calendarStartAt).find(x => x.gid === m.gid);
      [m.home, m.away].forEach(tid => {
        const conv = NC().convocationOf(store, tid, m.gid);
        if (g && !(conv && conv.frozenAt)) NC().freezeConvocation(store, store.teams[tid], g, NT().activeMandate(store, tid), leagues, world, now);
      });
      playMatch(store, comp, m, leagues, world, now);
      changed = true;
    }
  }
  // Historique : 3 saisons.
  Object.keys(store.intl || {}).forEach(k => { if (store.intl[k].season < season - 2) { delete store.intl[k]; changed = true; } });
  return { changed, due };
}

// --- Vues ---------------------------------------------------------------
function publicMatch(m) {
  return { id: m.id, groupId: m.groupId, w: m.w, home: m.home, away: m.away, at: m.at, status: m.status, scoreHome: m.scoreHome, scoreAway: m.scoreAway, forfeit: m.forfeit || null, quarterScores: m.quarterScores || null };
}
// Qualifications d'une sélection (page de la sélection) : son groupe, le
// classement, ses matchs, statut de qualification.
function qualifView(store, teamId, season) {
  const team = store.teams[teamId];
  if (!team) return null;
  const comp = compOf(store, season, team.cat);
  if (!comp) return null;
  const g = comp.groups.find(x => x.teams.includes(teamId));
  const q = qualification(comp);
  return {
    comp: comp.comp, season,
    group: g ? { id: g.id, label: g.label, continent: g.continent, standings: standings(comp, g.id).map(r => ({ ...r, label: NT().teamLabel(r.teamId), country: store.teams[r.teamId].country, status: q.final ? (q.status[r.teamId] || null) : null })) } : null,
    matches: comp.matches.filter(m => m.home === teamId || m.away === teamId).map(publicMatch),
    finalStatus: q.final ? (q.status[teamId] || null) : null,
  };
}
// Résultats d'une sélection (toutes saisons gardées), plus récents d'abord.
function resultsOf(store, teamId) {
  const out = [];
  Object.values(store.intl || {}).forEach(c => c.matches.forEach(m => {
    if (m.status === "played" && (m.home === teamId || m.away === teamId)) out.push({ ...publicMatch(m), season: c.season, comp: c.comp, cat: c.cat });
  }));
  return out.sort((a, b) => b.at - a.at);
}
function matchDetail(store, matchId) {
  for (const c of Object.values(store.intl || {})) {
    const m = c.matches.find(x => x.id === matchId);
    if (m) return { ...publicMatch(m), season: c.season, comp: c.comp, boxHome: m.boxHome || [], boxAway: m.boxAway || [], injuries: m.injuries || [], homeLabel: NT().teamLabel(m.home), awayLabel: NT().teamLabel(m.away), homeCountry: m.home.split("-")[0], awayCountry: m.away.split("-")[0] };
  }
  return null;
}

module.exports = { CONTINENTS, continentOf, compOf, groupSizes, drawGroups, standings, qualification, playMatch, step, qualifView, resultsOf, matchDetail };
