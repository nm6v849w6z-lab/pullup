"use strict";
// Ligues privées (Premium) — voir server/privateLeague.js.
// Vérifie : garde Premium, création/adhésion/lancement, calendrier du
// vendredi 21h30, simulation sur copies (aucun effet sur les équipes
// réelles), avantage du terrain, classement, code réservé aux membres.
// Depuis le 2026-10-02, les ligues privées sont rangées au niveau du monde
// (stock « privateleagues », membres = références de club) : ce test les
// exerce dans un seul championnat ; voir world_private_league_test.js pour
// plusieurs pays et la migration des anciennes ligues.
const assert = require("assert");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const PL = require("./privateLeague.js");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// Mercredi 2026-09-30 09:00 Paris.
const T0 = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
const LID = "fr-1";
const league = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
const leagues = new Map([[LID, league]]);
const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
check(humans.length === 6, "6 clubs humains générés");
const meOf = (lg, i, lid = LID) => ({ league: lg, idx: i, ref: PL.refFor(lid, lg, i, "Division I") });
const me = i => meOf(league, i);
const store = PL.emptyStore();
const realIdx = (lp, slot) => lp.members[slot].idx;

// 1. Garde Premium.
let r = PL.createPrivateLeague(Engine, store, me(humans[0]), { name: "Coupe des Potes", size: 6, venue: "home" }, T0);
check(!r.ok && /Premium/.test(r.error), "création refusée sans Premium");
humans.forEach(i => { league.teams[i].isPaying = true; });

// 2. Création + validations.
r = PL.createPrivateLeague(Engine, store, me(humans[0]), { name: " ", size: 6, venue: "home" }, T0);
check(!r.ok, "nom vide refusé");
r = PL.createPrivateLeague(Engine, store, me(humans[0]), { name: "Coupe des Potes", size: 7, venue: "home" }, T0);
check(!r.ok, "taille 7 refusée");
r = PL.createPrivateLeague(Engine, store, me(humans[0]), { name: "Coupe des Potes", size: 6, venue: "home" }, T0);
check(r.ok, "création acceptée");
const lp = store.list[0];
check(lp.status === "open" && lp.code.length === 6 && lp.members.length === 1 && lp.members[0].leagueId === LID && lp.creator.idx === humans[0], "ligue ouverte avec un code de 6 caractères, créateur = premier membre");
r = PL.createPrivateLeague(Engine, store, me(humans[0]), { name: "Autre", size: 6, venue: "home" }, T0);
check(!r.ok && /déjà/.test(r.error), "un club ne peut pas être dans deux ligues actives");

// 3. Adhésion.
r = PL.joinPrivateLeague(Engine, store, me(humans[1]), { code: "ZZZZZZ" }, T0);
check(!r.ok, "code inconnu refusé");
for (let k = 1; k <= 3; k++) {
  r = PL.joinPrivateLeague(Engine, store, me(humans[k]), { code: lp.code.toLowerCase() }, T0);
  check(r.ok && !r.started, `club ${k + 1} rejoint (code insensible à la casse)`);
}
r = PL.joinPrivateLeague(Engine, store, me(humans[1]), { code: lp.code }, T0);
check(!r.ok, "double adhésion refusée");

// 4. Lancement anticipé par le créateur (4 clubs) → 6 journées (aller-retour
//    à 4), première le vendredi 2 octobre 2026 à 21h30 Paris.
r = PL.startPrivateLeague(Engine, store, me(humans[1]), { id: lp.id }, T0);
check(!r.ok, "seul le créateur peut lancer");
r = PL.startPrivateLeague(Engine, store, me(humans[0]), { id: lp.id }, T0);
check(r.ok && lp.status === "running", "lancement par le créateur");
check(lp.rounds.length === 6 && lp.rounds.every(rd => rd.matches.length === 2), "6 journées de 2 matchs");
const friday = Calendar.parisEpochForLocalTime(2026, 10, 2, 21, 30);
check(lp.rounds[0].dueAt === friday, "J1 le vendredi 2 octobre à 21h30 (Paris)");
check(lp.rounds[1].dueAt === Calendar.parisEpochForLocalTime(2026, 10, 9, 21, 30), "J2 une semaine plus tard");
check(Calendar.parisLocalDateParts(lp.rounds[4].dueAt).hour === 21 && Calendar.parisLocalDateParts(lp.rounds[4].dueAt).minute === 30, "21h30 conservé après le changement d'heure");
// Vendredis de ligue privée = jours de match (amicaux, entraînement).
{
  const Friendlies = require("./friendlies.js");
  league.worldPrivateLeagueTimes = PL.busyTimesByIdx(store, LID);
  check(!Friendlies.officialMatchTimesFor(Engine, league, humans[0]).includes(friday), "le vendredi de ligue privée ne compte pas comme jour de match du club");
  check(!Friendlies.officialMatchTimesFor(Engine, league, humans[5]).includes(friday), "… pas pour un club hors de la ligue");
  delete league.worldPrivateLeagueTimes;
}

// 5. Rien ne se joue avant l'heure.
let out = {};
PL.catchUp(Engine, store, leagues, friday - 1000, out);
check(out.played.length === 0 && lp.rounds[0].matches.every(m => !m.played), "rien avant le coup d'envoi");
check(PL.nextDeadline(store, friday - 1000) === friday, "échéance du rattrapage = coup d'envoi de la J1");

// 6. Simulation sur copies : instantané des équipes réelles avant/après.
const snapshotBefore = league.teams.map(t => JSON.stringify(Engine.serializeTeam(t)));
const feedCounts = league.teams.map(t => t.feed.entries.length);
out = {};
PL.catchUp(Engine, store, leagues, friday + 60 * 1000, out);
check(out.played.length === 1 && out.played[0].round === 0, "J1 jouée à l'heure");
lp.rounds[0].matches.forEach(m => {
  check(m.played && Number.isFinite(m.scoreHome) && Number.isFinite(m.scoreAway) && m.scoreHome !== m.scoreAway, `match ${m.home}-${m.away} a un score (${m.scoreHome}-${m.scoreAway})`);
  check(!m.forfeit && Array.isArray(m.boxScoreHome) && m.boxScoreHome.length >= 5 && m.quarterScores.home.length >= 4, "feuille de match et quarts-temps stockés");
});
const liveEnd = Math.max(...lp.rounds[0].matches.map(m => m.liveUntil));
check(lp.rounds[0].matches.every(m => m.kickoffAt === friday && m.liveUntil > friday + 20 * 60 * 1000), "chaque match a son direct, du coup d'envoi (21h30) jusqu'à liveUntil");
check(out.replays.length === 2 && out.replays.every(x => x.lpId === lp.id && /^lp:/.test(x.item.key) && x.item.entry.events.length > 50 && x.item.entry.kickoffAt === friday), "directs à ranger (clés lp:…) pour /api/private-league/live");
const during = PL.projectForViewer(store, LID, humans[0], friday + 5 * 60 * 1000).privateLeagues[0].rounds[0].matches;
check(during.every(m => m.live && !m.played && m.scoreHome === null && m.boxScoreHome === null), "pendant le direct : score et feuille cachés (live: true)");
check(lp.rounds[0].matches.every(m => league.teams[realIdx(lp, m.home)].feed.entries.length === feedCounts[realIdx(lp, m.home)]), "fil d'actu pas encore annoncé pendant le direct");
check(PL.nextDeadline(store, friday + 60 * 1000) > friday + 60 * 1000, "échéance suivante : fin de la diffusion");
PL.catchUp(Engine, store, leagues, liveEnd + 1000);
const after = PL.projectForViewer(store, LID, humans[0], liveEnd + 1000).privateLeagues[0].rounds[0].matches;
check(after.every(m => m.played && !m.live && Number.isFinite(m.scoreHome)), "après le direct : score visible");
const feedBumped = lp.rounds[0].matches.every(m => league.teams[realIdx(lp, m.home)].feed.entries.length === feedCounts[realIdx(lp, m.home)] + 1 && league.teams[realIdx(lp, m.away)].feed.entries.length === feedCounts[realIdx(lp, m.away)] + 1);
check(feedBumped, "une entrée de fil d'actu par club membre");
const snapshotAfter = league.teams.map(t => JSON.stringify(Engine.serializeTeam(t)));
league.teams.forEach((t, i) => {
  const a = JSON.parse(snapshotBefore[i]); const b = JSON.parse(snapshotAfter[i]);
  // Fil d'actu et historique des ordres (« partir d'un match », 2026-10-03) : seuls ajouts attendus.
  delete a.feed; delete b.feed; delete a.ordersHistory; delete b.ordersHistory;
  assert.deepStrictEqual(b, a, `l'équipe ${t.name} ne doit pas changer`);
});
check(true, "aucune équipe réelle modifiée (forme, fatigue, blessures, entraînement, budget, matchLog, alchimie...)");
out = {};
PL.catchUp(Engine, store, leagues, friday + 60 * 1000, out);
check(out.played.length === 0, "pas de double simulation");

// 6b. Championnat d'un membre illisible ce passage-ci : la journée attend.
{
  const j2 = lp.rounds[1];
  const o = {};
  PL.catchUp(Engine, store, new Map(), j2.dueAt + 1000, o);
  check(o.played.length === 0 && j2.matches.every(m => !m.played), "ligue d'un membre indisponible : journée reportée, jamais un forfait");
}

// 7. Classement (places de members, ou index locaux de la vue projetée).
const table = PL.privateLeagueStandings(lp);
check(table.length === 4 && table[0].rank === 1 && table.every(rw => rw.played === 1) && table[0].pts === 2, "classement : 4 lignes, une journée jouée, leader à 2 pts");
const viewTable = PL.privateLeagueStandings(PL.projectForViewer(store, LID, humans[0], liveEnd + 1000).privateLeagues[0]);
check(viewTable.every(rw => humans.includes(rw.idx)), "classement de la vue : index des clubs dans la ligue du manager");

// 8. Avantage du terrain : facteur posé sur chaque joueur.
{
  const base = league.teams[humans[0]];
  const h = Engine.teamFromSave(Engine.serializeTeam(base)), a = Engine.teamFromSave(Engine.serializeTeam(base));
  new Engine.MatchEngine(h, a, { homeAdvantage: true }).simulate(T0);
  check(h.players.every(p => p.matchVenueFactor === 1.02) && a.players.every(p => Math.abs(p.matchVenueFactor - 0.98) < 1e-9), "avantage du terrain : x1,02 pour le receveur, x0,98 pour le visiteur");
  const h2 = Engine.teamFromSave(Engine.serializeTeam(base)), a2 = Engine.teamFromSave(Engine.serializeTeam(base));
  new Engine.MatchEngine(h2, a2).simulate(T0);
  check(h2.players.every(p => p.matchVenueFactor === 1) && a2.players.every(p => p.matchVenueFactor === 1), "sans option : aucun avantage (championnat/Coupe inchangés)");
  const p = h2.players[0];
  const before = p.eff("midRange");
  p.matchVenueFactor = 1.02;
  check(Math.abs(p.eff("midRange") - before * 1.02) < 1e-6 || p.eff("midRange") === 130, "Player.eff applique le facteur de terrain");
}

// 9. Fin de ligue + purge.
lp.rounds.forEach(rd => { PL.catchUp(Engine, store, leagues, rd.dueAt + 1000); PL.catchUp(Engine, store, leagues, rd.dueAt + 3 * 3600 * 1000); });
check(lp.status === "finished" && typeof lp.finishedAt === "number", "ligue terminée une fois toutes les journées jouées");
check(PL.activeFor(store, LID, humans[0]) === null, "le club redevient libre");
PL.catchUp(Engine, store, leagues, lp.finishedAt + PL.PRIVATE_LEAGUE_FINISHED_RETENTION_MS + 1);
check(store.list.length === 0, "ligue purgée après la période de rétention");

// 10. Adhésion auto-lance quand complète + ligue visible des seuls membres.
r = PL.createPrivateLeague(Engine, store, me(humans[0]), { name: "Duo", size: 6, venue: "neutral" }, T0);
const lp2 = store.list[0];
for (let k = 1; k <= 5; k++) r = PL.joinPrivateLeague(Engine, store, me(humans[k]), { code: lp2.code }, T0);
check(r.ok && r.started && lp2.status === "running" && lp2.rounds.length === 10, "6e adhésion → lancement automatique, 10 journées");
const cpuIdx = league.teams.findIndex(t => !t.isHuman);
check(PL.projectForViewer(store, LID, cpuIdx).privateLeagues.length === 0 && PL.projectForViewer(store, LID, humans[2]).privateLeagues[0].code === lp2.code, "ligue (et code) envoyée aux seuls membres");

// 10b. Heure des matchs au choix du créateur (retour utilisateur 2026-09-26).
{
  const lg = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
  const st = PL.emptyStore();
  const hs = lg.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  hs.forEach(i => { lg.teams[i].isPaying = true; });
  let rr = PL.createPrivateLeague(Engine, st, meOf(lg, hs[0]), { name: "Heure", size: 6, venue: "home", time: "21:15" }, T0);
  check(!rr.ok && /Heure/.test(rr.error), "heure hors liste (21:15) refusée");
  rr = PL.createPrivateLeague(Engine, st, meOf(lg, hs[0]), { name: "Heure", size: 6, venue: "home", time: "18:00" }, T0);
  const lpT = st.list[0];
  check(rr.ok && lpT.hour === 18 && lpT.minute === 0, "heure 18h00 enregistrée sur la ligue");
  for (let k = 1; k <= 5; k++) PL.joinPrivateLeague(Engine, st, meOf(lg, hs[k]), { code: lpT.code }, T0);
  check(lpT.rounds[0].dueAt === Calendar.parisEpochForLocalTime(2026, 10, 2, 18, 0), "J1 le vendredi à 18h00");
  const p5 = Calendar.parisLocalDateParts(lpT.rounds[5].dueAt);
  check(p5.hour === 18 && p5.minute === 0, "18h00 conservé après le changement d'heure");
  delete lpT.hour; delete lpT.minute; lpT.status = "open"; lpT.rounds = [];
  PL.startPrivateLeagueNow(Engine, lpT, T0);
  check(lpT.rounds[0].dueAt === Calendar.parisEpochForLocalTime(2026, 10, 2, 21, 30), "ligue sans heure (ancienne sauvegarde) → 21h30");
  check(PL.normalizeTime(undefined).hour === 21 && PL.normalizeTime("08:00").hour === 8 && PL.normalizeTime("07:30") === null, "normalizeTime : défaut 21h30, 08h00 accepté, 07h30 refusé");
}

// 10c. Ligue à 4 équipes : lancement automatique à la 4e adhésion ;
// départ d'un membre et dissolution par le créateur.
{
  const lg = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
  const st = PL.emptyStore();
  const hs = lg.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  hs.forEach(i => { lg.teams[i].isPaying = true; });
  let rr = PL.createPrivateLeague(Engine, st, meOf(lg, hs[0]), { name: "Carré", size: 4, venue: "neutral" }, T0);
  check(rr.ok, "création d'une ligue à 4 équipes acceptée");
  const lp4 = st.list[0];
  PL.joinPrivateLeague(Engine, st, meOf(lg, hs[1]), { code: lp4.code }, T0);
  rr = PL.leavePrivateLeague(Engine, st, meOf(lg, hs[1]), { id: lp4.id }, T0);
  check(rr.ok && !rr.dissolved && lp4.members.length === 1, "un membre quitte la ligue ouverte");
  for (let k = 1; k <= 3; k++) rr = PL.joinPrivateLeague(Engine, st, meOf(lg, hs[k]), { code: lp4.code }, T0);
  check(rr.ok && rr.started && lp4.status === "running" && lp4.rounds.length === 6 && lp4.rounds.every(rd => rd.matches.length === 2), "4e adhésion → lancement automatique, 6 journées de 2 matchs");
  rr = PL.joinPrivateLeague(Engine, st, meOf(lg, hs[4]), { code: lp4.code }, T0);
  check(!rr.ok && /déjà commencé/.test(rr.error), "5e club refusé (ligue à 4 complète et lancée)");
  rr = PL.leavePrivateLeague(Engine, st, meOf(lg, hs[1]), { id: lp4.id }, T0);
  check(!rr.ok, "impossible de quitter une ligue lancée");
  rr = PL.createPrivateLeague(Engine, st, meOf(lg, hs[4]), { name: "Solo", size: 4, venue: "home" }, T0);
  rr = PL.leavePrivateLeague(Engine, st, meOf(lg, hs[4]), { id: st.list[1].id }, T0);
  check(rr.ok && rr.dissolved && st.list.length === 1, "le créateur qui part dissout la ligue");
}

// 10d. Montée/descente : les références suivent le club dans sa nouvelle
// division (échange de places entre deux championnats).
{
  const st = { version: 1, list: [{ id: "x", status: "running", creator: { leagueId: "fr-2", idx: 3 }, members: [{ leagueId: "fr-2", idx: 3, name: "Up" }, { leagueId: "fr-1", idx: 7, name: "Down" }, { leagueId: "fr-1", idx: 1, name: "Stay" }], rounds: [] }] };
  check(PL.remapMoves(st, [{ up: { leagueId: "fr-2", idx: 3 }, down: { leagueId: "fr-1", idx: 7 } }]), "montée/descente appliquée aux membres");
  const [a, b, c] = st.list[0].members;
  check(a.leagueId === "fr-1" && a.idx === 7 && b.leagueId === "fr-2" && b.idx === 3 && c.idx === 1 && st.list[0].creator.leagueId === "fr-1" && st.list[0].creator.idx === 7, "le promu et le relégué changent de championnat, le créateur aussi");
}

// 11. Ancien champ de la ligue (avant les ligues « monde ») : toujours lu
// et écrit par le moteur, pour la migration (voir world_private_league_test.js).
league.privateLeagues = [{ id: "abc123", name: "Ancienne", code: "AAAAAA", teamIndices: [humans[0]], rounds: [] }];
const rebuilt = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
check(Array.isArray(rebuilt.privateLeagues) && rebuilt.privateLeagues[0].id === "abc123", "privateLeagues survit à serializeLeague/leagueFromSave");
const legacy = Engine.leagueFromSave(JSON.parse(JSON.stringify({ ...Engine.serializeLeague(league), privateLeagues: undefined })));
check(Array.isArray(legacy.privateLeagues) && legacy.privateLeagues.length === 0, "ancienne sauvegarde sans le champ → []");

console.log("\n✅ private_league_test.js : tout est vert");
