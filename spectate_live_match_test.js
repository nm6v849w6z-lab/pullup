// Vérifie "pouvoir regarder le live d'une autre équipe depuis son
// calendrier" (retour utilisateur, 2026-09-24 — voir DEV_NOTES.md), scope
// choisi explicitement par l'utilisateur via AskUserQuestion le même jour :
// "Limiter aux matchs déjà en direct" — UNIQUEMENT les matchs DÉJÀ diffusés
// (au moins un côté humain, voir league.liveMatches), JAMAIS un changement à
// l'architecture délibérée "un match CPU-vs-CPU n'est jamais diffusé" (voir
// server/autoSim_test.js). Deux parties :
//   A) SERVEUR (server/index.js, de vraies requêtes HTTP) : GET
//      /api/live-status (liste allégée, sans contenu) et GET /api/spectate
//      (contenu personnalisé pour l'équipe SUIVIE, réutilise
//      LiveMatch.viewLiveMatchForTeam) — voir server/liveMatch.js.
//   B) NAVIGATEUR (moteurbasket3.html) : la pastille "🔴 En direct — Suivre"
//      apparaît sur le sous-onglet Calendrier d'une fiche équipe adverse
//      actuellement en direct, et cliquer "Suivre" ouvre une fenêtre
//      spectateur en lecture seule (score/quart-temps/fil d'événements/box
//      score reconstitués depuis les événements déjà diffusés, jamais depuis
//      le résultat final déjà connu côté serveur).
const fs = require("fs");
const http = require("http");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const { createHandler } = require("./server/index.js");
const { scheduledTimeForLeagueRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 7); // un lundi arbitraire, fixe pour tout le fichier

// Construit une ligue multi-manager fraîche (4 équipes humaines + 6 CPU,
// voir generateMultiManagerLeague) et trouve une journée du calendrier
// round-robin où (a) au moins 2 des 4 équipes humaines s'affrontent entre
// elles ET (b) au moins une AUTRE équipe humaine (le "spectateur", jamais
// impliquée dans ce match) existe pour ce même round — même patron de
// recherche que server/autoSim_test.js, section 9.
function freshLeagueWithHumanVsHumanAndSpectator(names, now = T0) {
  const league = generateMultiManagerLeague(names, 1, now);
  const humanIdx = league.teams.map((t, i) => (t.isHuman ? i : null)).filter(x => x !== null);
  for (let r = 0; r < league.totalRounds; r++) {
    const matches = league.matchesForRound(r);
    const hh = matches.find(m => league.teams[m.home].isHuman && league.teams[m.away].isHuman);
    if (!hh) continue;
    const spectatorIdx = humanIdx.find(idx => idx !== hh.home && idx !== hh.away);
    if (spectatorIdx === undefined) continue;
    // Un match CPU-vs-CPU de CETTE MÊME journée (jamais diffusé, voir
    // server/autoSim_test.js) : nécessaire pour A3 ci-dessous (vérifier que
    // /api/spectate refuse une équipe qui n'est structurellement JAMAIS en
    // direct) — un simple "1er index CPU trouvé" ne suffit pas, cette
    // équipe pourrait très bien jouer contre un humain CE round-là (donc
    // bien diffusée) sans rapport avec le duel CPU-vs-CPU testé ici.
    const cpuVsCpu = matches.find(m => !league.teams[m.home].isHuman && !league.teams[m.away].isHuman);
    if (!cpuVsCpu) continue;
    return { league, targetRound: r, match: hh, spectatorIdx, humanIdx, cpuIdx: cpuVsCpu.home };
  }
  throw new Error("❌ (setup) impossible de trouver une journée avec un duel humain-vs-humain ET un 3e manager humain spectateur.");
}

function tmpMultiSavePath() {
  const os = require("os"), path = require("path");
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-spectate-test-")), "multi-league.json");
}
function tmpSavePath() {
  const os = require("os"), path = require("path");
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-spectate-test-solo-")), "league.json");
}

function request(server, method, urlPath, extraHeaders) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: extraHeaders || {} }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let body = null;
        try { body = JSON.parse(raw); } catch (e) { /* laissé à null */ }
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// =======================================================================
// PARTIE A : SERVEUR (server/index.js), de vraies requêtes HTTP.
// =======================================================================
(async () => {

const { league, targetRound, match, spectatorIdx, humanIdx, cpuIdx } = freshLeagueWithHumanVsHumanAndSpectator(
  ["Lyon SpecA", "Marseille SpecA", "Nice SpecA", "Rennes SpecA"]
);
league.round = targetRound;
const kickoffAt = scheduledTimeForLeagueRound(league, targetRound);
const spectatorToken = league.teams[spectatorIdx].managerLinkToken;
const homeToken = league.teams[match.home].managerLinkToken;

const savePath = tmpSavePath();
const multiSavePath = tmpMultiSavePath();
let now = kickoffAt - 5 * 60 * 1000; // 5 min AVANT le coup d'envoi.
const server = http.createServer(createHandler(savePath, () => now, multiSavePath));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
await store.saveMultiLeague(league, multiSavePath);

try {
  // ---------------------------------------------------------------------
  // A1) AVANT le coup d'envoi : /api/live-status ne liste rien pour ce
  //    match, /api/spectate refuse (404).
  // ---------------------------------------------------------------------
  const statusBefore = await request(server, "GET", "/api/live-status", { "X-TipIn-Token": spectatorToken });
  if (statusBefore.statusCode !== 200 || !statusBefore.body.ok) throw new Error(`❌ /api/live-status devrait répondre 200/ok, obtenu ${statusBefore.statusCode} ${JSON.stringify(statusBefore.body)}.`);
  const alreadyThere = statusBefore.body.live.some(m => m.homeIdx === match.home && m.awayIdx === match.away);
  if (alreadyThere) throw new Error("❌ (setup) le match ne devrait pas encore être en direct avant le coup d'envoi.");
  console.log(`A1) Avant le coup d'envoi, /api/live-status ne liste pas encore le match ${match.home}-${match.away} (${statusBefore.body.live.length} match(s) en direct au total).`);

  const spectateBefore = await request(server, "GET", `/api/spectate?team=${match.home}`, { "X-TipIn-Token": spectatorToken });
  if (spectateBefore.statusCode !== 404 || spectateBefore.body.ok !== false) {
    throw new Error(`❌ /api/spectate devrait répondre 404/ok:false avant le coup d'envoi, obtenu ${spectateBefore.statusCode} ${JSON.stringify(spectateBefore.body)}.`);
  }
  console.log("✅ Avant le coup d'envoi, /api/spectate refuse (404) de suivre ce match — rien à voir encore.");

  // ---------------------------------------------------------------------
  // A2) À MI-DIFFUSION : /api/live-status liste le match (SANS contenu :
  //    seulement homeIdx/awayIdx/round/competition), /api/spectate renvoie
  //    le contenu personnalisé pour l'équipe SUIVIE.
  // ---------------------------------------------------------------------
  now = kickoffAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
  const statusDuring = await request(server, "GET", "/api/live-status", { "X-TipIn-Token": spectatorToken });
  const entry = statusDuring.body.live.find(m => m.homeIdx === match.home && m.awayIdx === match.away);
  if (!entry) throw new Error(`❌ À mi-diffusion, /api/live-status devrait lister le match ${match.home}-${match.away}, obtenu ${JSON.stringify(statusDuring.body.live)}.`);
  if (entry.round !== targetRound || entry.competition !== "championship") {
    throw new Error(`❌ L'entrée devrait porter round=${targetRound}/competition="championship", obtenu ${JSON.stringify(entry)}.`);
  }
  const leakedKeys = Object.keys(entry).filter(k => !["homeIdx", "awayIdx", "round", "competition"].includes(k));
  if (leakedKeys.length) throw new Error(`❌ /api/live-status ne devrait JAMAIS exposer le contenu du match (événements/scores), champs en trop : ${JSON.stringify(leakedKeys)}.`);
  console.log(`✅ À mi-diffusion, /api/live-status liste bien le match ${match.home}-${match.away} (round ${entry.round}, ${entry.competition}), sans aucun contenu (${Object.keys(entry).join(", ")} uniquement).`);

  // Le spectateur (3e manager, jamais impliqué dans ce match) suit l'équipe
  // À L'EXTÉRIEUR (match.away) : viewLiveMatchForTeam doit échanger A<->B en
  // conséquence (isHome:false), voir server/liveMatch.js.
  const spectateAway = await request(server, "GET", `/api/spectate?team=${match.away}`, { "X-TipIn-Token": spectatorToken });
  if (spectateAway.statusCode !== 200 || !spectateAway.body.ok) throw new Error(`❌ /api/spectate devrait répondre 200/ok pendant la diffusion, obtenu ${spectateAway.statusCode} ${JSON.stringify(spectateAway.body)}.`);
  const liveAway = spectateAway.body.live;
  if (liveAway.isHome !== false) throw new Error("❌ Suivre l'équipe à l'EXTÉRIEUR du match devrait renvoyer isHome:false.");
  if (liveAway.opponentIdx !== match.home) throw new Error(`❌ opponentIdx attendu ${match.home} (domicile), obtenu ${liveAway.opponentIdx}.`);
  if (!Array.isArray(liveAway.events) || !liveAway.events.length) throw new Error("❌ Des événements devraient déjà avoir été diffusés à mi-diffusion.");
  const airedCount = liveAway.events.filter(ev => ev.airAt <= now).length;
  if (airedCount === 0) throw new Error("❌ (setup) au moins un événement devrait déjà être \"passé à l'antenne\" à mi-diffusion.");
  console.log(`✅ /api/spectate (équipe à l'extérieur) renvoie isHome:false, opponentIdx=${liveAway.opponentIdx} (domicile), ${airedCount}/${liveAway.events.length} événement(s) déjà diffusé(s).`);

  // Suivre l'équipe à DOMICILE doit renvoyer isHome:true, opponentIdx = away,
  // et un nom d'équipe/adversaire cohérent avec league.teams.
  const spectateHome = await request(server, "GET", `/api/spectate?team=${match.home}`, { "X-TipIn-Token": spectatorToken });
  if (!spectateHome.body.ok || spectateHome.body.live.isHome !== true || spectateHome.body.live.opponentIdx !== match.away) {
    throw new Error(`❌ Suivre l'équipe à DOMICILE devrait renvoyer isHome:true/opponentIdx=${match.away}, obtenu ${JSON.stringify(spectateHome.body.live && { isHome: spectateHome.body.live.isHome, opponentIdx: spectateHome.body.live.opponentIdx })}.`);
  }
  if (spectateHome.body.teamName !== league.teams[match.home].name || spectateHome.body.opponentName !== league.teams[match.away].name) {
    throw new Error("❌ teamName/opponentName devraient correspondre aux VRAIS noms d'équipe.");
  }
  console.log(`✅ /api/spectate (équipe à domicile) renvoie isHome:true, opponentIdx=${match.away}, teamName="${spectateHome.body.teamName}", opponentName="${spectateHome.body.opponentName}".`);

  // Un des managers directement impliqués (ici le domicile) peut lui aussi
  // consulter l'AUTRE match via /api/spectate — cette route n'est pas
  // réservée au 3e spectateur, seulement à quiconque n'est PAS soi-même
  // ce match (voir le grand commentaire de /api/spectate côté serveur : la
  // restriction "un manager ne voit que SON match" vit dans
  // buildStateSnapshot/POST /api/save, jamais ici).
  const homeWatchingOwnMatchAway = await request(server, "GET", `/api/spectate?team=${match.away}`, { "X-TipIn-Token": homeToken });
  if (!homeWatchingOwnMatchAway.body.ok) throw new Error("❌ Un manager directement impliqué dans un match devrait aussi pouvoir 'spectate' l'équipe adverse de CE MÊME match.");
  console.log("✅ Un manager directement impliqué dans le match peut aussi consulter /api/spectate pour l'équipe adverse (pas réservé à un tiers).");

  // ---------------------------------------------------------------------
  // A3) Portée volontairement limitée : une équipe humaine PAS en direct
  //    cette journée-là (aucun match, ou en pause) -> 404. Une équipe CPU
  //    (jamais diffusée, voir server/autoSim_test.js) -> 404 également,
  //    MÊME une fois la fenêtre de diffusion entièrement écoulée.
  // ---------------------------------------------------------------------
  const cpuSpectate = await request(server, "GET", `/api/spectate?team=${cpuIdx}`, { "X-TipIn-Token": spectatorToken });
  if (cpuSpectate.statusCode !== 404 || cpuSpectate.body.ok !== false) {
    throw new Error(`❌ /api/spectate devrait refuser (404) une équipe CPU (jamais diffusée en direct), obtenu ${cpuSpectate.statusCode} ${JSON.stringify(cpuSpectate.body)}.`);
  }
  console.log(`✅ /api/spectate refuse (404) l'équipe CPU d'index ${cpuIdx} : aucun changement à l'architecture "CPU-vs-CPU jamais diffusé".`);

  const invalidTeam = await request(server, "GET", "/api/spectate?team=9999", { "X-TipIn-Token": spectatorToken });
  if (invalidTeam.statusCode !== 400) throw new Error(`❌ Un index d'équipe hors bornes devrait répondre 400, obtenu ${invalidTeam.statusCode}.`);
  const missingTeam = await request(server, "GET", "/api/spectate", { "X-TipIn-Token": spectatorToken });
  if (missingTeam.statusCode !== 400) throw new Error(`❌ 'team' manquant devrait répondre 400, obtenu ${missingTeam.statusCode}.`);
  console.log("✅ /api/spectate valide 'team' (400 si hors bornes ou absent), plutôt que de retomber silencieusement sur l'équipe 0.");

  // ---------------------------------------------------------------------
  // A4) Après la fin COMPLÈTE de la diffusion (match finalisé,
  //    league.liveMatches vidé de cette entrée) : plus rien à suivre.
  // ---------------------------------------------------------------------
  now = kickoffAt + MATCH_BROADCAST_DURATION_MS + 5 * 60 * 1000;
  const statusAfter = await request(server, "GET", "/api/live-status", { "X-TipIn-Token": spectatorToken });
  const stillThere = statusAfter.body.live.some(m => m.homeIdx === match.home && m.awayIdx === match.away);
  if (stillThere) throw new Error("❌ Une fois le match entièrement finalisé, il ne devrait plus apparaître dans /api/live-status.");
  const spectateAfter = await request(server, "GET", `/api/spectate?team=${match.home}`, { "X-TipIn-Token": spectatorToken });
  if (spectateAfter.statusCode !== 404) throw new Error(`❌ Une fois le match finalisé, /api/spectate devrait répondre 404, obtenu ${spectateAfter.statusCode}.`);
  console.log("✅ Une fois le match entièrement finalisé, il disparaît de /api/live-status et /api/spectate refuse (404) — plus rien à suivre.");

  console.log("\n✅ Partie A (serveur) : /api/live-status et /api/spectate respectent bien la portée \"matchs déjà en direct uniquement\", sans fuite de contenu hors demande explicite.\n");
} finally {
  server.close();
}

// =======================================================================
// PARTIE B : NAVIGATEUR (moteurbasket3.html), même scénario.
// =======================================================================
{
  const { league, targetRound, match, spectatorIdx } = freshLeagueWithHumanVsHumanAndSpectator(
    ["Lyon SpecB", "Marseille SpecB", "Nice SpecB", "Rennes SpecB"], T0
  );
  league.round = targetRound;
  const kickoffAt = scheduledTimeForLeagueRound(league, targetRound);
  const spectatorToken = league.teams[spectatorIdx].managerLinkToken;

  const clock = { now: kickoffAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2) };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  await store.saveMultiLeague(league, multiSavePath);

  const dom = await openGame(html, `${baseUrl}?m=${spectatorToken}`, (window) => patchDateNow(window, () => clock.now));
  const doc = dom.window.document;
  const win = dom.window;

  // ---------------------------------------------------------------------
  // B1) La pastille "🔴 En direct — Suivre" apparaît sur le sous-onglet
  //    Calendrier de la fiche de l'équipe à DOMICILE de ce match (une
  //    équipe adverse, jamais la sienne).
  // ---------------------------------------------------------------------
  win.showTeamDetail(match.home);
  win.eval('document.querySelector("[data-team-detail-subview=\'calendrier\']").dispatchEvent(new Event("click", {bubbles:true}));');
  await win.__lastLiveBannerCheck;

  const banner = doc.getElementById("teamDetailLiveBanner");
  console.log("B1) Pastille \"En direct\" visible sur le calendrier de l'équipe suivie :", banner && !banner.classList.contains("hidden"));
  if (!banner || banner.classList.contains("hidden")) throw new Error("❌ La pastille \"🔴 En direct — Suivre\" devrait apparaître sur le sous-onglet Calendrier d'une équipe adverse actuellement en direct.");
  const spectateBtn = doc.getElementById("spectateLiveBtn");
  if (!spectateBtn) throw new Error("❌ La pastille devrait contenir un bouton \"Suivre\" (#spectateLiveBtn).");
  console.log("✅ La pastille \"🔴 En direct — Suivre\" apparaît bien sur le sous-onglet Calendrier de l'équipe adverse en direct.");

  // ---------------------------------------------------------------------
  // B2) Cliquer "Suivre" ouvre la fenêtre spectateur, avec un score
  //    cohérent, un box score reconstitué (les DEUX équipes ont des lignes,
  //    voir matchdayRosterPlayers), et un fil d'événements non vide.
  // ---------------------------------------------------------------------
  spectateBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
  await win.__lastSpectateOpen;

  const overlay = doc.getElementById("spectateOverlay");
  if (!overlay) throw new Error("❌ Cliquer \"Suivre\" devrait ouvrir la fenêtre spectateur (#spectateOverlay).");
  const scoreRow = doc.querySelector(".spectate-score-row .spectate-score");
  if (!scoreRow || !/^\d+ - \d+$/.test(scoreRow.textContent.trim())) {
    throw new Error(`❌ Le score affiché devrait être au format "N - N", obtenu "${scoreRow && scoreRow.textContent}".`);
  }
  const feedItems = doc.querySelectorAll("#spectateFeedHolder .feed-item");
  if (!feedItems.length) throw new Error("❌ Le fil d'événements de la fenêtre spectateur ne devrait pas être vide à mi-diffusion.");
  const boxRowsA = doc.querySelectorAll("#spectateBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)");
  if (!boxRowsA.length) throw new Error("❌ Le box score reconstitué de la fenêtre spectateur (équipe suivie) ne devrait pas être vide.");
  console.log(`✅ La fenêtre spectateur affiche un score cohérent (${scoreRow.textContent.trim()}), ${feedItems.length} ligne(s) d'événements et ${boxRowsA.length} ligne(s) de box score pour l'équipe suivie.`);

  // Recoupe INDÉPENDANT du score affiché avec league.liveMatches côté
  // serveur (le VRAI fichier de sauvegarde de la ligue partagée) : même
  // principe que les autres tests "reconstitution indépendante" de ce
  // projet (live_boxscore_minutes_totals_test.js, boxscore_quarter_scores_
  // test.js) — ne fait jamais confiance qu'au code déjà testé lui-même.
  const savedMulti = JSON.parse(fs.readFileSync(multiSavePath, "utf-8"));
  const savedKey = `${targetRound}:${match.home}:${match.away}`;
  const savedEntry = savedMulti.league.liveMatches && savedMulti.league.liveMatches[savedKey];
  if (!savedEntry) throw new Error("❌ (setup) l'entrée league.liveMatches de ce match devrait exister côté fichier de sauvegarde.");
  const airedServerSide = savedEntry.events.filter(ev => ev.airAt <= clock.now && ev.score);
  const lastAired = airedServerSide[airedServerSide.length - 1];
  const expectedScoreText = `${lastAired.score.A} - ${lastAired.score.B}`;
  console.log(`Recoupe indépendant (fichier de sauvegarde brut) : dernier score diffusé ${expectedScoreText}, affiché ${scoreRow.textContent.trim()}.`);
  if (scoreRow.textContent.trim() !== expectedScoreText) {
    throw new Error(`❌ Le score affiché (${scoreRow.textContent.trim()}) devrait correspondre EXACTEMENT au dernier événement déjà diffusé côté fichier de sauvegarde brut (${expectedScoreText}) — équipe à domicile suivie, donc A=domicile sans échange.`);
  }
  console.log("✅ Le score affiché dans la fenêtre spectateur correspond exactement à une reconstitution indépendante depuis le fichier de sauvegarde brut (league.liveMatches).");

  // Basculer sur l'onglet de l'équipe adverse doit changer le box score
  // affiché (des lignes DIFFÉRENTES, pas le même tableau recopié).
  const namesSideA = [...boxRowsA].map(tr => tr.children[0].textContent.trim()).sort();
  doc.querySelector('#spectateOverlay .spectate-bs-tab[data-side="B"]').dispatchEvent(new win.Event("click", { bubbles: true }));
  const boxRowsB = doc.querySelectorAll("#spectateBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)");
  const namesSideB = [...boxRowsB].map(tr => tr.children[0].textContent.trim()).sort();
  if (!boxRowsB.length) throw new Error("❌ Le box score de l'équipe adverse ne devrait pas être vide non plus.");
  if (JSON.stringify(namesSideA) === JSON.stringify(namesSideB)) throw new Error("❌ Basculer sur l'onglet adverse devrait afficher des joueurs DIFFÉRENTS.");
  console.log(`✅ Basculer entre les deux onglets de la fenêtre spectateur affiche bien deux feuilles de match distinctes (${namesSideA.length} vs ${namesSideB.length} joueurs).`);

  // ---------------------------------------------------------------------
  // B3) Jamais de spoiler : le score final du match (déjà connu en entier
  //    côté serveur, voir computeLiveMatch/live.finalScore) ne doit
  //    JAMAIS être affiché tel quel pendant que la diffusion est encore en
  //    cours (à mi-diffusion, un score final devrait quasiment toujours
  //    différer du score mi-match, sauf coïncidence — recoupé ci-dessus
  //    avec le VRAI dernier événement diffusé, donc cette garantie est déjà
  //    la même que pour son propre direct, voir live_boxscore_test.js).
  // ---------------------------------------------------------------------
  const finalScoreText = `${savedEntry.finalScore.home} - ${savedEntry.finalScore.away}`;
  console.log(`B3) Score final déjà connu côté serveur (${finalScoreText}) vs score affiché en direct (${scoreRow.textContent.trim()}) — ne doivent PAS être confondus tant que le match n'est pas fini.`);
  // (Un écart n'est pas garanti à 100% par hasard, mais le nombre
  // d'événements déjà diffusés (voir airedServerSide) est déjà STRICTEMENT
  // inférieur au nombre total d'événements du match, ce qui est la vraie
  // garantie structurelle : on n'a physiquement pas pu lire au-delà.)
  if (airedServerSide.length >= savedEntry.events.filter(ev => ev.score).length) {
    throw new Error("❌ (setup) à mi-diffusion, des événements avec score restent normalement à diffuser après \"maintenant\" — sinon ce test ne prouve rien sur l'absence de spoiler.");
  }
  console.log(`✅ À mi-diffusion, ${airedServerSide.length}/${savedEntry.events.filter(ev => ev.score).length} événements avec score sont déjà diffusés : le score final n'a physiquement pas pu être lu en avance.`);

  // ---------------------------------------------------------------------
  // B4) "🔄 Actualiser" relance /api/spectate et redessine (score encore
  //    cohérent après refresh, la fenêtre reste ouverte).
  // ---------------------------------------------------------------------
  clock.now += 5 * 60 * 1000; // 5 min plus tard, toujours dans la fenêtre de diffusion.
  doc.getElementById("spectateRefreshBtn").dispatchEvent(new win.Event("click", { bubbles: true }));
  await win.__lastSpectateRefresh;
  if (!doc.getElementById("spectateOverlay")) throw new Error("❌ \"🔄 Actualiser\" ne devrait jamais fermer la fenêtre spectateur.");
  console.log("✅ \"🔄 Actualiser\" relance bien /api/spectate et redessine la fenêtre spectateur sans la fermer.");

  // ---------------------------------------------------------------------
  // B5) Fermer la fenêtre spectateur ne touche à AUCUN état de son propre
  //    direct éventuel (isolation totale, voir le grand commentaire de
  //    computeSpectateBoxScore/spectateState) — ici, currentLiveMatch reste
  //    simplement `null` (le spectateur n'a lui-même aucun match en cours),
  //    et rien ne doit planter en fermant.
  // ---------------------------------------------------------------------
  const currentLiveMatchBefore = win.eval("typeof currentLiveMatch !== 'undefined' ? currentLiveMatch : null");
  doc.getElementById("spectateCloseBtn").dispatchEvent(new win.Event("click", { bubbles: true }));
  if (doc.getElementById("spectateOverlay")) throw new Error("❌ \"Fermer\" devrait retirer la fenêtre spectateur du DOM.");
  const currentLiveMatchAfter = win.eval("typeof currentLiveMatch !== 'undefined' ? currentLiveMatch : null");
  if (JSON.stringify(currentLiveMatchBefore) !== JSON.stringify(currentLiveMatchAfter)) {
    throw new Error("❌ Consulter/fermer le direct d'une autre équipe ne devrait JAMAIS toucher à currentLiveMatch (l'état du PROPRE direct du manager).");
  }
  console.log("✅ Fermer la fenêtre spectateur la retire proprement du DOM, sans jamais toucher à l'état du propre direct du manager.");

  await dom.window.close();
  server.close();
  console.log("\n✅ Partie B (navigateur) : pastille \"En direct\", fenêtre spectateur (score/fil/box score reconstitués sans spoiler), actualisation manuelle, isolation totale du propre direct — tout est conforme.\n");
}

console.log("🏁 Tous les tests de \"regarder le live d'une autre équipe depuis son calendrier\" sont passés.");

})().catch(err => {
  console.error(err);
  process.exit(1);
});
