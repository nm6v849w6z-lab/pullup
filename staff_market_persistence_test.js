// Vérifie le correctif 2026-09 (retour utilisateur Discord : "Sur la page
// staff, reset des enchères et du temps à chaque refresh de la page") : en
// ligue partagée (multi-manager), les marchés de staff (entraîneur,
// analyste vidéo, recruteur) doivent survivre à un rechargement complet de
// la page, exactement comme le reste de l'état du club.
//
// Deux bugs distincts, cumulés :
//   1) League.refreshRecruiterMarket(now) était OUBLIÉ dans catchUpLeague
//      (server/autoSim.js), contrairement à refreshMarket/refreshCoachMarket/
//      refreshAnalystMarket : league.recruiterListings n'était donc JAMAIS
//      rafraîchi côté serveur (voir server/autoSim_test.js pour le test
//      dédié à cette partie-là, purement moteur/serveur).
//   2) MÊME UNE FOIS rafraîchis côté serveur, ces marchés ne survivaient pas
//      à un rechargement : server/index.js:tick() ne persistait qu'en
//      présence d'un événement "notable" (match résolu, diffusion démarrée,
//      interview purgée) : jamais pour une simple génération de candidat ou
//      résolution d'enchère de staff, qui ne pousse rien dans `events`. Une
//      requête en lecture seule (/api/state, la SEULE que le navigateur
//      envoie à l'ouverture d'une page) régénérait donc le marché en
//      mémoire sans jamais l'écrire sur disque : le rechargement suivant
//      repartait du même fichier non modifié et tirait un tout autre lot de
//      candidats/enchères/échéances, semblant "se réinitialiser" à chaque
//      refresh.
//
// Ce fichier vérifie le résultat de bout en bout, à travers de VRAIES
// requêtes HTTP vers un VRAI serveur (comme cup_ordres_planning_test.js) :
// deux "sessions" indépendantes (= deux rechargements complets de la page)
// contre le MÊME serveur doivent voir EXACTEMENT le même marché de staff.
const fs = require("fs");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 22, 7, 0, 0); // 22 septembre 2026, 09h Paris (CEST), mardi arbitraire

(async () => {
  const league = generateMultiManagerLeague(["Lyon StaffPersist"], 1, T0, dailyAnchoredCalendarConfig());
  const team0 = league.teams[0];
  const managerToken = team0.managerLinkToken;
  if (!managerToken) throw new Error("❌ (setup) l'équipe humaine devrait porter un managerLinkToken (voir generateMultiManagerLeague).");
  if (league.recruiterListings.length !== 0 || league.coachListings.length !== 0) {
    throw new Error("❌ (setup) une ligue fraîchement générée ne devrait porter aucune annonce de staff avant le premier tick serveur.");
  }

  const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
  await store.saveMultiLeague(league, multiSavePath);

  // --- "Session" 1 : premier chargement de la page (= 1er GET /api/state
  // côté serveur, déclenché par openGame ci-dessous), puis ouverture de
  // l'onglet Staff (qui rafraîchit aussi localement, côté navigateur, sans
  // effet sur la persistance en ligue partagée, voir saveMyTeam()).
  const dom1 = await openGame(html, `${baseUrl}?m=${managerToken}`);
  dom1.window.eval("TAB_HANDLERS.staff();");
  const recruiterIds1 = dom1.window.eval("league.recruiterListings.map(l => l.id).join(',')");
  const coachIds1 = dom1.window.eval("league.coachListings.map(l => l.id).join(',')");
  const analystIds1 = dom1.window.eval("league.analystListings.map(l => l.id).join(',')");
  console.log("Session 1 - recruteurs:", recruiterIds1, "| entraîneurs:", coachIds1, "| analystes:", analystIds1);
  if (!recruiterIds1) throw new Error("❌ Le marché des recruteurs devrait déjà être peuplé dès le premier chargement de la page.");

  // --- Vérifie DIRECTEMENT le fichier de sauvegarde serveur (pas seulement
  // ce que la session 1 affiche localement) : le marché de recruteurs doit
  // avoir été réellement ÉCRIT sur disque par le GET /api/state ci-dessus,
  // pas seulement calculé en mémoire pour cette seule réponse HTTP.
  const savedLeague = (await store.loadMultiLeague(multiSavePath)).league;
  console.log("Fichier serveur - recruterListings persistés :", savedLeague.recruiterListings.length, "| coachListings persistés :", savedLeague.coachListings.length);
  if (savedLeague.recruiterListings.length === 0) {
    throw new Error("❌ RÉGRESSION : le marché des recruteurs généré par le serveur devrait être persisté sur disque (voir server/index.js:tick, `changed`), pas seulement renvoyé dans la réponse HTTP puis perdu.");
  }
  if (savedLeague.coachListings.length === 0) {
    throw new Error("❌ RÉGRESSION : le marché des entraîneurs devrait lui aussi être persisté sur disque après le premier GET /api/state.");
  }
  console.log("✅ Le marché de staff généré par le serveur est bien écrit sur disque, pas seulement renvoyé dans la réponse HTTP.");

  // --- "Session" 2 : un DEUXIÈME chargement complet de la page (nouvelle
  // JSDOM vers le même serveur, exactement le scénario "j'appuie sur F5" du
  // retour utilisateur) doit voir EXACTEMENT le même marché que la session 1,
  // pas un lot différent tiré au hasard.
  const dom2 = await openGame(html, `${baseUrl}?m=${managerToken}`);
  dom2.window.eval("TAB_HANDLERS.staff();");
  const recruiterIds2 = dom2.window.eval("league.recruiterListings.map(l => l.id).join(',')");
  const coachIds2 = dom2.window.eval("league.coachListings.map(l => l.id).join(',')");
  const analystIds2 = dom2.window.eval("league.analystListings.map(l => l.id).join(',')");
  console.log("Session 2 (rechargement complet) - recruteurs:", recruiterIds2, "| entraîneurs:", coachIds2, "| analystes:", analystIds2);

  dom1.window.close();
  dom2.window.close();

  if (recruiterIds1 !== recruiterIds2) {
    throw new Error(`❌ RÉGRESSION : le marché des recruteurs a changé après un simple rechargement de page (session 1: ${recruiterIds1}, session 2: ${recruiterIds2}) alors qu'aucune enchère n'a expiré entre les deux.`);
  }
  if (coachIds1 !== coachIds2) {
    throw new Error(`❌ RÉGRESSION : le marché des entraîneurs a changé après un simple rechargement de page (session 1: ${coachIds1}, session 2: ${coachIds2}).`);
  }
  if (analystIds1 !== analystIds2) {
    throw new Error(`❌ RÉGRESSION : le marché des analystes vidéo a changé après un simple rechargement de page (session 1: ${analystIds1}, session 2: ${analystIds2}).`);
  }
  console.log("✅ Un rechargement complet de la page (2e session indépendante contre le même serveur) voit EXACTEMENT le même marché de staff (recruteurs, entraîneurs, analystes vidéo), plus de reset aléatoire.");

  server.close();
  console.log("\n✅ Persistance du marché de staff (server/index.js:tick + server/autoSim.js:catchUpLeague) : le marché de staff d'une ligue partagée survit bien à un rechargement complet de la page.");
})().catch(e => { console.error(e); process.exit(1); });
