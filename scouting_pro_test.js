// Vérifie "Scouting Pro" (retour utilisateur, 2026-09 — voir le grand
// commentaire en tête de server/scouting.js et DEV_NOTES.md) : rapport
// d'adversaire SUPPLÉMENTAIRE (forme récente, bilan domicile/extérieur,
// séries, historique des confrontations, zones de tir intérieur/mi-
// distance/3 points, joueurs clés), débloqué par pub factice (quota
// quotidien de 3, écran gris) ou par "Passer Pro" (bouton factice, aucun
// paiement réel) — JAMAIS un remplacement du rapport tactique déjà existant
// et déjà gratuit (tacticalReportHtml/computeScoutingTendencies, inchangé).
//
// Trois parties :
//   A) MOTEUR PUR (server/scouting.js directement, pas de HTTP) : quota
//      quotidien, péremption ("l'adversaire a rejoué depuis"), idempotence
//      de la complétion d'un ticket de pub, contenu du rapport vérifié par
//      reconstruction indépendante depuis league.results/matchLog.
//   B) SERVEUR (server/index.js, de vraies requêtes HTTP, mode solo) :
//      verrouillé -> pub -> débloqué -> rapport accessible ; 403 si
//      verrouillé ; Premium contourne tout ; quota quotidien réellement
//      appliqué bout en bout.
//   C) NAVIGATEUR (moteurbasket3.html, jsdom) : panneau "Scouting Pro" sur
//      le sous-onglet Analyse d'une fiche équipe adverse, écran gris de pub
//      factice, déblocage effectif, bouton "Passer Pro".
const fs = require("fs");
const http = require("http");
const Engine = require("./engine.js");
const { generateTeam, generateLeague, simulateOrForfeit, recordMatchStatsAndAwardMvp } = Engine;
const Scouting = require("./server/scouting.js");
const store = require("./server/store.js");
const { createHandler } = require("./server/index.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 7);

function freshLeague(now = T0) {
  const user = generateTeam("Scout FC", 1.0);
  return generateLeague(user, 1, now);
}

// Joue `numRounds` premières journées (championnat), en enregistrant à la
// fois le résultat (league.results, pour recentForm/homeAwayRecord/streak/
// headToHead) ET le matchLog de chaque joueur (pour gamesPlayed/shotZones/
// keyPlayers) — même séquence que finalizeRound côté serveur
// (server/liveMatch.js) : recordResult PUIS recordMatchStatsAndAwardMvp.
function playRounds(lg, numRounds, now = T0) {
  for (let r = 0; r < numRounds; r++) {
    lg.matchesForRound(r).forEach(m => {
      const home = lg.teams[m.home], away = lg.teams[m.away];
      const res = simulateOrForfeit(home, away, now);
      lg.recordResult(r, m.home, m.away, res.scoreHome, res.scoreAway);
      // `res.tacticsUsed` (nouveau, voir Engine.tacticsSnapshotFor/
      // simulateOrForfeit) : même fil que server/liveMatch.js:finalizeRound
      // — capturé au moment de la simulation, jamais relu depuis
      // team.defense/offensivePriorities/rhythm à cet instant du test.
      if (!res.forfeit) recordMatchStatsAndAwardMvp(home, away, r, "championship", now, res.quarterScores, res.tacticsUsed);
    });
  }
  lg.round = numRounds;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`❌ ${label} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}.`);
}
function assertTrue(cond, label) {
  if (!cond) throw new Error(`❌ ${label}`);
}

// =========================================================================
// PARTIE A : MOTEUR PUR (server/scouting.js)
// =========================================================================
(function partA() {
  // -----------------------------------------------------------------
  // A1) Verrouillé par défaut, quota de 3 pubs/jour, débloqué après une
  //     pub complétée, contenu du rapport cohérent avec une reconstruction
  //     indépendante depuis league.results.
  // -----------------------------------------------------------------
  {
    const lg = freshLeague();
    playRounds(lg, 4);
    const teamIdx = 0;
    const firstMatch = lg.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
    const oppIdx = firstMatch.home === 0 ? firstMatch.away : firstMatch.home;

    const accessBefore = Scouting.getScoutingAccess(lg, teamIdx, oppIdx, T0);
    assertEqual(accessBefore.level, "locked", "A1: accès verrouillé par défaut");
    assertEqual(accessBefore.adsRemainingThisMonth, 1, "A1: 1 pub disponible au départ (quota mensuel, retour utilisateur 2026-09-25)");

    const ticket = Scouting.createAdTicket(lg, teamIdx, oppIdx, T0);
    assertTrue(ticket.ok, "A1: création du ticket de pub réussie");
    const complete = Scouting.completeAdTicket(lg, teamIdx, ticket.ticketId, T0 + 15000);
    assertTrue(complete.ok, "A1: complétion du ticket réussie");

    const accessAfter = Scouting.getScoutingAccess(lg, teamIdx, oppIdx, T0 + 20000);
    assertEqual(accessAfter.level, "full", "A1: accès débloqué après la pub");
    assertEqual(accessAfter.adsWatchedThisMonth, 1, "A1: 1 pub comptée ce mois-ci");

    const report = Scouting.buildScoutingReport(lg, teamIdx, oppIdx, T0 + 20000);
    assertTrue(report.ok, "A1: rapport construit avec succès");

    // Reconstruction indépendante de recentForm/homeAwayRecord/streak depuis
    // league.results, sans passer par le code testé — même discipline que
    // le reste du projet (voir spectate_live_match_test.js).
    const oppGames = lg.results.filter(r => r.home === oppIdx || r.away === oppIdx);
    let expWins = 0, expLosses = 0;
    oppGames.forEach(r => {
      const isHome = r.home === oppIdx;
      const won = isHome ? r.scoreHome > r.scoreAway : r.scoreAway > r.scoreHome;
      if (won) expWins++; else expLosses++;
    });
    const actualWins = report.homeAwayRecord.home.wins + report.homeAwayRecord.away.wins;
    const actualLosses = report.homeAwayRecord.home.losses + report.homeAwayRecord.away.losses;
    assertEqual(actualWins, expWins, "A1: total de victoires cohérent (bilan domicile+extérieur)");
    assertEqual(actualLosses, expLosses, "A1: total de défaites cohérent");
    assertEqual(report.recentForm.length, Math.min(5, oppGames.length), "A1: forme récente limitée à 5 matchs max");

    // Zones de tir : la somme des tentatives par zone doit égaler le total
    // de fga2+fga3 sur tout le matchLog de l'adversaire (reconstruction
    // indépendante), et intérieur+mi-distance doit égaler fga2 total.
    const opponent = lg.teams[oppIdx];
    let totalFga2 = 0, totalFga3 = 0, totalPaintAtt = 0;
    opponent.players.forEach(p => (p.matchLog || []).forEach(m => {
      totalFga2 += m.fga2 || 0; totalFga3 += m.fga3 || 0; totalPaintAtt += m.paintAtt || 0;
    }));
    const z = report.shotZones;
    assertEqual(z.inside.attempts, totalPaintAtt, "A1: tentatives 'intérieur' = paintAtt total");
    assertEqual(z.inside.attempts + z.mid.attempts, totalFga2, "A1: intérieur+mi-distance = fga2 total");
    assertEqual(z.three.attempts, totalFga3, "A1: tentatives à 3 points = fga3 total");
    assertEqual(z.totalAttempts, totalFga2 + totalFga3, "A1: total tentatives = fga2+fga3");

    console.log("✅ A1 : verrouillé par défaut, débloqué après une pub, contenu du rapport cohérent avec league.results/matchLog.");
  }

  // -----------------------------------------------------------------
  // A2) Péremption : une fois l'adversaire rejoué, le rapport déjà débloqué
  //     redevient "stale" (données changées) même si l'entrée reste dans
  //     scoutingUnlocks — jamais effacée, juste signalée comme périmée.
  // -----------------------------------------------------------------
  {
    const lg = freshLeague();
    playRounds(lg, 2);
    const m = lg.matchesForRound(0).find(x => x.home === 0 || x.away === 0);
    const oppIdx = m.home === 0 ? m.away : m.home;
    const ticket = Scouting.createAdTicket(lg, 0, oppIdx, T0);
    Scouting.completeAdTicket(lg, 0, ticket.ticketId, T0);
    assertEqual(Scouting.getScoutingAccess(lg, 0, oppIdx, T0).stale, false, "A2: pas périmé juste après déblocage");

    // L'adversaire rejoue un match supplémentaire (round 2) : le rapport
    // déjà débloqué doit maintenant être signalé périmé.
    playRounds(lg, 3);
    const accessAfterNewGame = Scouting.getScoutingAccess(lg, 0, oppIdx, T0);
    assertEqual(accessAfterNewGame.stale, true, "A2: périmé après un nouveau match de l'adversaire");
    assertEqual(accessAfterNewGame.level, "locked", "A2: un rapport périmé compte comme verrouillé (level='locked')");
    console.log("✅ A2 : le rapport devient périmé dès que l'adversaire a rejoué depuis le déblocage.");
  }

  // -----------------------------------------------------------------
  // A3) Quota MENSUEL d'1 pub (retour utilisateur, 2026-09-25 : "on ne
  //     doit pouvoir le faire qu'une fois par mois"), mois CIVIL Paris ;
  //     idempotence de la complétion d'un ticket.
  // -----------------------------------------------------------------
  {
    const lg = freshLeague();
    playRounds(lg, 2);
    const t1 = Scouting.createAdTicket(lg, 0, 1, T0);
    assertTrue(t1.ok, "A3: 1re pub du mois acceptée");
    assertTrue(Scouting.completeAdTicket(lg, 0, t1.ticketId, T0).ok, "A3: complétion réussie");
    const refused = Scouting.createAdTicket(lg, 0, 2, T0 + 5 * 24 * 3600 * 1000);
    assertEqual(refused.ok, false, "A3: 2e pub dans le même mois refusée (quota atteint)");
    const access2 = Scouting.getScoutingAccess(lg, 0, 2, T0);
    assertEqual(access2.adsRemainingThisMonth, 0, "A3: plus aucune pub restante ce mois-ci");
    assertTrue(access2.nextAdAvailableAt === Date.UTC(2026, 9, 1), "A3: prochaine pub annoncée au 1er du mois suivant");
    // Idempotence : compléter le MÊME ticket une deuxième fois échoue sans
    // recréditer le quota.
    const doubleComplete = Scouting.completeAdTicket(lg, 0, t1.ticketId, T0);
    assertEqual(doubleComplete.ok, false, "A3: compléter deux fois le même ticket échoue");
    assertEqual(Scouting.adsWatchedThisMonth(lg.teams[0], T0), 1, "A3: exactement 1 pub comptée, pas 2");
    // Mois suivant (T0 = 7 septembre → 3 octobre) : de nouveau disponible.
    const nextMonth = Date.UTC(2026, 9, 3, 12);
    const t2 = Scouting.createAdTicket(lg, 0, 2, nextMonth);
    assertTrue(t2.ok, "A3: une nouvelle pub est de nouveau possible le mois suivant");
    console.log("✅ A3 : quota d'1 pub par mois civil respecté, remis à zéro le mois suivant, complétion idempotente.");
  }

  // -----------------------------------------------------------------
  // A4) Premium : accès "full" immédiat, sans aucune pub, et createAdTicket
  //     refuse explicitement (inutile pour un club déjà Premium).
  // -----------------------------------------------------------------
  {
    const lg = freshLeague();
    playRounds(lg, 2);
    Scouting.setPremium(lg.teams[0], true);
    const access = Scouting.getScoutingAccess(lg, 0, 1, T0);
    assertEqual(access.level, "full", "A4: Premium débloque tout immédiatement");
    assertEqual(access.unlocked, false, "A4: Premium n'utilise jamais scoutingUnlocks (juste team.scoutingPremium)");
    const ticketAttempt = Scouting.createAdTicket(lg, 0, 1, T0);
    assertEqual(ticketAttempt.ok, false, "A4: un club Premium n'a pas besoin de regarder de pub");
    console.log("✅ A4 : Premium débloque tout immédiatement, sans pub.");
  }

  // -----------------------------------------------------------------
  // A5) Rapport GATÉ côté serveur : buildScoutingReport lui-même ne vérifie
  //     PAS l'accès (fonction de lecture pure, testée séparément) — c'est
  //     bien la responsabilité de l'appelant (voir Partie B, GET
  //     /api/scouting/report) de refuser un rapport tant que l'accès n'est
  //     pas "full". Documenté ici pour que ce choix architectural reste
  //     explicite et testé (pas un oubli).
  // -----------------------------------------------------------------
  {
    const lg = freshLeague();
    playRounds(lg, 2);
    const report = Scouting.buildScoutingReport(lg, 0, 1, T0);
    assertTrue(report.ok, "A5: buildScoutingReport ne vérifie pas l'accès lui-même (documenté)");
    console.log("✅ A5 : buildScoutingReport reste une fonction de lecture pure (le gating est fait par l'appelant HTTP, voir Partie B).");
  }

  // -----------------------------------------------------------------
  // A6) aggregateStrategyUsage : fréquence des tactiques RÉELLEMENT
  //     utilisées match par match (Engine.tacticsSnapshotFor, capturé au
  //     moment de la simulation, voir playRounds ci-dessus) — vérifié par
  //     reconstruction indépendante depuis league.teams[oppIdx].players[].
  //     matchLog[].tacticsUsed, ET vérifie explicitement que changer les
  //     réglages ACTUELS de l'équipe APRÈS coup n'altère pas rétroactivement
  //     l'historique déjà agrégé (c'est tout le sens de la capture au
  //     moment de la simulation plutôt qu'une relecture de team.defense/
  //     offensivePriorities/rhythm).
  // -----------------------------------------------------------------
  {
    const lg = freshLeague();
    playRounds(lg, 4);
    const oppIdx = 1;
    const opponent = lg.teams[oppIdx];

    // Reconstruction indépendante : dédoublonne par (competition, round)
    // comme le fait le code testé, sans réutiliser sa logique.
    const seen = new Map();
    opponent.players.forEach(p => (p.matchLog || []).forEach(m => {
      if (!m.tacticsUsed) return;
      seen.set(`${m.competition}|${m.round}`, m.tacticsUsed);
    }));
    assertTrue(seen.size > 0, "A6: au moins un match avec tacticsUsed capturé");
    const expDefenseCounts = {};
    seen.forEach(t => { if (t.defense) expDefenseCounts[t.defense] = (expDefenseCounts[t.defense] || 0) + 1; });

    const usage = Scouting.aggregateStrategyUsage(opponent);
    assertEqual(usage.totalMatches, seen.size, "A6: totalMatches = nombre de matchs dédoublonnés avec tacticsUsed");
    const actualDefenseCounts = {};
    usage.defense.forEach(row => { actualDefenseCounts[row.type] = row.count; });
    assertEqual(JSON.stringify(actualDefenseCounts), JSON.stringify(expDefenseCounts), "A6: comptage défense cohérent avec la reconstruction indépendante");
    const defenseTotal = usage.defense.reduce((s, r) => s + r.count, 0);
    assertEqual(defenseTotal, usage.totalMatches, "A6: somme des comptages défense = totalMatches (un choix par match)");
    const pctSum = usage.defense.reduce((s, r) => s + r.pct, 0);
    assertTrue(Math.abs(pctSum - 100) <= usage.defense.length, "A6: les % défense somment ~100 (arrondis)");

    // Changer les réglages ACTUELS de l'équipe (comme un manager qui prépare
    // son PROCHAIN match) ne doit RIEN changer à l'agrégat déjà calculé sur
    // l'historique — c'est le bug de staleness que tacticsSnapshotFor
    // existe précisément pour éviter (voir son grand commentaire côté
    // moteur).
    const beforeChange = Scouting.aggregateStrategyUsage(opponent);
    opponent.defense = "Zone press";
    opponent.offensivePriorities = ["Isolation", "Post-up", "Jeu extérieur"];
    opponent.rhythm = "Rapide";
    const afterChange = Scouting.aggregateStrategyUsage(opponent);
    assertEqual(JSON.stringify(afterChange), JSON.stringify(beforeChange), "A6: modifier les réglages actuels de l'équipe n'altère pas l'historique déjà agrégé");

    // Rapport complet : strategyUsage doit être exposé et cohérent.
    const report = Scouting.buildScoutingReport(lg, 0, oppIdx, T0);
    assertTrue(!!report.strategyUsage, "A6: buildScoutingReport expose strategyUsage");
    assertEqual(report.strategyUsage.totalMatches, usage.totalMatches, "A6: strategyUsage.totalMatches cohérent dans le rapport complet");

    console.log("✅ A6 : aggregateStrategyUsage cohérent avec matchLog[].tacticsUsed, insensible aux réglages actuels de l'équipe après coup.");
  }
})();

// =========================================================================
// PARTIE B : SERVEUR (server/index.js), de vraies requêtes HTTP, mode SOLO.
// =========================================================================
function request(server, method, urlPath, jsonBody) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const headers = {};
  if (payload) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let body = null;
        try { body = JSON.parse(raw); } catch (e) { /* laissé à null */ }
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const lg = freshLeague();
  playRounds(lg, 3);
  const m = lg.matchesForRound(0).find(x => x.home === 0 || x.away === 0);
  const oppIdx = m.home === 0 ? m.away : m.home;

  const os = require("os"), path = require("path");
  const solo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-scouting-test-")), "league.json");
  await store.save(lg.teams[0], lg, solo);

  const server = http.createServer(createHandler(solo, () => T0 + 30000));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    // B1) Verrouillé au départ.
    const accessBefore = await request(server, "GET", `/api/scouting/access?opponent=${oppIdx}`);
    assertEqual(accessBefore.statusCode, 200, "B1: /api/scouting/access répond 200");
    assertEqual(accessBefore.body.level, "locked", "B1: verrouillé par défaut");

    // B2) Rapport refusé (403) tant que verrouillé.
    const reportLocked = await request(server, "GET", `/api/scouting/report?opponent=${oppIdx}`);
    assertEqual(reportLocked.statusCode, 403, "B2: rapport refusé (403) si verrouillé");

    // B3) Création + complétion d'un ticket de pub débloque le rapport.
    const ticket = await request(server, "POST", "/api/scouting/ad-ticket", { opponent: oppIdx });
    assertEqual(ticket.statusCode, 200, "B3: création du ticket réussie");
    assertTrue(!!ticket.body.ticketId, "B3: un ticketId est renvoyé");
    const complete = await request(server, "POST", "/api/scouting/ad-complete", { ticketId: ticket.body.ticketId });
    assertEqual(complete.statusCode, 200, "B3: complétion du ticket réussie");

    const accessAfter = await request(server, "GET", `/api/scouting/access?opponent=${oppIdx}`);
    assertEqual(accessAfter.body.level, "full", "B3: accès débloqué après la pub");

    const report = await request(server, "GET", `/api/scouting/report?opponent=${oppIdx}`);
    assertEqual(report.statusCode, 200, "B3: rapport accessible une fois débloqué");
    assertTrue(report.body.opponentIdx === oppIdx, "B3: le rapport porte bien sur le bon adversaire");
    assertTrue(Array.isArray(report.body.recentForm), "B3: le rapport contient recentForm");

    // B4) Quota MENSUEL d'1 pub appliqué bout en bout via HTTP (déjà
    // consommé par oppIdx ci-dessus) : toute autre tentative ce mois-ci est
    // refusée.
    const others = [1, 2, 3, 4, 5].filter(i => i !== oppIdx).slice(0, 2);
    let refusals = 0;
    for (const idx of others) {
      const t = await request(server, "POST", "/api/scouting/ad-ticket", { opponent: idx });
      if (t.statusCode !== 200) { refusals++; continue; }
      await request(server, "POST", "/api/scouting/ad-complete", { ticketId: t.body.ticketId });
    }
    assertEqual(refusals, 2, "B4: toutes les pubs suivantes du mois sont refusées (quota d'1 par mois)");

    // B5) Premium (bouton factice) débloque tout instantanément, sans pub.
    const premiumOn = await request(server, "POST", "/api/scouting/set-premium", { premium: true });
    assertEqual(premiumOn.statusCode, 200, "B5: activation Premium réussie");
    const accessPremium = await request(server, "GET", "/api/scouting/access?opponent=6");
    assertEqual(accessPremium.body.level, "full", "B5: Premium débloque un adversaire jamais scouté auparavant");
    const reportPremium = await request(server, "GET", "/api/scouting/report?opponent=6");
    assertEqual(reportPremium.statusCode, 200, "B5: rapport Premium accessible sans aucune pub");

    console.log("✅ Partie B (serveur, mode solo) : accès verrouillé/débloqué/gaté correctement, quota mensuel respecté, Premium contourne tout.");
  } finally {
    server.close();
  }

  // =======================================================================
  // PARTIE C : NAVIGATEUR (moteurbasket3.html, jsdom), mode SOLO.
  // =======================================================================
  {
    const lg2 = freshLeague();
    playRounds(lg2, 3);
    const m2 = lg2.matchesForRound(0).find(x => x.home === 0 || x.away === 0);
    const oppIdx2 = m2.home === 0 ? m2.away : m2.home;
    const clock = { now: T0 + 60000 };
    const solo2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-scouting-test-c-")), "league.json");
    await store.save(lg2.teams[0], lg2, solo2);

    const server2 = http.createServer(createHandler(solo2, () => clock.now));
    await new Promise((resolve) => server2.listen(0, "127.0.0.1", resolve));
    const { port } = server2.address();
    const baseUrl = `http://127.0.0.1:${port}/`;
    try {
      const dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
      const win = dom.window;
      const doc = win.document;

      // C1) Ouvrir la fiche de l'adversaire, sous-onglet Analyse : le
      // panneau Scouting Pro affiche le teaser verrouillé (3 pubs
      // disponibles) — retour utilisateur (2026-09-24) : "les conseils
      // tactiques mets les en bas", donc désormais AU-DESSUS du rapport
      // tactique gratuit déjà existant (qui reste affiché tel quel, jamais
      // remplacé, juste déplacé plus bas).
      win.showTeamDetail(oppIdx2);
      win.eval('document.querySelector("[data-team-detail-subview=\'analyse\']").dispatchEvent(new Event("click", {bubbles:true}));');
      await win.__lastScoutingProCheck;
      const panel = doc.getElementById("scoutingProPanel");
      assertTrue(!!panel, "C1: le panneau Scouting Pro existe");
      assertTrue(panel.querySelector(".sp-lock"), "C1: l'écran verrouillé s'affiche pour un non-Pro");
      const watchAdBtn = doc.getElementById("scoutingProWatchAdBtn");
      assertTrue(!!watchAdBtn, "C1: le bouton 'Regarder une pub' est affiché (verrouillé)");
      assertTrue(!doc.getElementById("scoutingProReport"), "C1: aucun contenu de rapport tant que verrouillé");
      // Mode gratuit retiré (retour utilisateur, 2026-09-25) : plus aucun
      // rapport tactique gratuit pour un adversaire, seulement l'écran
      // verrouillé (pub 1 fois/mois ou Passer Pro).
      assertTrue(!doc.querySelector("#teamDetailContent .tactical-report"), "C1: plus de rapport tactique gratuit pour un adversaire non débloqué");

      // C2) Cliquer "Regarder une pub" ouvre l'écran gris, puis (après
      // avance de l'horloge factice + tick manuel, voir
      // window.__scoutingAdTickForTests) débloque le rapport complet.
      watchAdBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
      await win.__lastScoutingAdOpen;
      const overlay = doc.getElementById("scoutingAdOverlay");
      assertTrue(!!overlay, "C2: l'écran gris de pub factice s'affiche");
      assertTrue(overlay.innerHTML.includes("Scouting en cours"), "C2: l'écran gris affiche le texte narratif attendu");

      clock.now += 16000; // au-delà de SCOUTING_AD_WATCH_MS (15s)
      win.__scoutingAdTickForTests();
      await win.__lastScoutingAdComplete;

      assertTrue(!doc.getElementById("scoutingAdOverlay"), "C2: l'écran gris se referme après complétion");
      const panelAfter = doc.getElementById("scoutingProPanel");
      assertTrue(panelAfter.innerHTML.includes("Classement") || panelAfter.innerHTML.includes("Confrontations"), "C2: le rapport complet s'affiche après la pub");
      assertTrue(!doc.getElementById("scoutingProWatchAdBtn"), "C2: le teaser verrouillé disparaît une fois débloqué");

      // C2bis) Visuels v2 (retour utilisateur, 2026-09 : "trop simple pour
      // le moment [...] faudrait des choses plus visuels que ton texte /
      // bilan tu mets des carré rouges ou verts / zone de tir une carte du
      // terrain... / on pourrait avoir une carte du 5 types aussi") :
      // carrés colorés de forme, carte de terrain SVG pour les zones de
      // tir, barres de stratégies, carte "5 majeur", tableau complet du
      // roster — tous doivent apparaître dans le rapport débloqué, plus
      // AUCUN texte "Zones de tir : Intérieur X%..." brut.
      assertTrue(panelAfter.querySelectorAll(".scouting-form-sq").length > 0, "C2bis: des carrés colorés de forme récente/confrontations sont rendus");
      assertTrue(!panelAfter.innerHTML.includes("Zones de tir :"), "C2bis: l'ancien paragraphe texte des zones de tir a disparu");
      assertTrue(panelAfter.querySelectorAll(".scouting-shot-court svg").length > 0, "C2bis: la carte du terrain (zones de tir, terrain FIBA réutilisé de .pdp-court/Ordres) est rendue en SVG");
      assertTrue(panelAfter.innerHTML.includes("5 majeur"), "C2bis: la carte '5 majeur' de l'adversaire est présente");
      assertTrue(panelAfter.innerHTML.includes("Effectif complet"), "C2bis: le tableau complet du roster adverse est présent");
      // Barres de stratégies : oppIdx2 a joué 3 journées (playRounds(lg2,3)
      // ci-dessus, qui capture désormais tacticsUsed, voir playRounds en
      // tête de ce fichier) — au moins une ligne de barre doit apparaître.
      // Sélecteur mis à jour (retour utilisateur, 2026-09-24, maquette
      // "Scouting Pro v2" : refonte visuelle du panneau, voir sp2FormContextHtml)
      // — `.scouting-strategy-row` n'existe plus dans CE panneau (toujours
      // utilisé ailleurs, ex. tacticalReportHtml/le rapport tactique gratuit,
      // inchangé), remplacé ici par `.sp2-strat-row`, mêmes données
      // (report.strategyUsage), seule la présentation change.
      assertTrue(panelAfter.querySelectorAll(".sp2-strat-row").length > 0, "C2bis: au moins une barre de fréquence de stratégie est rendue");

      // C2ter) Retouches 2026-09-25 (retour utilisateur) : "le 5 suggéré doit
      // être en dessous du plan de match", "enlève forme x% sous les avatars
      // des joueurs", "enlève tendance observés que ce soit payant ou
      // gratuit" — et le rapport gratuit (qui ne contient plus que la
      // composition recommandée) est masqué une fois Pro débloqué.
      const planEl = panelAfter.querySelector(".sp2-plan");
      const fiveEl = panelAfter.querySelector(".sp2-five");
      assertTrue(!!fiveEl, "C2ter: la section '5 de départ suggéré' est présente dans Scouting Pro");
      assertTrue(!!planEl && planEl.nextElementSibling === fiveEl, "C2ter: le 5 suggéré suit immédiatement le Plan de match");
      assertTrue(!panelAfter.textContent.includes("Tendances observées"), "C2ter: plus de 'Tendances observées' dans Scouting Pro");
      const lineupMeta = [...panelAfter.querySelectorAll(".sp2-token-meta, .sp2-leader-line")].map(el => el.textContent).join(" | ");
      assertTrue(!/forme \d+%/.test(lineupMeta), "C2ter: plus de 'forme x%' sous les avatars (5 majeur / joueurs clés)");
      const freeReportAfter = doc.querySelector("#teamDetailContent .tactical-report");
      assertTrue(!freeReportAfter || freeReportAfter.hidden, "C2ter: le rapport tactique gratuit est masqué une fois Pro débloqué (pas de doublon)");

      // C3) "Passer Pro" sur un AUTRE adversaire débloque instantanément,
      // sans passer par l'écran gris.
      const oppIdx3 = [1, 2, 3, 4].find(i => i !== oppIdx2 && i !== 0);
      win.showTeamDetail(oppIdx3);
      win.eval('document.querySelector("[data-team-detail-subview=\'analyse\']").dispatchEvent(new Event("click", {bubbles:true}));');
      await win.__lastScoutingProCheck;
      const premiumBtn = doc.getElementById("scoutingProGoPremiumBtn");
      assertTrue(!!premiumBtn, "C3: le bouton 'Passer Pro' est affiché");
      premiumBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
      await win.__lastScoutingPremiumToggle;
      const panel3 = doc.getElementById("scoutingProPanel");
      assertTrue(!doc.getElementById("scoutingProWatchAdBtn"), "C3: plus de teaser verrouillé, Premium actif");
      assertTrue(!!doc.getElementById("scoutingProGoFreeBtn"), "C3: un lien 'Repasser en gratuit (test)' est proposé une fois Premium actif");

      console.log("✅ Partie C (navigateur, mode solo) : teaser verrouillé, écran gris de pub factice, déblocage effectif, 'Passer Pro' fonctionnel.");
      // Ferme la fenêtre jsdom (arrête ses timers d'arrière-plan — horloge
      // live, sauvegarde différée...) AVANT de fermer le serveur, sinon le
      // process Node reste actif indéfiniment (voir spectate_live_match_test.js,
      // même précaution).
      await dom.window.close();
    } finally {
      server2.close();
    }
  }

  console.log("\n✅ scouting_pro_test.js : toutes les vérifications sont passées.\n");
  // Sortie explicite (constaté en pratique : sous charge, dans
  // run_final.sh, après des dizaines d'autres fichiers de test ayant chacun
  // ouvert/fermé leurs propres serveurs/fenêtres jsdom, une poignée d'appels
  // fetch() déjà en vol au moment de fermer server2/dom.window.close()
  // peuvent mettre bien plus longtemps à échouer proprement qu'en isolation
  // — sans effet sur la validité des vérifications ci-dessus, déjà toutes
  // passées à ce stade, mais assez pour dépasser le timeout de 90s du
  // runner) : on ne laisse pas le drainage naturel de la boucle d'événements
  // décider seul du moment de sortie.
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
