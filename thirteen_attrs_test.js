// Vérifie les 3 caractéristiques ajoutées (retour utilisateur, 2026-09) :
// "Il faudrait ajouter les lignes de carac suivantes: Mental (utile pour les
// fins de matchs notamment ou pour se sortir d'une serie de mauvais choix)
// Endurance Lancer Franc".
//
// Décisions de design confirmées par l'utilisateur (AskUserQuestion) :
// - Mental : "Les deux" -> boost clutch (fin de match serrée, voir la
//   fenêtre "clutch" déjà existante) ET malus de "tilt" après une série de
//   ratés/pertes de balle, minimisé/annulé par un Mental élevé.
// - Endurance : "Fatigue en match" -> réduit l'accumulation de fatigue EN
//   MATCH propre à CE joueur (version individuelle de l'Espace bien-être),
//   PAS la récupération jour après jour (Player.condition).
// - Lancer franc : remplace directement l'ancien proxy sur midRange dans
//   MatchEngine.freeThrows.
//
// Voir engine.js : le grand commentaire au-dessus d'ATTRS, Player.overall(),
// Player.consecutiveMisses, playerFromSave (migration), MatchEngine.freeThrows,
// MatchEngine.applyFatigue (enduranceMult), MatchEngine.playPossession
// (mentalClutchBoost/tiltPenalty).
//
// Tests MOTEUR (pas de DOM) pour la logique de simulation, plus une
// vérification jsdom légère pour l'affichage des 3 nouvelles colonnes dans
// l'onglet Effectif (voir tabs_test.js pour le même patron).
const fs = require("fs");
const E = require("./engine.js");
const {
  generateStartingRoster, MatchEngine, Player, clamp, ATTRS,
  serializeTeam, teamFromSave,
} = E;
const { startTestServer, openGame } = require("./test_helpers.js");

const T0 = Date.now();

// ---------------------------------------------------------------------
// 1) overall() moyenne désormais les 13 caractéristiques, pas 10.
// ---------------------------------------------------------------------
(function testOverallUsesThirteenAttributes() {
  const team = generateStartingRoster("Overall Test");
  const p = team.players[0];
  const values = {
    midRange: 60, threePoint: 50, inside: 40, pass: 70, rebound: 55,
    block: 45, dribble: 65, agility: 58, defOutside: 52, defInside: 48,
    mental: 80, endurance: 20, freeThrow: 90,
  };
  p.attrs = { ...values };
  const expected = Object.values(values).reduce((a, b) => a + b, 0) / 13;
  const got = p.overall();
  console.log(`overall() sur un profil connu : obtenu ${got.toFixed(3)}, attendu ${expected.toFixed(3)} (moyenne des 13 caractéristiques).`);
  if (Math.abs(got - expected) > 0.001) {
    throw new Error(`❌ overall() devrait faire la moyenne des 13 caractéristiques (attendu ${expected}, obtenu ${got}).`);
  }
  console.log("✅ overall() moyenne bien les 13 caractéristiques, Mental/Endurance/Lancer franc comptant comme les 10 d'origine.");
})();

// ---------------------------------------------------------------------
// 2) Migration : sauvegarde antérieure à cette fonctionnalité (mental/
//    endurance/freeThrow absents de pdata.attrs) -> playerFromSave (via
//    teamFromSave) dérive des valeurs valides, jamais de NaN.
// ---------------------------------------------------------------------
(function testMigrationShimForMissingAttrs() {
  const team = generateStartingRoster("Migration Team");
  const saved = serializeTeam(team);
  saved.players.forEach(p => { delete p.attrs.mental; delete p.attrs.endurance; delete p.attrs.freeThrow; });

  const reloaded = teamFromSave(saved);
  let checked = 0;
  reloaded.players.forEach(p => {
    ["mental", "endurance", "freeThrow"].forEach(k => {
      const v = p.attrs[k];
      if (typeof v !== "number" || Number.isNaN(v) || v < 1 || v > 99) {
        throw new Error(`❌ Migration : "${k}" devrait être un nombre valide (1-99) après rechargement d'une sauvegarde ancienne, obtenu ${v} pour ${p.name}.`);
      }
      checked++;
    });
    if (Number.isNaN(p.overall())) throw new Error(`❌ overall() ne devrait jamais être NaN après migration (joueur ${p.name}).`);
  });
  console.log(`✅ Une sauvegarde antérieure à cette fonctionnalité (mental/endurance/freeThrow absents de ${reloaded.players.length} joueurs, ${checked} valeurs vérifiées) se recharge sans erreur, avec des valeurs dérivées valides et overall() non-NaN.`);
})();

// ---------------------------------------------------------------------
// 3) Lancer franc : freeThrows() utilise désormais l'attribut dédié
//    "freeThrow", plus du tout midRange. Vérifié statistiquement (la seule
//    part aléatoire est Math.random() < ftPct par lancer) : le taux de
//    réussite observé doit converger vers eff("freeThrow") tel que calculé
//    par la formule, ET rester inchangé quand seul midRange varie.
// ---------------------------------------------------------------------
(function testFreeThrowUsesDedicatedAttribute() {
  const team = generateStartingRoster("FT Team");
  const opponent = generateStartingRoster("FT Opponent");
  team.resetForMatch(T0);
  opponent.resetForMatch(T0);
  const shooter = team.players[0];
  shooter.fatigue = 0;
  const me = new MatchEngine(team, opponent);
  const N = 3000;

  function trial(freeThrowValue, midRangeValue) {
    shooter.attrs.freeThrow = freeThrowValue;
    shooter.attrs.midRange = midRangeValue;
    const expectedPct = clamp(0.50 + (shooter.eff("freeThrow") / 100) * 0.42, 0.50, 0.93);
    shooter.stats = shooter.emptyStats();
    const events = [];
    for (let i = 0; i < N; i++) me.freeThrows(shooter, 1, events, 1, 600, team);
    const observedPct = shooter.stats.ftm / shooter.stats.fta;
    return { expectedPct, observedPct };
  }

  // a) freeThrow bas, midRange haut : le proxy midRange, s'il était encore
  //    utilisé, produirait un TRÈS bon taux. On vérifie que ce n'est pas
  //    le cas : le taux observé doit suivre freeThrow (bas), pas midRange.
  const lowFtHighMid = trial(5, 95);
  console.log(`freeThrow=5, midRange=95 : ${(lowFtHighMid.observedPct * 100).toFixed(1)}% observé (attendu ~${(lowFtHighMid.expectedPct * 100).toFixed(1)}%, sur ${N} lancers).`);
  if (Math.abs(lowFtHighMid.observedPct - lowFtHighMid.expectedPct) > 0.04) {
    throw new Error(`❌ Taux de lancers francs observé (${lowFtHighMid.observedPct}) trop éloigné de l'attendu (${lowFtHighMid.expectedPct}) pour freeThrow=5.`);
  }
  if (lowFtHighMid.observedPct > 0.65) {
    throw new Error(`❌ Un freeThrow bas (5) ne devrait PAS produire un bon taux de lancers francs même avec un midRange élevé (obtenu ${(lowFtHighMid.observedPct * 100).toFixed(1)}%) : le proxy midRange semble encore utilisé.`);
  }

  // b) freeThrow haut, midRange bas : symétrique.
  const highFtLowMid = trial(95, 5);
  console.log(`freeThrow=95, midRange=5 : ${(highFtLowMid.observedPct * 100).toFixed(1)}% observé (attendu ~${(highFtLowMid.expectedPct * 100).toFixed(1)}%, sur ${N} lancers).`);
  if (Math.abs(highFtLowMid.observedPct - highFtLowMid.expectedPct) > 0.04) {
    throw new Error(`❌ Taux de lancers francs observé (${highFtLowMid.observedPct}) trop éloigné de l'attendu (${highFtLowMid.expectedPct}) pour freeThrow=95.`);
  }
  if (highFtLowMid.observedPct < 0.75) {
    throw new Error(`❌ Un freeThrow élevé (95) devrait produire un bon taux de lancers francs même avec un midRange bas (obtenu ${(highFtLowMid.observedPct * 100).toFixed(1)}%).`);
  }

  console.log("✅ MatchEngine.freeThrows() utilise bien l'attribut dédié \"freeThrow\" (et plus midRange) pour la réussite aux lancers francs.");
})();

// ---------------------------------------------------------------------
// 4) Endurance : applyFatigue() accumule moins de fatigue EN MATCH pour un
//    joueur à haute endurance, formule déterministe (pas d'aléa dans
//    l'accumulation elle-même, seul le risque de blessure l'est).
// ---------------------------------------------------------------------
(function testEnduranceReducesMatchFatigueAccumulation() {
  const team = generateStartingRoster("Endurance Team");
  const opponent = generateStartingRoster("Endurance Opponent");
  team.resetForMatch(T0);
  opponent.resetForMatch(T0);
  const onCourt = team.onCourtPlayers();
  if (onCourt.length < 2) throw new Error("❌ Il faudrait au moins 2 joueurs sur le terrain pour ce test.");
  const [pLow, pHigh] = onCourt;
  pLow.attrs.endurance = 1; pLow.fatigue = 0;
  pHigh.attrs.endurance = 99; pHigh.fatigue = 0;

  const me = new MatchEngine(team, opponent);
  const seconds = 300;
  me.applyFatigue(team, "Normal", seconds, 1, 600, []);

  // Reproduction de la formule (mult=1 pour "Normal", wellnessMult=1 sans
  // Espace bien-être construit, voir facilityLevels.wellness=0 par défaut).
  const expectedLow = clamp((seconds / 24) * 1 * 1 * (1.25 - (1 / 100) * 0.5), 0, 100);
  const expectedHigh = clamp((seconds / 24) * 1 * 1 * (1.25 - (99 / 100) * 0.5), 0, 100);
  console.log(`Endurance=1 : fatigue accumulée = ${pLow.fatigue.toFixed(2)} (attendu ${expectedLow.toFixed(2)}) | Endurance=99 : fatigue accumulée = ${pHigh.fatigue.toFixed(2)} (attendu ${expectedHigh.toFixed(2)}).`);
  if (Math.abs(pLow.fatigue - expectedLow) > 0.01) throw new Error(`❌ Fatigue accumulée (endurance=1) attendue ${expectedLow}, obtenue ${pLow.fatigue}.`);
  if (Math.abs(pHigh.fatigue - expectedHigh) > 0.01) throw new Error(`❌ Fatigue accumulée (endurance=99) attendue ${expectedHigh}, obtenue ${pHigh.fatigue}.`);
  if (!(pHigh.fatigue < pLow.fatigue)) throw new Error("❌ Un joueur à haute endurance devrait accumuler MOINS de fatigue qu'un joueur à basse endurance, à minutes égales.");
  console.log("✅ applyFatigue() réduit bien l'accumulation de fatigue EN MATCH pour un joueur à haute endurance (pivot à 50 = comportement inchangé pour un joueur moyen).");
})();

// ---------------------------------------------------------------------
// 5) Mental / tilt - comptabilité : consecutiveMisses se remet à 0 sur un
//    tir réussi, s'incrémente de 1 sur un tir manqué (vérifié sur de vrais
//    tirs générés par playPossession, pas une simulation isolée).
// ---------------------------------------------------------------------
(function testConsecutiveMissesBookkeeping() {
  const team = generateStartingRoster("Tilt Bookkeeping");
  const opponent = generateStartingRoster("Tilt Bookkeeping Def");
  team.resetForMatch(T0);
  opponent.resetForMatch(T0);
  const me = new MatchEngine(team, opponent);
  const events = [];
  let checked = 0;
  for (let i = 0; i < 600; i++) {
    const before = new Map(team.onCourtPlayers().map(p => [p.id, p.consecutiveMisses]));
    me.playPossession(team, opponent, 1, 600, events, 0);
    const last = events[events.length - 1];
    if (last.type !== "shot" || !last.shooter) continue;
    const p = team.players.find(x => x.name === last.shooter);
    if (!p) continue;
    checked++;
    if (last.made) {
      if (p.consecutiveMisses !== 0) throw new Error(`❌ Après un tir réussi, consecutiveMisses devrait être 0, obtenu ${p.consecutiveMisses} pour ${p.name}.`);
    } else {
      const prev = before.get(p.id) || 0;
      if (p.consecutiveMisses !== prev + 1) throw new Error(`❌ Après un tir manqué, consecutiveMisses devrait passer de ${prev} à ${prev + 1}, obtenu ${p.consecutiveMisses} pour ${p.name}.`);
    }
  }
  if (checked < 50) throw new Error(`❌ Pas assez de tirs observés pour valider ce test (${checked}).`);
  console.log(`✅ consecutiveMisses se remet à 0 sur un tir réussi et s'incrémente de 1 sur un tir manqué (vérifié sur ${checked} tirs réels de playPossession).`);
})();

// ---------------------------------------------------------------------
// 6) Mental - boost clutch : en fenêtre clutch (Q4, ≤2min, écart ≤8), un
//    Mental élevé doit améliorer significativement la réussite au tir par
//    rapport à un Mental bas, à tout le reste égal (isolé du tilt en
//    forçant consecutiveMisses=0 avant chaque tentative).
// ---------------------------------------------------------------------
(function testMentalClutchBoost() {
  const baseOff = generateStartingRoster("Clutch Off Base");
  const baseDef = generateStartingRoster("Clutch Def Base");

  function variant(mentalValue) {
    const team = teamFromSave(serializeTeam(baseOff));
    team.players.forEach(p => { p.attrs.mental = mentalValue; });
    return team;
  }

  function simulate(mentalValue, n) {
    const off = variant(mentalValue);
    const def = teamFromSave(serializeTeam(baseDef));
    off.resetForMatch(T0);
    def.resetForMatch(T0);
    const me = new MatchEngine(off, def);
    const events = [];
    for (let i = 0; i < n; i++) {
      off.onCourtPlayers().forEach(p => { p.consecutiveMisses = 0; }); // neutralise le tilt
      me.playPossession(off, def, 4, 60, events, 3); // clutch : Q4, 1min, écart de 3
    }
    const fgm = off.players.reduce((s, p) => s + p.stats.fgm2 + p.stats.fgm3, 0);
    const fga = off.players.reduce((s, p) => s + p.stats.fga2 + p.stats.fga3, 0);
    return fgm / fga;
  }

  const N = 4000;
  const highPct = simulate(99, N);
  const lowPct = simulate(1, N);
  const gap = highPct - lowPct;
  console.log(`Réussite au tir en clutch - Mental=99 : ${(highPct * 100).toFixed(1)}% | Mental=1 : ${(lowPct * 100).toFixed(1)}% | écart : ${(gap * 100).toFixed(1)} pts (formule : ~11.8 pts attendus).`);
  if (gap < 0.06) {
    throw new Error(`❌ Le boost clutch du Mental devrait creuser un écart d'au moins 6 pts de % entre Mental=99 et Mental=1 en fenêtre clutch, observé ${(gap * 100).toFixed(1)} pts.`);
  }
  console.log("✅ Un Mental élevé améliore significativement la réussite au tir en fin de match serrée (fenêtre clutch), un Mental bas la dégrade.");
})();

// ---------------------------------------------------------------------
// 7) Mental - malus de tilt : après 3+ ratés/pertes de balle d'affilée
//    (forcé ici via consecutiveMisses=3 avant chaque tentative, hors
//    fenêtre clutch), un Mental élevé (≥70) doit annuler le malus, un
//    Mental bas doit le subir en quasi-totalité.
// ---------------------------------------------------------------------
(function testMentalTiltPenalty() {
  const baseOff = generateStartingRoster("Tilt Off Base");
  const baseDef = generateStartingRoster("Tilt Def Base");

  function variant(mentalValue) {
    const team = teamFromSave(serializeTeam(baseOff));
    team.players.forEach(p => { p.attrs.mental = mentalValue; });
    return team;
  }

  function simulate(mentalValue, n) {
    const off = variant(mentalValue);
    const def = teamFromSave(serializeTeam(baseDef));
    off.resetForMatch(T0);
    def.resetForMatch(T0);
    const me = new MatchEngine(off, def);
    const events = [];
    for (let i = 0; i < n; i++) {
      off.onCourtPlayers().forEach(p => { p.consecutiveMisses = 3; }); // force le tilt à chaque tentative
      me.playPossession(off, def, 1, 600, events, 0); // hors clutch
    }
    const fgm = off.players.reduce((s, p) => s + p.stats.fgm2 + p.stats.fgm3, 0);
    const fga = off.players.reduce((s, p) => s + p.stats.fga2 + p.stats.fga3, 0);
    return fgm / fga;
  }

  const N = 4000;
  const highPct = simulate(99, N); // devrait annuler le malus (70-99 < 0, clampé à 0)
  const lowPct = simulate(1, N);   // devrait subir le malus quasi maximal
  const gap = highPct - lowPct;
  console.log(`Réussite au tir sous tilt (3 ratés d'affilée) - Mental=99 : ${(highPct * 100).toFixed(1)}% | Mental=1 : ${(lowPct * 100).toFixed(1)}% | écart : ${(gap * 100).toFixed(1)} pts (formule : ~9 pts attendus).`);
  if (gap < 0.05) {
    throw new Error(`❌ Le malus de tilt devrait creuser un écart d'au moins 5 pts de % entre Mental=99 (malus annulé) et Mental=1 (malus quasi maximal), observé ${(gap * 100).toFixed(1)} pts.`);
  }
  console.log("✅ Un Mental élevé (≥70) annule le malus de \"tilt\" après une série de ratés, un Mental bas le subit presque en totalité.");
})();

// ---------------------------------------------------------------------
// 8) Affichage : l'onglet Effectif liste bien les 3 nouvelles colonnes
//    (MENT/END/LF, voir ATTR_SHORT), avec des valeurs affichées.
// ---------------------------------------------------------------------
// Depuis la refonte de l'onglet Effectif (retour utilisateur, 2026-09 : "on
// va commencer à avoir pas mal de carac et tout ne rentrera pas sur l'écran
// [...] on verra toutes les carac des joueurs en cliquant sur la page du
// joueur"), les 13 caractéristiques (dont MENT/END/LF, ajoutées par CE
// fichier) ne sont plus des colonnes du tableau Effectif lui-même : elles ne
// sont plus consultables que sur la fiche joueur (renderPlayerDetail, voir
// player_detail_test.js pour la couverture complète de cette page). Ce test
// vérifie donc l'INVERSE de sa version d'origine : MENT/END/LF absents de
// l'en-tête Effectif, mais bien présents sur la fiche joueur ouverte depuis
// cet onglet.
async function testRosterTableShowsNewColumns() {
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server, baseUrl } = await startTestServer();
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document;
    const btn = [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif");
    if (!btn) throw new Error("❌ Onglet Effectif introuvable.");
    btn.click();
    const rosterTable = doc.querySelector("#rosterContent table.roster-table");
    if (!rosterTable) throw new Error("❌ L'onglet Effectif devrait afficher un tableau.");
    const headers = [...rosterTable.querySelectorAll("th")].map(th => th.textContent.trim());
    console.log("En-têtes de colonnes de l'Effectif :", headers.join(", "));
    ["MENT", "END", "LF"].forEach(short => {
      if (headers.some(h => h.startsWith(short))) throw new Error(`❌ La colonne "${short}" (Mental/Endurance/Lancer franc) ne devrait plus apparaître dans l'en-tête du tableau Effectif (déplacée vers la fiche joueur).`);
    });
    console.log("✅ Le tableau Effectif n'affiche plus les 13 colonnes de caractéristiques (déplacées vers la fiche joueur).");

    const firstPlayerLink = doc.querySelector("#rosterContent .player-link");
    if (!firstPlayerLink) throw new Error("❌ (setup) l'Effectif devrait afficher au moins un lien joueur cliquable.");
    firstPlayerLink.click();
    // Depuis la nouvelle fiche joueur (retour utilisateur, 2026-09, maquette
    // "Adama Kovac") : les Caractéristiques sont affichées en grille
    // (.player-attr-grid, un .player-attr-name par caractéristique), plus en
    // table.roster-table à en-têtes <th>, voir renderPlayerDetail.
    const attrHeaders = [...doc.querySelectorAll("#playerDetailContent .player-attr-grid .player-attr-name")].map(el => el.textContent.trim());
    console.log("En-têtes de caractéristiques sur la fiche joueur :", attrHeaders.join(", "));
    ["MENT", "END", "LF"].forEach(short => {
      if (!attrHeaders.includes(short)) throw new Error(`❌ La colonne "${short}" (Mental/Endurance/Lancer franc) devrait apparaître sur la fiche joueur.`);
    });
    console.log("✅ La fiche joueur affiche bien les 3 nouvelles colonnes (MENT/END/LF) en plus des 10 d'origine.");
    dom.window.close();
  } finally {
    server.close();
  }
}

(async () => {
  await testRosterTableShowsNewColumns();
  console.log("\n✅ Tous les tests des 13 caractéristiques (Mental, Endurance, Lancer franc) sont passés.");
})().catch(e => { console.error(e); process.exit(1); });
