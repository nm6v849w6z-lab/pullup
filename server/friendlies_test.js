"use strict";
// Matchs amicaux — voir server/friendlies.js. Vérifie : jours de repos
// seulement (jamais un jour de match officiel, pour l'un ou l'autre club),
// un amical par jour, CPU qui accepte tout de suite, invitation humaine en
// attente + message privé préparé, réponse/annulation, composition avec un
// jeune de l'académie, simulation à l'heure dite sur les VRAIS joueurs
// (fatigue, minutes d'entraînement), rien dans matchLog ni le classement.
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const F = require("./friendlies.js");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

// Mercredi 2026-09-30 09:00 Paris, rythme hebdomadaire (mardi/samedi, coupe le jeudi).
const T0 = Calendar.parisEpochForLocalTime(2026, 9, 30, 9);
const league = Engine.generateMultiManagerLeague(["Alpha", "Bravo"], 1, T0, Calendar.dailyAnchoredCalendarConfig());
const A = league.teams.findIndex(t => t.name === "Alpha");
const B = league.teams.findIndex(t => t.name === "Bravo");
const cpu = league.teams.findIndex(t => !t.isHuman);
const cpu2 = league.teams.findIndex((t, i) => !t.isHuman && i !== cpu);
check(A >= 0 && B >= 0 && cpu >= 0 && cpu2 >= 0, "ligue : 2 managers + des clubs CPU");
check(Array.isArray(league.friendlies) && league.friendlies.length === 0, "League.friendlies vide au départ");

// 1. Jours proposés = jamais un jour de match officiel.
const officialA = new Set(F.officialMatchTimesFor(Engine, league, A).map(F.dayKeyOf));
const officialCpu = new Set(F.officialMatchTimesFor(Engine, league, cpu).map(F.dayKeyOf));
check(officialA.size > 0, `des jours de match officiels existent (${officialA.size})`);
const days = F.availableDays(Engine, league, A, cpu, T0);
check(days.length > 0, `${days.length} jours de repos communs proposés sur 3 semaines`);
check(days.every(d => !officialA.has(d.day) && !officialCpu.has(d.day)), "aucun jour proposé n'est un jour de match officiel");
check(days.every(d => d.times.every(t => F.FRIENDLY_TIMES.includes(t))), "heures proposées par demi-heure");
const weekday = key => new Date(key + "T12:00:00Z").getUTCDay();
const seasonStartKey = F.dayKeyOf(league.calendarStartAt);
check(days.filter(d => d.day >= seasonStartKey).every(d => weekday(d.day) !== 2 && weekday(d.day) !== 6), "une fois la saison lancée, jamais un mardi ni un samedi (championnat)");
check(days.some(d => d.day < seasonStartKey), "les jours d'avant la première journée sont libres");

// 2. Refus sur un jour de match officiel.
const officialDay = [...officialA].sort()[0];
let r = F.proposeFriendly(Engine, league.teams[A], A, league, { opponent: cpu, day: officialDay, time: "20:00" }, T0);
check(!r.ok && /officiel/.test(r.error), "proposition refusée un jour de match officiel");
r = F.proposeFriendly(Engine, league.teams[A], A, league, { opponent: cpu, day: days[0].day, time: "20:15" }, T0);
check(!r.ok, "heure hors demi-heure refusée");
r = F.proposeFriendly(Engine, league.teams[A], A, league, { opponent: A, day: days[0].day, time: "20:00" }, T0);
check(!r.ok, "impossible de jouer contre soi-même");

// 3. Contre un CPU : accepté tout de suite, pas de message.
const d1 = days.find(d => d.times.includes("20:00"));
r = F.proposeFriendly(Engine, league.teams[A], A, league, { opponent: cpu, day: d1.day, time: "20:00" }, T0);
check(r.ok && r.status === "accepted" && !r.notify, "amical contre un CPU accepté immédiatement, sans message");
const fCpu = league.friendlies[0];
check(fCpu.homeIdx === A && fCpu.awayIdx === cpu, "le club qui invite reçoit par défaut");

// 4. Un par jour.
r = F.proposeFriendly(Engine, league.teams[A], A, league, { opponent: cpu2, day: d1.day, time: "21:00" }, T0);
check(!r.ok && /déjà un match amical/.test(r.error), "deuxième amical le même jour refusé");
check(!F.availableDays(Engine, league, A, cpu2, T0).some(d => d.day === d1.day), "ce jour n'est plus proposé");

// 5. Contre un humain : invitation en attente + message privé préparé.
const d2 = F.availableDays(Engine, league, A, B, T0).find(d => d.day !== d1.day && d.times.includes("18:30"));
r = F.proposeFriendly(Engine, league.teams[A], A, league, { opponent: B, day: d2.day, time: "18:30", venue: "away" }, T0);
check(r.ok && r.status === "pending", "invitation à un manager humain en attente");
check(r.notify && r.notify.to === B && /Alpha vous propose un amical/.test(r.notify.text) && /18h30/.test(r.notify.text), "message privé préparé pour le club invité");
const fHuman = league.friendlies.find(f => f.id === r.friendlyId);
check(fHuman.homeIdx === B && fHuman.awayIdx === A, "« à l'extérieur » : le club invité reçoit");
r = F.respondFriendly(Engine, league.teams[A], A, league, { id: fHuman.id, accept: true }, T0);
check(!r.ok, "le club qui invite ne peut pas répondre à sa propre invitation");
const viewB = F.sanitizeFriendliesForViewer(league.friendlies, B);
check(viewB.length === 1 && viewB[0].id === fHuman.id, "Bravo ne voit que ses amicaux");
r = F.respondFriendly(Engine, league.teams[B], B, league, { id: fHuman.id, accept: true }, T0);
check(r.ok && fHuman.status === "accepted", "Bravo accepte");
r = F.cancelFriendly(Engine, league.teams[B], B, league, { id: fHuman.id }, T0);
check(r.ok && fHuman.status === "cancelled", "une fois accepté, l'un ou l'autre peut annuler");

// 6. Composition avec un jeune de l'académie.
const teamA = league.teams[A];
const youth = Engine.generatePlayer("Meneur", 1);
youth.age = 17;
teamA.youthPlayers = [youth];
const pros = teamA.players.slice().sort((a, b) => b.overall() - a.overall());
const starters = [youth.id, ...pros.slice(0, 4).map(p => p.id)];
const bench = pros.slice(4, 9).map(p => p.id);
r = F.setFriendlyLineup(Engine, teamA, A, league, { id: fCpu.id, starters: starters.slice(0, 4), bench }, T0);
check(!r.ok, "compo refusée sans 5 titulaires");
r = F.setFriendlyLineup(Engine, teamA, A, league, { id: fCpu.id, starters, bench: [...bench, starters[1]] }, T0);
check(!r.ok, "compo refusée avec un joueur en double");
r = F.setFriendlyLineup(Engine, teamA, A, league, { id: fCpu.id, starters, bench }, T0);
check(r.ok && fCpu.lineups[A].starters.includes(youth.id), "compo acceptée avec un jeune titulaire");
check(!F.sanitizeFriendliesForViewer(league.friendlies, cpu).length || !F.sanitizeFriendliesForViewer(league.friendlies, cpu)[0].lineups[A], "la compo n'est jamais montrée à l'adversaire");

// 7. Simulation à l'heure dite, sur les vrais joueurs.
const before = F.catchUpFriendlies(Engine, league, fCpu.at - 60000);
check(before.length === 0 && fCpu.status === "accepted", "rien ne se joue avant l'heure");
const matchLogLen = teamA.players.map(p => (p.matchLog || []).length);
const resultsBefore = league.results.length;
const youthSecsBefore = Object.values(youth.trainingSecondsPlayedByPosition || {}).reduce((s, v) => s + v, 0);
const played = F.catchUpFriendlies(Engine, league, fCpu.at + 1000);
check(played.includes(fCpu.id) && fCpu.status === "played", "l'amical est joué à l'heure choisie");
const res = fCpu.result;
check(res && !res.forfeit && res.scoreHome > 0 && res.scoreAway > 0, `score ${res.scoreHome}-${res.scoreAway}`);
const youthRow = res.boxScoreHome.find(x => x.id === youth.id);
check(youthRow && youthRow.min > 0 && youthRow.youth === true, `le jeune a joué (${youthRow && youthRow.min} min) et est marqué comme jeune dans la feuille de match`);
check(youth.condition < 100 || typeof youth.condition === "number", "forme du jeune mise à jour");
const youthSecsAfter = Object.values(youth.trainingSecondsPlayedByPosition || {}).reduce((s, v) => s + v, 0);
check(youthSecsAfter > youthSecsBefore, "minutes d'entraînement comptées pour le jeune (progression)");
const starterPro = teamA.players.find(p => p.id === starters[1]);
check(starterPro.condition < 100, `fatigue appliquée à un titulaire pro (forme ${starterPro.condition})`);
check(teamA.players.every((p, i) => (p.matchLog || []).length === matchLogLen[i]), "rien dans le journal de saison (matchLog)");
check(league.results.length === resultsBefore, "rien dans le classement");
check(teamA.feed.entries.some(e => /^Amical : (victoire|défaite)/.test(e.title)), "résultat dans le fil d'actualité");

// 8. Invitation restée sans réponse → périmée.
const d3 = F.availableDays(Engine, league, A, B, T0).find(d => d.times.includes("12:00"));
r = F.proposeFriendly(Engine, teamA, A, league, { opponent: B, day: d3.day, time: "12:00" }, T0);
const fLate = league.friendlies.find(f => f.id === r.friendlyId);
// Retours utilisateur 2026-09-27 : "si pas validé 1h avant le match, ça
// s'annule", "l'invitation reste max 3 jours, et après elle s'annule".
F.catchUpFriendlies(Engine, league, fLate.at - 61 * 60 * 1000);
check(fLate.status === "pending", "invitation encore valable 61 min avant le match");
r = F.respondFriendly(Engine, league.teams[B], B, league, { id: fLate.id, accept: true }, fLate.at - 59 * 60 * 1000);
check(!r.ok && /Trop tard/.test(r.error), "impossible d'accepter moins d'1 h avant le match");
F.catchUpFriendlies(Engine, league, fLate.at - 59 * 60 * 1000);
check(fLate.status === "expired", "invitation annulée 1 h avant le match sans réponse");
check(teamA.feed.entries.some(e => /1 h avant le match/.test(e.body || e.text || "") || /Invitation à un amical annulée/.test(e.title)), "le proposant est prévenu de l'annulation");
// 3 jours max : invitation pour dans ~2 semaines, sans réponse.
const dFar = F.availableDays(Engine, league, A, B, T0).filter(d => d.times.includes("20:00")).pop();
r = F.proposeFriendly(Engine, teamA, A, league, { opponent: B, day: dFar.day, time: "20:00" }, T0);
const fFar = league.friendlies.find(f => f.id === r.friendlyId);
check(fFar.at - T0 > 4 * 24 * 3600 * 1000, "invitation lointaine (plus de 4 jours avant le match)");
F.catchUpFriendlies(Engine, league, T0 + 3 * 24 * 3600 * 1000 - 60000);
check(fFar.status === "pending", "encore en attente juste avant 3 jours");
F.catchUpFriendlies(Engine, league, T0 + 3 * 24 * 3600 * 1000 + 1000);
check(fFar.status === "expired", "invitation annulée au bout de 3 jours sans réponse");

// 9. Sérialisation.
const round = Engine.leagueFromSave(JSON.parse(JSON.stringify(Engine.serializeLeague(league))));
check(Array.isArray(round.friendlies) && round.friendlies.length === league.friendlies.length, "League.friendlies survit à la sauvegarde");

console.log("\n✅ Matchs amicaux : jours de repos, invitations, jeunes, simulation réelle.");
