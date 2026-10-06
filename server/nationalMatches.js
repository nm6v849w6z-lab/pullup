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
// Phases finales : part de la forme perdue rendue aussitôt (récupération
// améliorée de la dernière semaine).
const FINAL_RECOVERY_SHARE = 0.5;
// Coupe du monde : places par continent (classement continental de la
// saison précédente), les autres jouent le tournoi de consolation.
const WORLD_SLOTS = { "Europe": 5, "Amérique": 2, "Asie": 1 };
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
// Lignes de box score : TOUTES les statistiques du moteur (comme un match
// de club : rebonds offensifs/défensifs, raquette, zones de tir, origine des
// points…), pour le box score, le direct et l'analyse (2026-10-06).
// `id` = id provisoire du match (celui du fil d'événements du direct).
function boxOf(rows, tempIds) {
  return (rows || []).map(r => {
    const t = tempIds.get(r.id);
    return {
      ...r, ref: t ? { p: t.id, n: t.player.name } : null, plusMinus: r.plusMinus || 0, starter: r.starter || undefined,
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
    // Phase finale (m.boost) : forme physique avant le match, pour la
    // récupération améliorée ci-dessous.
    const before = new Map();
    if (m.boost) [home, away].forEach(side => side.sheet.forEach(x => {
      try { before.set(x.src, Engine.currentCondition(x.src, m.at, side.shell.conditionRecoveryPerDay())); } catch (e) { /* forme brute */ }
    }));
    if (homeOk && awayOk) {
      const tacticsUsed = { home: Engine.tacticsSnapshotFor(home.shell), away: Engine.tacticsSnapshotFor(away.shell) };
      const result = new Engine.MatchEngine(home.shell, away.shell, { homeAdvantage: true }).simulate(m.at);
      m.scoreHome = result.finalScore.A; m.scoreAway = result.finalScore.B;
      m.quarterScores = { home: result.quarterScores.A, away: result.quarterScores.B };
      m.boxHome = boxOf(result.boxScoreA, tempIds); m.boxAway = boxOf(result.boxScoreB, tempIds);
      // Tactiques réellement jouées (analyse, comme tacticsUsed d'un club).
      m.tacticsUsed = tacticsUsed; m.seed = result.seed;
      // Fatigue normale (moteur des clubs), puis entrée retirée du journal.
      Engine.recordMatchStatsForTeam(home.shell, -1, "national", m.at, null, tacticsUsed.home);
      Engine.recordMatchStatsForTeam(away.shell, -1, "national", m.at, null, tacticsUsed.away);
      // Récupération améliorée, SEULEMENT pendant les phases finales de la
      // dernière semaine (retour utilisateur 2026-10-05) : la moitié de la
      // forme perdue sur le match est rendue aussitôt. La fatigue existe
      // toujours (rotation, profondeur de banc) ; les fenêtres gardent la
      // récupération normale.
      before.forEach((b, p) => {
        if (typeof b === "number" && typeof p.condition === "number" && p.condition < b) p.condition = Math.round(p.condition + (b - p.condition) * FINAL_RECOVERY_SHARE);
      });
    } else if (!homeOk && !awayOk) { m.forfeit = "both"; m.scoreHome = 0; m.scoreAway = 0; }
    else if (!homeOk) { m.forfeit = "home"; m.scoreHome = 0; m.scoreAway = Engine.FORFEIT_SCORE; }
    else { m.forfeit = "away"; m.scoreHome = Engine.FORFEIT_SCORE; m.scoreAway = 0; }
  } finally {
    // Ids d'origine remis quoi qu'il arrive.
    for (const t of tempIds.values()) t.player.id = t.id;
  }
  for (const t of tempIds.values()) {
    if (Array.isArray(t.player.matchLog)) t.player.matchLog = t.player.matchLog.filter(e => e.competition !== "national");
    // Compteurs du dernier match remis à zéro : un match de club en cours
    // de diffusion (Supercoupe) ne doit jamais reprendre ces stats.
    t.player.secondsPlayed = 0;
    t.player.secondsPlayedByPosition = {};
    if (typeof t.player.emptyStats === "function") t.player.stats = t.player.emptyStats();
  }
  // Sélections en carrière (phase E : « nouveaux internationaux » du bilan).
  if (m.boxHome || m.boxAway) {
    store.caps = store.caps || {};
    [[m.boxHome || [], m.home], [m.boxAway || [], m.away]].forEach(([box, tid]) => box.forEach(r => {
      if (!r.ref || !(r.min > 0)) return;
      const k = NC().refKey(r.ref);
      const c = store.caps[k] = store.caps[k] || { n: 0, first: { at: m.at, teamId: tid } };
      c.n++;
    }));
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
    // Notification du mode Sélectionneur (phase E), jamais dans le fil du club.
    NC().coachFeed(md, { key: `res_${m.id}`, kind: "result", at: now, title: `${NT().teamLabel(tid)} : ${pf > pa ? "victoire" : "défaite"} ${pf}-${pa} contre ${NT().teamLabel(opp)}`, text: m.label || `Fenêtre internationale ${m.w}, qualifications.`, matchId: m.id });
  });
  return m;
}

// =====================================================================
// PHASE D (2026-10-05) : phases finales de la dernière semaine (lundi →
// dimanche, 20h). Saison continentale : un tournoi par continent (qualifiés
// des fenêtres) + tournoi de consolation (Europe : les non-qualifiés).
// Saison Coupe du monde : Coupe du monde (5 européens, 2 américains, 1
// asiatique d'après le classement continental de la saison précédente) et
// tournoi de consolation (toutes les autres sélections) ; têtes de série =
// classement des groupes de la saison. Format selon le nombre d'équipes :
// poules (1 ou 2 groupes, un tour par jour dès le lundi), puis quarts le
// vendredi (8 équipes), demi-finales le samedi, finale et match pour la 3e
// place le dimanche. Récupération améliorée (m.boost), voir playMatch.
// store.finals["<saison>-<cat>"] = { season, cat, comp, tournaments: [...] }.
// =====================================================================
const KO_DAY = { qf: 4, sf: 5, final: 6, third: 6 };
// Tours d'un groupe (méthode du cercle) : liste de tours de [i, j].
function roundRobin(n) {
  const ids = [...Array(n).keys()];
  if (n % 2) ids.push(-1);
  const m = ids.length, rounds = [];
  for (let r = 0; r < m - 1; r++) {
    const pairs = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i], b = ids[m - 1 - i];
      if (a >= 0 && b >= 0) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}
// Format : nombre de groupes et taille du tableau final (8, 4, 2 ou 0).
function formatFor(n) {
  const groups = n >= 6 ? 2 : 1;
  const size = Math.ceil(n / groups);
  const rounds = size % 2 ? size : size - 1;
  if (n >= 8 && rounds <= KO_DAY.qf) return { groups, ko: 8, rounds };
  if (n >= 4 && rounds <= KO_DAY.sf) return { groups, ko: 4, rounds };
  if (n >= 2 && rounds <= KO_DAY.final) return { groups, ko: 2, rounds };
  return { groups: 1, ko: 0, rounds: n - 1 };
}
function finalsOf(store, season, cat) { return ((store.finals || {})[compKey(season, cat)]) || null; }
// Tournoi : équipes déjà classées (têtes de série d'abord).
function makeTournament(key, kind, label, seeds, days, cat, season) {
  const f = formatFor(seeds.length);
  const groups = Array.from({ length: f.groups }, (_, i) => ({ id: `${key}${String.fromCharCode(65 + i)}`, label: f.groups > 1 ? `Groupe ${String.fromCharCode(65 + i)}` : "Poule unique", teams: [] }));
  seeds.forEach((t, i) => { const r = Math.floor(i / f.groups), p = i % f.groups; groups[r % 2 ? f.groups - 1 - p : p].teams.push(t); });
  const matches = [];
  groups.forEach(g => roundRobin(g.teams.length).forEach((round, r) => round.forEach(([a, b]) => {
    matches.push({ id: `${season}${cat}${g.id}d${r}${a}${b}`, stage: "group", groupId: g.id, day: r, at: days[r], home: g.teams[a], away: g.teams[b], status: "scheduled", boost: true });
  })));
  return { key, kind, label, ko: f.ko, teams: seeds.slice(), groups, matches, ranking: null, champion: null };
}
// Classement d'un groupe de tournoi (mêmes règles que les qualifications).
function tGroupStandings(t, groupId) { return standings({ groups: t.groups, matches: t.matches.filter(m => m.stage === "group") }, groupId); }
function winnerOf(m) { return m.scoreHome > m.scoreAway ? m.home : m.away; }
function loserOf(m) { return m.scoreHome > m.scoreAway ? m.away : m.home; }
function koMatch(t, stage, n, home, away, days, season, cat) {
  return { id: `${season}${cat}${t.key}${stage}${n}`, stage, n, day: KO_DAY[stage], at: days[KO_DAY[stage]], home, away, status: "scheduled", boost: true, label: `${t.label} · ${({ qf: "quart de finale", sf: "demi-finale", final: "finale", third: "match pour la 3e place" })[stage]}` };
}
// Fait avancer un tournoi : tableau final créé quand l'étape précédente est
// terminée ; classement final quand tout est joué.
function advanceTournament(t, days, season, cat) {
  const done = st => t.matches.filter(m => m.stage === st).every(m => m.status === "played");
  const has = st => t.matches.some(m => m.stage === st);
  if (!done("group")) return false;
  const gs = t.groups.map(g => tGroupStandings(t, g.id).map(r => r.teamId));
  let changed = false;
  const add = m => { t.matches.push(m); changed = true; };
  if (t.ko === 8 && !has("qf")) {
    const [A, B] = gs;
    [[A[0], B[3]], [B[1], A[2]], [B[0], A[3]], [A[1], B[2]]].forEach((p, i) => add(koMatch(t, "qf", i + 1, p[0], p[1], days, season, cat)));
  }
  if (t.ko >= 4 && !has("sf") && (t.ko === 4 || (has("qf") && done("qf")))) {
    let pairs;
    if (t.ko === 8) { const q = n => winnerOf(t.matches.find(m => m.stage === "qf" && m.n === n)); pairs = [[q(1), q(2)], [q(3), q(4)]]; }
    else if (gs.length === 2) pairs = [[gs[0][0], gs[1][1]], [gs[1][0], gs[0][1]]];
    else pairs = [[gs[0][0], gs[0][3]], [gs[0][1], gs[0][2]]];
    pairs.forEach((p, i) => add(koMatch(t, "sf", i + 1, p[0], p[1], days, season, cat)));
  }
  if (t.ko >= 2 && !has("final")) {
    if (t.ko >= 4 && has("sf") && done("sf")) {
      const sf = t.matches.filter(m => m.stage === "sf").sort((a, b) => a.n - b.n);
      add(koMatch(t, "final", 1, winnerOf(sf[0]), winnerOf(sf[1]), days, season, cat));
      add(koMatch(t, "third", 1, loserOf(sf[0]), loserOf(sf[1]), days, season, cat));
    } else if (t.ko === 2) add(koMatch(t, "final", 1, gs[0][0], gs.length === 2 ? gs[1][0] : gs[0][1], days, season, cat));
  }
  if (!t.ranking && t.matches.every(m => m.status === "played") && (t.ko === 0 || has("final"))) {
    t.ranking = rankTournament(t, gs);
    t.champion = t.ranking[0];
    changed = true;
  }
  return changed;
}
// Classement final : finale, 3e place, puis élimination au tour le plus
// avancé (quarts, puis poules), départagés par le rang de poule et le bilan.
function rankTournament(t, gs) {
  const out = [];
  const push = id => { if (id && !out.includes(id)) out.push(id); };
  const fin = t.matches.find(m => m.stage === "final"), third = t.matches.find(m => m.stage === "third");
  if (fin) { push(winnerOf(fin)); push(loserOf(fin)); }
  if (third) { push(winnerOf(third)); push(loserOf(third)); }
  const sfLosers = t.matches.filter(m => m.stage === "sf").map(loserOf);
  sfLosers.forEach(push);
  const rows = new Map();
  gs.forEach(g => tGroupStandings(t, t.groups[gs.indexOf(g)].id).forEach(r => rows.set(r.teamId, r)));
  const byGroup = (a, b) => { const ra = rows.get(a), rb = rows.get(b); return (ra.rank - rb.rank) || (rb.played ? rb.wins / rb.played : 0) - (ra.played ? ra.wins / ra.played : 0) || rb.diff - ra.diff; };
  t.matches.filter(m => m.stage === "qf").map(loserOf).sort(byGroup).forEach(push);
  [...rows.keys()].filter(id => !out.includes(id)).sort(byGroup).forEach(push);
  return out;
}
// Classement des qualifications (têtes de série) : rang de groupe, puis
// part de victoires, différence par match.
function qualifRanking(comp, ids) {
  const rows = new Map();
  comp.groups.forEach(g => standings(comp, g.id).forEach(r => rows.set(r.teamId, r)));
  const rate = r => (r && r.played ? r.wins / r.played : 0);
  return ids.slice().sort((a, b) => {
    const ra = rows.get(a), rb = rows.get(b);
    return ((ra ? ra.rank : 9) - (rb ? rb.rank : 9)) || rate(rb) - rate(ra) || ((rb && rb.played ? rb.diff / rb.played : 0) - (ra && ra.played ? ra.diff / ra.played : 0)) || a.localeCompare(b);
  });
}
// Classement continental (saison précédente) : tournoi principal puis
// consolation ; à défaut, classement des qualifications de la saison.
function continentalRanking(store, season, cat, continent, comp) {
  const prev = finalsOf(store, season - 1, cat);
  const ids = CONTINENTS[continent].map(c => NT().teamIdOf(c, cat));
  if (prev && prev.comp === "continental") {
    const order = [];
    prev.tournaments.filter(t => t.continent === continent && t.ranking).sort((a, b) => (a.kind === "consolation") - (b.kind === "consolation")).forEach(t => t.ranking.forEach(id => { if (!order.includes(id)) order.push(id); }));
    ids.forEach(id => { if (!order.includes(id)) order.push(id); });
    return order.filter(id => ids.includes(id));
  }
  return qualifRanking(comp, ids);
}
function createFinals(store, season, cat, comp, days) {
  const tournaments = [];
  if (comp.comp === "continental") {
    const q = qualification(comp).status;
    for (const continent of Object.keys(CONTINENTS)) {
      const ids = CONTINENTS[continent].map(c => NT().teamIdOf(c, cat));
      const name = continent === "Europe" ? "Euro" : continent === "Amérique" ? "AmeriCup" : "Coupe d'Asie";
      const main = qualifRanking(comp, ids.filter(id => q[id] === "qualified"));
      const cons = qualifRanking(comp, ids.filter(id => q[id] === "consolation"));
      if (main.length) tournaments.push({ ...makeTournament(`${continent.slice(0, 2).toUpperCase()}M`, "continental", name, main, days, cat, season), continent });
      if (cons.length) tournaments.push({ ...makeTournament(`${continent.slice(0, 2).toUpperCase()}C`, "consolation", `${name} · consolation`, cons, days, cat, season), continent });
    }
  } else {
    const wc = [];
    for (const continent of Object.keys(CONTINENTS)) wc.push(...continentalRanking(store, season, cat, continent, comp).slice(0, WORLD_SLOTS[continent] || 0));
    const all = Object.values(CONTINENTS).flat().map(c => NT().teamIdOf(c, cat));
    tournaments.push(makeTournament("WCM", "world", "Coupe du monde", qualifRanking(comp, wc), days, cat, season));
    tournaments.push(makeTournament("WCC", "consolation", "Tournoi de consolation", qualifRanking(comp, all.filter(id => !wc.includes(id))), days, cat, season));
  }
  store.finals = store.finals || {};
  store.finals[compKey(season, cat)] = { season, cat, comp: comp.comp, tournaments };
  return store.finals[compKey(season, cat)];
}
function tournamentOf(store, season, cat, teamId) {
  const f = finalsOf(store, season, cat);
  return f ? f.tournaments.find(t => t.teams.includes(teamId)) || null : null;
}
// Encore en course (pas éliminé) dans un tournoi : avant la fin des poules
// tout le monde ; ensuite, les équipes du tableau final pas encore battues.
function aliveTeams(t) {
  if (t.ranking) return [];
  const group = t.matches.filter(m => m.stage === "group");
  if (!group.every(m => m.status === "played") || t.ko === 0) return t.teams.slice();
  const ko = t.matches.filter(m => m.stage !== "group" && m.stage !== "third");
  if (!ko.length) {
    const gs = t.groups.map(g => tGroupStandings(t, g.id).map(r => r.teamId));
    const per = t.ko / gs.length;
    return gs.flatMap(g => g.slice(0, per));
  }
  const out = new Set(ko.flatMap(m => [m.home, m.away]));
  ko.filter(m => m.status === "played").forEach(m => out.delete(loserOf(m)));
  return [...out];
}
// Règle de la Supercoupe (retour utilisateur 2026-10-05) : un joueur dont la
// sélection est encore en course (demi-finales et au-delà, tant qu'elle
// n'est pas éliminée) ne joue pas la Supercoupe du samedi ; éliminé avant
// les demi-finales, il la joue normalement. Renvoie l'ensemble des joueurs
// (refKey) retenus par leur sélection à l'instant `at`.
function unavailableAt(store, at) {
  const out = new Set();
  Object.values(store.finals || {}).forEach(f => f.tournaments.forEach(t => {
    const first = Math.min(...t.matches.map(m => m.at)), last = Math.max(...t.matches.map(m => m.at));
    if (!(at >= first - DAY_MS && at <= last + DAY_MS)) return;
    aliveTeams(t).forEach(teamId => {
      const conv = NC().convocationOf(store, teamId, `s${f.season}f`);
      ((conv && conv.players) || []).forEach(r => out.add(NC().refKey(r)));
    });
  }));
  return out;
}
const DAY_MS = 24 * 3600 * 1000;
// Palmarès d'une sélection.
function addHonours(store, f) {
  store.honours = store.honours || {};
  f.tournaments.forEach(t => (t.ranking || []).forEach((id, i) => {
    const list = store.honours[id] = store.honours[id] || [];
    if (list.some(h => h.season === f.season && h.key === t.key)) return;
    list.push({ season: f.season, key: t.key, kind: t.kind, label: t.label, rank: i + 1, of: t.ranking.length });
  }));
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
    // Phase D : phases finales de la dernière semaine, créées dès que les
    // qualifications sont terminées (avant le gel des convocations).
    const finalCal = NT().seasonCalendar(cfg, calendarStartAt, season, cat).find(c => c.kind === "final");
    if (!finalCal) continue;
    let fin = finalsOf(store, season, cat);
    if (!fin && comp.matches.every(m => m.status === "played")) { fin = createFinals(store, season, cat, comp, finalCal.days); changed = true; }
    if (!fin) { due.push(finalCal.days[0] - 3 * DAY_MS); continue; }
    let progress = true;
    while (progress) {
      progress = false;
      for (const t of fin.tournaments) {
        if (advanceTournament(t, finalCal.days, season, cat)) { changed = true; progress = true; }
        for (const m of t.matches) {
          if (m.status !== "scheduled") continue;
          if (now < m.at) { due.push(m.at); continue; }
          const g = NC().gatheringsOf(store, store.teams[m.home], season, calendarStartAt).find(x => x.kind === "final");
          [m.home, m.away].forEach(tid => {
            const conv = g && NC().convocationOf(store, tid, g.gid);
            if (g && !(conv && conv.frozenAt)) NC().freezeConvocation(store, store.teams[tid], g, NT().activeMandate(store, tid), leagues, world, now);
          });
          m.gid = g ? g.gid : `s${season}f`;
          m.label = m.label || `${t.label} · poule`;
          playMatch(store, fin, m, leagues, world, now);
          changed = true; progress = true;
        }
      }
    }
    if (fin.tournaments.every(t => t.ranking) && !fin.honoured) {
      addHonours(store, fin);
      fin.honoured = true;
      fin.tournaments.forEach(t => notifyChampion(store, t, leagues, now));
      changed = true;
    }
  }
  Object.keys(store.finals || {}).forEach(k => { if (store.finals[k].season < season - 2) { delete store.finals[k]; changed = true; } });
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
  Object.values(store.finals || {}).forEach(f => f.tournaments.forEach(t => t.matches.forEach(m => {
    if (m.status === "played" && (m.home === teamId || m.away === teamId)) out.push({ ...publicMatch(m), season: f.season, comp: t.kind, cat: f.cat, label: m.label || t.label, stage: m.stage });
  })));
  // Matchs amicaux internationaux (server/nationalFriendlies.js).
  (store.intlFriendlies || []).forEach(f => {
    if (f.status === "played" && (f.home === teamId || f.away === teamId)) out.push({ ...publicMatch(f), season: f.season, comp: "friendly", cat: f.cat, label: f.label || "Match amical international" });
  });
  return out.sort((a, b) => b.at - a.at);
}
function matchDetail(store, matchId) {
  const pools = Object.values(store.intl || {}).map(c => ({ season: c.season, comp: c.comp, matches: c.matches }))
    .concat(Object.values(store.finals || {}).flatMap(f => f.tournaments.map(t => ({ season: f.season, comp: t.kind, matches: t.matches }))))
    .concat((store.intlFriendlies || []).filter(f => f.status === "played").map(f => ({ season: f.season, comp: "friendly", matches: [f] })));
  for (const c of pools) {
    const m = c.matches.find(x => x.id === matchId);
    if (m) return { ...publicMatch(m), label: m.label || null, stage: m.stage || null, season: c.season, comp: c.comp, boxHome: m.boxHome || [], boxAway: m.boxAway || [], injuries: m.injuries || [], homeLabel: NT().teamLabel(m.home), awayLabel: NT().teamLabel(m.away), homeCountry: m.home.split("-")[0], awayCountry: m.away.split("-")[0] };
  }
  return null;
}

function notifyChampion(store, t, leagues, now) {
  (t.ranking || []).slice(0, 3).forEach((id, i) => {
    const md = NT().activeMandate(store, id);
    if (!md) return;
    NC().coachFeed(md, { key: `rank_${t.key}`, kind: "competition", at: now, title: `${NT().teamLabel(id)} : ${i === 0 ? "vainqueur" : i === 1 ? "finaliste" : "3e"} · ${t.label}`, text: `Classement final : ${i + 1}e sur ${t.ranking.length}.` });
  });
}
// Vue des phases finales d'une sélection (page de la sélection).
function finalsView(store, teamId, season) {
  const team = store.teams[teamId];
  if (!team) return null;
  const f = finalsOf(store, season, team.cat);
  if (!f) return null;
  const pub = t => ({
    key: t.key, kind: t.kind, label: t.label, ko: t.ko, continent: t.continent || null, champion: t.champion, ranking: t.ranking,
    groups: t.groups.map(g => ({ id: g.id, label: g.label, standings: tGroupStandings(t, g.id).map(r => ({ ...r, label: NT().teamLabel(r.teamId), country: r.teamId.split("-")[0] })) })),
    matches: t.matches.map(m => ({ ...publicMatch(m), stage: m.stage, n: m.n || null, day: m.day })),
    mine: t.teams.includes(teamId),
  });
  return { season, comp: f.comp, tournaments: f.tournaments.filter(t => t.teams.includes(teamId)).map(pub), others: f.tournaments.filter(t => !t.teams.includes(teamId)).map(t => ({ key: t.key, label: t.label, champion: t.champion })) };
}
function honoursOf(store, teamId) { return ((store.honours || {})[teamId] || []).slice().sort((a, b) => b.season - a.season || a.rank - b.rank); }
module.exports = { CONTINENTS, roundRobin, formatFor, finalsOf, createFinals, advanceTournament, tournamentOf, aliveTeams, unavailableAt, finalsView, honoursOf, FINAL_RECOVERY_SHARE, WORLD_SLOTS, continentOf, compOf, groupSizes, drawGroups, standings, qualification, playMatch, step, qualifView, resultsOf, matchDetail };
