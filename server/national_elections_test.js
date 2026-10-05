// Sélections nationales — phase A (server/nationalTeams.js) : élections et
// mandats. Règles de l'utilisateur (2026-10-05) : A et U21 jamais élues la
// même saison ; élection pendant la 1re semaine d'une saison ; on se
// présente où l'on veut, on ne vote que dans le pays de son club.
const assert = require("assert");
const store = require("./store.js");
const N = require("./nationalTeams.js");
const ok = m => console.log("✅ " + m);
const DAY = 864e5;

function makeWorld(seasonNumber, calendarStartAt) {
  const fr = store.createMultiManagerCareer(["Lyon NT", "Paris NT", "Nice NT"], calendarStartAt).league;
  const es = store.createMultiManagerCareer(["Madrid NT", "Sevilla NT"], calendarStartAt).league;
  [fr, es].forEach(lg => { lg.seasonNumber = seasonNumber; lg.calendarStartAt = calendarStartAt; lg.teams.forEach(t => { if (t.isHuman) t.lastSeenAt = calendarStartAt; }); });
  fr.country = "fr"; es.country = "es";
  const leagues = new Map([["fr-1", fr], ["es-1", es]]);
  const world = { leagues: [{ id: "fr-1", country: "fr", level: 1, group: 0 }, { id: "es-1", country: "es", level: 1, group: 0 }] };
  return { fr, es, leagues, world };
}
const me = (w, id, idx) => N.managerOf(id, w.leagues.get(id), idx, w.world);

// 1) Calendrier : 1er passage en cours de saison → cycle à la saison suivante.
{
  const start = Date.UTC(2026, 9, 6, 0);
  const w = makeWorld(1, start);
  const st = N.emptyStore();
  N.step(st, w.leagues, w.world, start + 10 * DAY);
  assert.strictEqual(st.config.cycleStartSeason, 2, "lancé en cours de saison : cycle à la saison 2");
  assert.strictEqual(st.elections.length, 0, "aucune élection hors 1re semaine");
  // Saison 2, 1re semaine : seulement les sélections A.
  w.leagues.forEach(lg => { lg.seasonNumber = 2; lg.calendarStartAt = start + 84 * DAY; });
  N.step(st, w.leagues, w.world, start + 84 * DAY + 3600e3);
  const s2 = st.elections.map(e => e.teamId);
  assert.ok(s2.length === 17 && s2.every(id => id.endsWith("-A")), "saison 2 : élections A seulement (17 pays)");
  const fra = st.elections.find(e => e.teamId === "fr-A");
  assert.strictEqual(fra.voteAt, start + 84 * DAY + 3 * DAY, "candidatures jusqu'au jour 3");
  assert.strictEqual(fra.closesAt, start + 84 * DAY + 6 * DAY, "vote jusqu'au jour 6 (avant le premier lundi)");
  assert.deepStrictEqual(fra.mandate, { fromSeason: 2, toSeason: 3 }, "mandat de 2 saisons : continentale puis Coupe du monde");
  // Saison 3 : les U21 (jamais la même saison que les A).
  const st3 = N.emptyStore(); st3.config = { cycleStartSeason: 2 };
  w.leagues.forEach(lg => { lg.seasonNumber = 3; lg.calendarStartAt = start + 168 * DAY; });
  N.step(st3, w.leagues, w.world, start + 168 * DAY + 3600e3);
  assert.ok(st3.elections.length === 17 && st3.elections.every(e => e.teamId.endsWith("-U21")), "saison 3 : élections U21 seulement");
  assert.deepStrictEqual(st3.elections[0].mandate, { fromSeason: 3, toSeason: 4 });
  // Alternance : A les saisons 2, 4, 6… ; U21 les saisons 3, 5, 7…
  const c = N.configOf(st3);
  assert.deepStrictEqual([2, 3, 4, 5, 6, 7].map(sn => N.isElectionSeason(c, sn, "A")), [true, false, true, false, true, false]);
  assert.deepStrictEqual([2, 3, 4, 5, 6, 7].map(sn => N.isElectionSeason(c, sn, "U21")), [false, true, false, true, false, true]);
  assert.deepStrictEqual([2, 3].map(sn => c.cycle[N.cyclePos(c, sn, "A")].kind), ["continental", "world"], "saison 1 du mandat : continentale, saison 2 : Coupe du monde / consolante");
  // Notification aux électeurs du pays.
  assert.ok(w.fr.teams[0].feed.entries.some(e => /Élection du sélectionneur : France U21/.test(e.title)));
  ok("élections A et U21 en saisons différentes, pendant la 1re semaine (candidatures j0-j3, vote j3-j6), mandat de 2 saisons (continentale, puis Coupe du monde ou consolante), A et U21 en alternance");
}

// 2) Candidatures, vote, résultat, cas particuliers.
{
  const start = Date.UTC(2027, 0, 5, 0);
  const w = makeWorld(2, start);
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  let now = start + 3600e3;
  N.step(st, w.leagues, w.world, now);
  const elFr = N.currentElection(st, "fr-A");
  const lyon = me(w, "fr-1", 0), paris = me(w, "fr-1", 1), nice = me(w, "fr-1", 2), madrid = me(w, "es-1", 0), sevilla = me(w, "es-1", 1);
  const run = (m, teamId, title = "Défense et jeunesse", project = "Construire une équipe autour de la défense et des jeunes.") => N.runForElection(st, m, { teamId, title, project }, now);
  assert.ok(run(lyon, "fr-A").ok);
  assert.ok(run(madrid, "fr-A", "Un Espagnol pour la France", "Un projet offensif et ambitieux pour la France.").ok, "un manager d'un autre pays peut se présenter en France");
  assert.ok(!run(lyon, "fr-A").ok, "pas deux candidatures");
  assert.ok(!run(lyon, "es-A").ok, "une candidature à la fois");
  assert.ok(!run(paris, "fr-A", "x", "court").ok, "titre et projet obligatoires");
  assert.ok(!N.castVote(st, nice, { electionId: elFr.id, candidateId: elFr.candidates[0].id }, now).ok, "pas de vote pendant les candidatures");
  // Passage au vote.
  now = elFr.voteAt + 1000;
  N.step(st, w.leagues, w.world, now);
  assert.strictEqual(elFr.status, "vote");
  assert.ok(!run(paris, "fr-A").ok, "candidatures closes");
  const [cLyon, cMadrid] = elFr.candidates;
  assert.ok(N.castVote(st, paris, { electionId: elFr.id, candidateId: cLyon.id }, now).ok, "un Français vote en France");
  assert.ok(!N.castVote(st, paris, { electionId: elFr.id, candidateId: cMadrid.id }, now).ok, "vote définitif");
  assert.ok(!N.castVote(st, madrid, { electionId: elFr.id, candidateId: cMadrid.id }, now).ok, "un Espagnol ne vote pas en France");
  assert.ok(N.castVote(st, nice, { electionId: elFr.id, candidateId: cMadrid.id }, now).ok);
  assert.ok(N.castVote(st, lyon, { electionId: elFr.id, candidateId: cLyon.id }, now).ok, "un candidat français vote aussi");
  const view = N.publicElection(st, elFr, nice, true);
  assert.ok(view.result === null && view.candidates.every(c => c.project), "décompte caché pendant le vote, projets complets");
  assert.strictEqual(view.me.votedFor, cMadrid.id);
  // Clôture.
  now = elFr.closesAt + 1000;
  assert.ok(!N.castVote(st, nice, { electionId: elFr.id, candidateId: cLyon.id }, now).ok, "pas de vote après la fermeture");
  N.step(st, w.leagues, w.world, now);
  assert.strictEqual(elFr.status, "closed");
  assert.strictEqual(elFr.result.winnerId, cLyon.id);
  assert.deepStrictEqual(elFr.result.counts.map(c => c.votes), [2, 1]);
  const m = N.activeMandate(st, "fr-A");
  assert.ok(m && m.key === lyon.key && m.votes === 2 && m.fromSeason === 2 && m.toSeason === 3);
  assert.ok(w.fr.teams[0].feed.entries.some(e => /Vous êtes élu sélectionneur : France A/.test(e.title)));
  ok("candidatures (n'importe quel pays), vote unique et définitif, réservé aux clubs du pays, fermé hors période ; résultat, nomination, notification");

  // Espagne : égalité (départage), électeur devenu inéligible, retrait.
}
{
  const start = Date.UTC(2027, 0, 5, 0);
  const w = makeWorld(2, start);
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  let now = start + 3600e3;
  N.step(st, w.leagues, w.world, now);
  const el = N.currentElection(st, "es-A");
  const madrid = me(w, "es-1", 0), sevilla = me(w, "es-1", 1), lyon = me(w, "fr-1", 0), paris = me(w, "fr-1", 1);
  N.runForElection(st, lyon, { teamId: "es-A", title: "Un Lyonnais à Madrid", project: "Projet européen, défense et rythme." }, now);
  N.runForElection(st, paris, { teamId: "es-A", title: "Un Parisien à Madrid", project: "Projet européen, attaque et jeunesse." }, now + 1000);
  now = el.voteAt + 1;
  N.step(st, w.leagues, w.world, now);
  const [c1, c2] = el.candidates;
  N.castVote(st, madrid, { electionId: el.id, candidateId: c1.id }, now);
  N.castVote(st, sevilla, { electionId: el.id, candidateId: c2.id }, now);
  w.leagues.get("fr-1").teams[1].managerRating = 1600; // Paris mieux noté
  now = el.closesAt + 1;
  N.step(st, w.leagues, w.world, now);
  assert.ok(el.result.tie && el.result.winnerId === c2.id, "égalité 1-1 : départage par la note des managers");
  ok("égalité : départage configurable (note des managers, puis candidature la plus ancienne, puis tirage stable)");
}
{
  // Aucun candidat, candidat seul, retrait, candidat qui quitte le jeu, électeur devenu inéligible.
  const start = Date.UTC(2027, 0, 5, 0);
  const w = makeWorld(2, start);
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  let now = start + 3600e3;
  N.step(st, w.leagues, w.world, now);
  const elFr = N.currentElection(st, "fr-A"), elEs = N.currentElection(st, "es-A");
  const lyon = me(w, "fr-1", 0), paris = me(w, "fr-1", 1), nice = me(w, "fr-1", 2), madrid = me(w, "es-1", 0);
  N.runForElection(st, lyon, { teamId: "fr-A", title: "Projet Lyon", project: "Défense, jeunesse et ambition pour la France." }, now);
  N.runForElection(st, paris, { teamId: "fr-A", title: "Projet Paris", project: "Attaque, spectacle et ambition pour la France." }, now);
  N.runForElection(st, madrid, { teamId: "es-A", title: "Projet Madrid", project: "Un seul candidat pour l'Espagne cette fois." }, now);
  now = elFr.voteAt + 1;
  N.step(st, w.leagues, w.world, now);
  const [cl, cp] = elFr.candidates;
  N.castVote(st, nice, { electionId: elFr.id, candidateId: cp.id }, now);
  // Paris retire sa candidature : le vote de Nice est rendu, Nice revote.
  assert.ok(N.withdrawCandidacy(st, paris, { electionId: elFr.id }, now).ok);
  assert.ok(N.castVote(st, nice, { electionId: elFr.id, candidateId: cl.id }, now).ok, "vote rendu après retrait du candidat");
  // Nice perd son club (manager parti) : son vote ne compte plus.
  w.fr.teams[2].managerLinkToken = "nouveau-manager-token";
  now = elFr.closesAt + 1;
  N.step(st, w.leagues, w.world, now);
  assert.strictEqual(elFr.result.winnerId, cl.id);
  assert.strictEqual(elFr.result.voters, 0, "vote d'un électeur devenu inéligible écarté");
  assert.strictEqual(elEs.result.winnerId, elEs.candidates[0].id, "candidat seul : élu");
  // Aucun candidat : élection sans vainqueur, intérim jusqu'à la prochaine saison d'élection.
  const elDe = N.currentElection(st, "de-A") || st.elections.find(e => e.teamId === "de-A");
  assert.strictEqual(elDe.status, "noCandidate");
  N.step(st, w.leagues, w.world, now + DAY);
  assert.strictEqual(st.elections.filter(e => e.teamId === "de-A").length, 1, "pas de nouvelle élection hors 1re semaine (intérim)");
  ok("aucun candidat (intérim), candidat seul élu, retrait (votes rendus), électeur devenu inéligible écarté");

  // Candidat qui quitte le jeu avant la clôture.
  const st2 = N.emptyStore(); st2.config = { cycleStartSeason: 2 };
  const w2 = makeWorld(2, start);
  N.step(st2, w2.leagues, w2.world, start + 3600e3);
  const e2 = N.currentElection(st2, "fr-A");
  N.runForElection(st2, me(w2, "fr-1", 0), { teamId: "fr-A", title: "Projet Lyon", project: "Défense, jeunesse et ambition pour la France." }, start + 3600e3);
  N.step(st2, w2.leagues, w2.world, e2.voteAt + 1);
  w2.fr.teams[0].isHuman = false; w2.fr.teams[0].managerLinkToken = null;
  N.step(st2, w2.leagues, w2.world, e2.closesAt + 1);
  assert.strictEqual(e2.status, "noCandidate", "candidat parti : aucun élu");
  ok("candidat qui quitte le jeu : candidature annulée, pas d'élu fantôme");
}
{
  // Mandat : terme, démission, inactivité, club perdu, destitution.
  const start = Date.UTC(2027, 0, 5, 0);
  const w = makeWorld(2, start);
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  const lyon = me(w, "fr-1", 0);
  const elect = (teamId, m) => {
    let now = start + 3600e3;
    N.step(st, w.leagues, w.world, now);
    const el = N.currentElection(st, teamId);
    N.runForElection(st, m, { teamId, title: "Projet", project: "Un projet assez long pour la sélection nationale." }, now);
    N.step(st, w.leagues, w.world, el.closesAt + 1);
    return N.activeMandate(st, teamId);
  };
  const m = elect("fr-A", lyon);
  assert.ok(m);
  assert.ok(!N.runForElection(st, lyon, { teamId: "it-A", title: "x2", project: "Encore un projet pour un deuxième poste." }, start).ok, "un seul mandat à la fois");
  // Démission.
  assert.ok(N.resign(st, lyon, { teamId: "fr-A" }, start + 10 * DAY, w.leagues).ok);
  assert.ok(!N.activeMandate(st, "fr-A") && m.endReason === "resigned");
  // Mandat suivant (simulé) : inactivité puis club perdu, terme, destitution.
  const mk = (extra) => { const x = { id: `m${Math.random()}`, teamId: "fr-A", key: lyon.key, ref: lyon.ref, fromSeason: 2, toSeason: 4, startedAt: start, endedAt: null, ...extra }; st.mandates.push(x); st.teams["fr-A"].mandateId = x.id; return x; };
  let x = mk();
  w.fr.teams[0].lastSeenAt = start - 30 * DAY;
  N.step(st, w.leagues, w.world, start + 20 * DAY);
  assert.strictEqual(x.endReason, "inactive");
  w.fr.teams[0].lastSeenAt = start + 20 * DAY;
  x = mk();
  w.fr.teams[0].managerLinkToken = "autre";
  N.step(st, w.leagues, w.world, start + 21 * DAY);
  assert.strictEqual(x.endReason, "clubLost");
  w.fr.teams[0].managerLinkToken = w.fr.teams[0].managerLinkToken; // inchangé
  const lyon2 = me(w, "fr-1", 0);
  x = mk({ key: lyon2.key });
  w.leagues.forEach(lg => { lg.seasonNumber = 5; });
  N.step(st, w.leagues, w.world, start + 30 * DAY);
  assert.strictEqual(x.endReason, "term", "fin du mandat : terme");
  x = mk({ key: lyon2.key, toSeason: 7 });
  assert.ok(N.adminDismiss(st, "fr-A", start + 31 * DAY, w.leagues).ok && x.endReason === "dismissed");
  assert.ok(st.mandates.filter(y => y.endedAt).length >= 5, "historique des mandats conservé");
  ok("mandat : un seul à la fois, démission, inactivité, club perdu, terme, destitution (historique conservé)");
}
{
  // Règles d'éligibilité configurables.
  const start = Date.UTC(2027, 0, 5, 0);
  const w = makeWorld(2, start);
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2, voterRules: { any: [{ type: "clubInCountry" }, { type: "list", keys: [] }] }, candidateRules: { all: [{ type: "clubInCountry" }] } };
  N.ensureTeams(st);
  const madrid = me(w, "es-1", 0);
  assert.ok(!N.canRun(st, st.teams["fr-A"], madrid), "règle « candidats du pays seulement » appliquée");
  st.config.voterRules = { any: [{ type: "clubInCountry" }, { type: "list", keys: [madrid.key] }] };
  assert.ok(N.canVote(st, st.teams["fr-A"], madrid), "collège électoral : électeur ajouté par liste");
  ok("éligibilité configurable (pays, liste, anciens sélectionneurs, combinaisons any/all)");
}
{
  // Page équipe (2026-10-05) : groupe de l'intérim et calendrier.
  const start = Date.UTC(2027, 0, 5, 19);
  const w = makeWorld(2, start);
  // Quelques Français de 21 ans au plus, dont un en Espagne.
  w.es.teams[1].players[0].nationality = "fr"; w.es.teams[1].players[0].age = 20;
  w.fr.teams[2].players[1].age = 19; w.fr.teams[2].players[1].nationality = "fr";
  const st = N.emptyStore(); st.config = { cycleStartSeason: 2 };
  N.step(st, w.leagues, w.world, start + 3600e3);
  const all = [...w.leagues.values()].flatMap(lg => lg.teams.flatMap(t => t.players));
  const fr = all.filter(p => p.nationality === "fr");
  const sq = st.squads["fr-A"];
  assert.ok(sq && sq.players.length === Math.min(12, fr.length), "groupe de 12 (ou moins s'il manque des joueurs)");
  assert.ok(sq.players.every(p => fr.some(x => x.id === p.id)), "groupe : seulement des joueurs de la nationalité");
  assert.strictEqual(sq.eligible, fr.length, "joueurs éligibles comptés dans tous les championnats");
  assert.strictEqual(sq.leagues, 2, "dont un Français d'un club espagnol");
  const best = fr.slice().sort((a, b) => b.overall() - a.overall())[0];
  assert.ok(sq.players.some(p => p.id === best.id), "le meilleur Français est dans le groupe");
  const u = st.squads["fr-U21"];
  assert.ok(u.players.length >= 2 && u.players.every(p => p.age <= 21), "U21 : 21 ans au plus");
  const sqPlayer = sq.players[0];
  assert.ok(sqPlayer.club && sqPlayer.club.leagueId && typeof sqPlayer.club.idx === "number" && !("salary" in sqPlayer) && !("potential" in sqPlayer) && !("attrs" in sqPlayer), "pas de salaire, contrat, potentiel ni attributs détaillés publics");
  // Pas recalculé avant 6 h.
  const at = sq.at;
  N.step(st, w.leagues, w.world, start + 2 * 3600e3);
  assert.strictEqual(st.squads["fr-A"].at, at, "groupe recalculé au plus toutes les 6 h");
  // Vue et calendrier.
  const v = N.teamView(st, "fr-A", null, 2, start + 3600e3, start);
  assert.ok(v.ok && v.team.countryName && v.squad.players.length && v.phase.kind === "continental");
  const wins = v.calendar.filter(c => c.kind === "window"), fin = v.calendar.find(c => c.kind === "final");
  const parisDay = ms => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "long" }).format(new Date(ms));
  const parisHour = ms => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  assert.ok(wins.length === 3 && wins.every(c => parisDay(c.at) === "Sunday" && parisHour(c.at) === "20"), "3 fenêtres le dimanche à 20h");
  assert.ok(fin && parisDay(fin.from) === "Monday" && parisDay(fin.to) === "Sunday" && fin.days.length === 7, "phase finale du lundi au dimanche de la dernière semaine");
  assert.ok(fin.to < start + 84 * DAY - DAY / 2 && fin.from > start + 75 * DAY, "dans l'intersaison, avant la reprise");
  assert.strictEqual(N.teamView(st, "fr-U21", null, 2, start, start).phase, null, "U21 : cycle pas encore commencé (élection la saison suivante)");
  assert.strictEqual(N.teamView(st, "fr-U21", null, 3, start, start).phase.kind, "continental", "U21 décalées d'une saison : continentale en saison 3");
  assert.strictEqual(N.teamView(st, "fr-A", null, 3, start, start).phase.kind, "world", "A : Coupe du monde en saison 3");
  assert.strictEqual(N.teamView(st, "xx-A", null, 2, start, start), null);
  ok("page équipe : groupe (intérim, nationalité, U21, tous championnats, rien de privé), calendrier (3 dimanches + dernière semaine)");
}
console.log("\n🏁 national_elections_test.js : élections et mandats conformes.");
