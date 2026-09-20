// Vérifie le correctif 2026-09 (retour utilisateur Discord, Diablue : "Sur la
// page calendrier, le bouton ordre ne pas qu'a modifier vos ordres qu'après
// un refresh complet de la page") : cliquer sur le bouton "📋 Ordres" d'une
// journée FUTURE, alors qu'un direct en cours pour une AUTRE journée vient de
// se terminer côté client (fenêtre de diffusion écoulée mais pas encore
// rattrapé par le navigateur), doit tout de même amener le joueur sur la
// journée qu'il a cliquée, pas sur le repli générique "prochain match".
//
// Bug (goToOrdresTab, moteurbasket3.html) : quand `league.liveMatch` existe
// et que `liveMatchHasEnded(league.liveMatch)` est vrai, goToOrdresTab
// redirigeait vers refreshFromServerAndReenter(league.liveMatch.round,
// league.liveMatch.competition) sans jamais transmettre le `round`/
// `competition` que le joueur avait lui-même demandés : une fois l'état
// serveur à jour, refreshFromServerAndReenter retombait systématiquement sur
// enterNextMatchOrShowSeasonEnd(), qui atterrit sur le prochain match par
// défaut, PAS sur la journée cliquée. Comme un chargement de page complet
// (F5) résout ce direct périmé AVANT que le joueur ne clique quoi que ce
// soit, le bug ne se manifestait qu'en cliquant sur "Ordres" depuis
// l'application déjà ouverte, sans refresh, d'où le symptôme rapporté :
// "ne fonctionne qu'après un refresh complet de la page".
const fs = require("fs");
const Engine = require("./engine.js");
const { generateMultiManagerLeague } = Engine;
const Calendar = require("./server/calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;
const store = require("./server/store.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

const T0 = Date.UTC(2026, 8, 22, 7, 0, 0); // 22 septembre 2026, mardi arbitraire

(async () => {
  const league = generateMultiManagerLeague(["Lyon OrdresRedirect"], 1, T0, dailyAnchoredCalendarConfig());
  const team0 = league.teams[0];
  const managerToken = team0.managerLinkToken;
  if (!managerToken) throw new Error("❌ (setup) l'équipe humaine devrait porter un managerLinkToken.");

  const { server, multiSavePath, baseUrl } = await startTestServer(() => T0);
  await store.saveMultiLeague(league, multiSavePath);

  const dom1 = await openGame(html, `${baseUrl}?m=${managerToken}`);
  const win1 = dom1.window;
  const doc1 = win1.document;
  // Fige l'horloge du navigateur sur T0 : sans ça, liveMatchHasEnded (qui
  // compare Date.now() réel à liveMatch.kickoffAt) donnerait un résultat
  // incohérent selon le moment réel où ce test tourne (voir patchDateNow).
  patchDateNow(win1, () => T0);

  win1.eval("TAB_HANDLERS.calendrier();");
  const currentRound = win1.eval("currentMatch ? currentMatch.round : null");
  if (typeof currentRound !== "number") throw new Error("❌ (setup) currentMatch.round devrait être un nombre.");

  // Simule un direct pour la journée IMMÉDIATE (currentRound) dont la
  // fenêtre de diffusion est déjà écoulée, mais que le client n'a pas encore
  // rattrapé côté serveur (pas de requête réseau depuis).
  win1.eval(`
    league.liveMatch = {
      round: ${currentRound}, competition: "championship",
      kickoffAt: ${T0} - 1000000, totalDurationMs: 60000,
      opponentIdx: 1, isHome: true, homeScore: 88, awayScore: 76,
    };
  `);
  if (win1.eval("liveMatchHasEnded(league.liveMatch)") !== true) {
    throw new Error("❌ (setup) le direct simulé devrait être considéré comme terminé.");
  }

  // Le joueur clique sur "Ordres" pour une journée FUTURE différente, PAS
  // celle du direct périmé.
  const targetRound = currentRound + 2;
  const targetBtn = [...doc1.querySelectorAll(".calendar-order-btn[data-tab='ordres'][data-competition='championship']")]
    .find(b => Number(b.dataset.round) === targetRound);
  if (!targetBtn) throw new Error(`❌ (setup) bouton Ordres introuvable pour le round ${targetRound}.`);

  targetBtn.click();
  await new Promise(r => setTimeout(r, 300));

  const landedRound = win1.eval("selectedOrdresRound");
  console.log(`Round demandé : ${targetRound} | round où le joueur a atterri après clic (avec direct périmé en attente) : ${landedRound}`);
  if (landedRound !== targetRound) {
    throw new Error(`❌ RÉGRESSION : cliquer sur "Ordres" pour le round ${targetRound} pendant qu'un direct périmé attend d'être rattrapé aurait dû y amener le joueur directement, mais il a atterri sur le round ${landedRound}.`);
  }

  const prepVisible = !doc1.getElementById("prepSection").classList.contains("hidden");
  if (!prepVisible) {
    throw new Error("❌ RÉGRESSION : l'écran de préparation des ordres devrait être affiché après le clic.");
  }

  dom1.window.close();
  server.close();
  console.log("✅ Le bouton \"Ordres\" amène bien sur la journée cliquée, même quand un direct périmé attend d'être rattrapé côté serveur (plus besoin d'un refresh complet de la page).");
})().catch(e => { console.error(e); process.exit(1); });
