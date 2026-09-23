// Vérifie que l'entraînement fait bien progresser les joueurs sur la durée
// via le parcours UI complet (retour utilisateur : "mes joueurs ne
// progressent pas avec l'entrainement") : cas normal (plusieurs semaines de
// suite, matchs joués automatiquement entre chaque), et le cas précis qui
// produisait silencieusement AUCUN gain — un joueur du poste entraîné sans
// la moindre minute enregistrée au dernier match (resté sur le banc, ou
// jamais aligné) — pour lequel le rapport hebdomadaire doit désormais
// EXPLIQUER pourquoi (avant : silence total, ni gain ni explication, la
// cause probable du retour utilisateur), plutôt que de laisser croire que
// l'entraînement est cassé.
//
// Depuis le passage au calendrier réel (tâche #21), l'entraînement
// hebdomadaire ne se déclenche plus isolément (bouton "Valider la semaine")
// : chaque semaine réelle fait obligatoirement jouer ses 2 journées de
// championnat AVANT que l'entraînement de cette semaine ne s'applique (voir
// catchUpLeague) — on ne peut donc plus isoler "un entraînement validé sans
// qu'aucun match n'ait jamais été joué avec le nouvel effectif" comme avant.
// En pratique, ça n'enlève rien à la couverture utile : un effectif fraîchement
// regonflé (voir inflateRosterWithRookies, qui AJOUTE des débutants à côté de
// l'effectif existant, sans plancher de rotation) contient presque toujours,
// après une semaine réelle jouée normalement, un mélange de joueurs qui ONT
// joué (minutes > 0) et de joueurs restés sur le banc lors du DERNIER match
// (minutes = 0, resetForMatch() remet ce compteur à zéro à chaque match) —
// exactement le cas "silencieux" à couvrir, mais désormais dans son contexte
// réel plutôt que provoqué artificiellement.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave, fastForwardCalendar } = require("./test_helpers.js");
const E = require("./engine.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// Regonfle l'effectif de 15 joueurs débutants supplémentaires (3 par poste),
// directement dans la sauvegarde brute : remplace l'ancien clic sur
// #refillRosterBtn (outil de test retiré de l'onglet Économie, retour
// utilisateur, 2026-09 : "enleve les outils ici, ça n'a rien à faire là").
// Ajoutés SANS toucher à la feuille de match existante (ni Team.
// autoAssignLineup ni aucun remplissage des postes de remplaçants) : les 15
// nouveaux joueurs restent donc du pur surplus de banc, qui ne joue jamais,
// exactement le "mélange joueurs ayant joué/pas joué" recherché par ce
// scénario, voir le grand commentaire juste en dessous.
function inflateRosterWithRookies(savePath) {
  const saved = readRawSave(savePath);
  E.POSITIONS.forEach(pos => {
    for (let i = 0; i < 3; i++) saved.team.players.push(E.serializePlayerRecord(E.generateRookiePlayer(pos)));
  });
  writeRawSave(savePath, saved);
}

async function loadGame() {
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  return { dom, doc: dom.window.document, win: dom.window, server, savePath, baseUrl };
}

async function snapshot(dom, savePath) {
  await flush(dom);
  return readRawSave(savePath).team.players
    .map(p => ({ id: p.id, position: p.position, attrs: { ...p.attrs }, _trainProgress: { ...p._trainProgress } }));
}
function clickTab(doc, key) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click(); }

function setTraining(doc, skill) {
  clickTab(doc, "entrainement"); // populate/attache les listeners des selects (voir showTrainingSection)
  const skillSel = doc.getElementById("trainingSkillSelect");
  skillSel.value = skill;
  skillSel.onchange();
  const posSel = doc.getElementById("trainingPositionsSelect");
  // Un seul poste (le plus favorable à cette compétence, TOUJOURS la
  // première option — voir trainingPositionOptionsForProgram) : c'est
  // délibérément le réglage SANS dilution (voir
  // TRAINING_DILUTION_BY_POSITION_COUNT, qui va jusqu'à -50% d'efficacité
  // pour "Toute l'équipe"/5 postes) — sélectionner davantage de postes pour
  // "élargir l'échantillon" serait contre-productif ici : ça réduirait le
  // gain de CHAQUE joueur au lieu de simplement en ajouter d'autres, et
  // ferait retomber le test dans le même genre de faux-négatif ponctuel
  // qu'on cherche à éliminer (voir sumTrainedProgress ci-dessous, qui règle
  // le vrai problème — le plafond individuel d'UN joueur sur UNE seule
  // caractéristique — sans avoir besoin de diluer l'entraînement).
  posSel.selectedIndex = 0;
  posSel.onchange();
}

// Somme, sur les joueurs du/des poste(s) réellement entraîné(s)
// (trainedPositions) et TOUTES caractéristiques confondues, l'écart entre
// deux snapshots de l'effectif (voir team.players dans la sauvegarde) — sur
// le progrès RÉEL (fractionnaire), pas la caractéristique affichée (entière
// uniquement) : voir Player.trainWeek, le gain hebdomadaire s'accumule
// d'abord dans _trainProgress et ne « déborde » sur l'attribut affiché
// qu'une fois qu'un point entier complet s'est accumulé. Comparer attrs +
// _trainProgress capture donc le VRAI signal, sans dépendre du hasard de
// l'arrondi sur une semaine unique — ni, sommé sur tout un poste plutôt
// qu'un seul joueur/une seule caractéristique, du plafond individuel d'UN
// joueur par pur hasard de génération.
//
// Restreint aux joueurs du poste entraîné (et pas tout l'effectif) parce que
// les autres joueurs ont un poids nul pour le programme en cours (voir
// Team.trainWeek) et ne progressent donc jamais sur AUCUNE caractéristique —
// mais ils continuent, eux, à DÉCLINER normalement avec l'âge sur toutes
// leurs caractéristiques (voir Player.trainWeek, la branche `decline`, qui
// ne dépend pas du poids d'entraînement). Les compter dans le total
// reviendrait à noyer le vrai signal (le gain des joueurs entraînés) dans
// le déclin, sans rapport, de joueurs qui ne s'entraînent pas du tout cette
// semaine-là — ce qui rendait le total agrégé imprévisible sur la durée.
// `onlyAttrs` (optionnel) restreint la somme à un sous-ensemble de
// caractéristiques — voir son usage plus bas : depuis "Entraînement des
// fondamentaux" (retour utilisateur, 2026-09), le Physique et le Mental ne
// dépendent plus DU TOUT du temps de jeu (ils évoluent tout seuls, voir
// Player.trainWeek/PHYSICAL_ATTRS/MENTAL_ATTRS) — seuls les FUNDAMENTAL_ATTRS
// restent conditionnés aux minutes réellement jouées au poste entraîné.
function sumTrainedProgress(before, after, trainedPositions, filterFn, onlyAttrs = null) {
  let total = 0;
  after.forEach(p => {
    if (!trainedPositions.includes(p.position)) return;
    if (filterFn && !filterFn(p)) return;
    const b = before.find(x => x.id === p.id);
    if (!b) return;
    const attrKeys = onlyAttrs || Object.keys(p.attrs);
    attrKeys.forEach(a => {
      const afterVal = p.attrs[a] + ((p._trainProgress && p._trainProgress[a]) || 0);
      const beforeVal = b.attrs[a] + ((b._trainProgress && b._trainProgress[a]) || 0);
      total += (afterVal - beforeVal);
    });
  });
  return total;
}

(async () => {

// ---------------------------------------------------------------------
// Partie 1 : cas normal — plusieurs semaines de suite (matchs + entraînement
// automatiques, voir fastForwardCalendar/catchUpLeague), la caractéristique
// entraînée doit progresser sur la durée pour au moins une partie de
// l'effectif.
// ---------------------------------------------------------------------
{
  let { doc, win, dom, server, savePath, baseUrl } = await loadGame();
  setTraining(doc, "threePoint");
  await flush(dom);
  const trainedPositions = readRawSave(savePath).team.trainingPositions;

  const startAttrs = await snapshot(dom, savePath);

  // 6 semaines réelles (12 journées) d'un coup : une seule requête au
  // serveur rattrape tout (matchs + entraînement hebdomadaire).
  win.close();
  fastForwardCalendar(savePath, 12);
  dom = await openGame(html, baseUrl);
  doc = dom.window.document;
  win = dom.window;
  if (!doc.getElementById("catchupSection").classList.contains("hidden")) {
    doc.getElementById("catchupContinueBtn").click();
  }

  const endAttrs = await snapshot(dom, savePath);

  const totalGain = sumTrainedProgress(startAttrs, endAttrs, trainedPositions);
  console.log(`\nProgrès total (joueurs entraînés, toutes caractéristiques, fractionnaire inclus) sur 6 semaines (matchs + entraînement) : ${totalGain.toFixed(3)}`);
  if (totalGain <= 0) throw new Error("❌ Sur 6 semaines de matchs joués et d'entraînement validé, les joueurs du poste entraîné devraient avoir progressé au total (progrès total > 0).");
  console.log("✅ L'entraînement fait bien progresser les joueurs sur plusieurs semaines de jeu normal.");
  win.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : le cas silencieux, après une régénération d'effectif (voir
// inflateRosterWithRookies, qui ajoute des débutants SANS toucher au plancher
// de rotation) puis UNE semaine réelle jouée normalement (2 matchs), certains
// joueurs du poste entraîné restent sans la moindre minute au DERNIER match
// (resetForMatch() remet le compteur à zéro à chaque match, voir engine.js).
// Le rapport hebdomadaire doit désormais EXPLIQUER pourquoi, joueur par
// joueur, plutôt que de laisser un silence total (l'ancien bug : aucun gain,
// aucune ligne, l'impression que l'entraînement est cassé). Les joueurs qui
// ONT bien joué, eux, progressent normalement la même semaine : la même
// semaine réelle couvre donc les deux moitiés du problème signalé par
// l'utilisateur.
// ---------------------------------------------------------------------
{
  let { doc, win, dom, server, savePath, baseUrl } = await loadGame();
  win.close();
  inflateRosterWithRookies(savePath);
  dom = await openGame(html, baseUrl);
  doc = dom.window.document;
  win = dom.window;
  setTraining(doc, "threePoint");
  await flush(dom);
  const trainedPositions = readRawSave(savePath).team.trainingPositions;
  const before = await snapshot(dom, savePath);

  win.close();
  fastForwardCalendar(savePath, 2);
  dom = await openGame(html, baseUrl);
  doc = dom.window.document;
  win = dom.window;
  if (doc.getElementById("catchupSection").classList.contains("hidden")) {
    throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après 1 semaine réelle (2 journées) jouée automatiquement.");
  }
  const reportHtml = doc.getElementById("catchupContent").innerHTML;
  doc.getElementById("catchupContinueBtn").click();

  const after = await snapshot(dom, savePath);
  const afterRaw = readRawSave(savePath).team.players;

  const zeroMinutePlayers = afterRaw.filter(p => trainedPositions.includes(p.position) && p.secondsPlayed === 0);
  const playedPlayers = afterRaw.filter(p => trainedPositions.includes(p.position) && p.secondsPlayed > 0);
  console.log(`\nJoueurs du poste entraîné (${trainedPositions.join(", ")}) — sans la moindre minute au dernier match : ${zeroMinutePlayers.length} | ayant joué : ${playedPlayers.length}`);
  if (zeroMinutePlayers.length === 0) {
    throw new Error("❌ Le scénario de test (effectif regonflé de débutants supplémentaires) devrait produire au moins un joueur du poste entraîné sans la moindre minute au dernier match.");
  }

  console.log("Le rapport explique l'absence de progression :", reportHtml.includes("aucune minute enregistrée"));
  if (!reportHtml.includes("aucune minute enregistrée")) {
    throw new Error("❌ Le rapport hebdomadaire devrait EXPLIQUER pourquoi un joueur concerné n'a pas progressé (aucune minute enregistrée au poste entraîné), pas rester silencieux — c'est ce silence qui donne l'impression que l'entraînement est cassé.");
  }
  const noteCount = (reportHtml.match(/aucune minute enregistrée/g) || []).length;
  console.log(`Lignes d'explication "aucune minute enregistrée" : ${noteCount} (attendu ${zeroMinutePlayers.length})`);
  if (noteCount !== zeroMinutePlayers.length) {
    throw new Error(`❌ Chaque joueur du poste entraîné sans minutes au dernier match devrait avoir sa propre ligne d'explication (attendu ${zeroMinutePlayers.length}, obtenu ${noteCount}).`);
  }
  console.log("✅ Le rapport hebdomadaire explique désormais clairement, joueur par joueur, pourquoi certains n'ont pas progressé (au lieu du silence total d'avant).");

  // Aucun gain SUR LES FONDAMENTAUX pour les joueurs sans minutes (le
  // Physique/Mental, eux, évoluent tout seuls indépendamment du temps de
  // jeu depuis "Entraînement des fondamentaux" — voir le commentaire de
  // sumTrainedProgress ci-dessus, ce n'est plus un bug si ces deux
  // catégories bougent un peu ici).
  const zeroGain = sumTrainedProgress(before, after, trainedPositions, p => zeroMinutePlayers.some(z => z.id === p.id), E.FUNDAMENTAL_ATTRS);
  console.log("Progrès des fondamentaux pour les joueurs sans minutes (attendu 0) :", zeroGain.toFixed(3));
  if (zeroGain !== 0) throw new Error("❌ Un joueur sans la moindre minute au dernier match ne devrait avoir AUCUN gain de fondamentaux (comportement attendu, pas le bug).");

  // ...mais un gain bien réel pour ceux qui ont effectivement joué.
  const playedGain = sumTrainedProgress(before, after, trainedPositions, p => playedPlayers.some(z => z.id === p.id));
  console.log("Progrès total des joueurs ayant joué (attendu > 0) :", playedGain.toFixed(3));
  if (playedGain <= 0) throw new Error("❌ Les joueurs du poste entraîné ayant effectivement joué devraient progresser normalement la même semaine.");
  console.log("✅ Les joueurs ayant effectivement joué progressent normalement, la même semaine que ceux qui restent expliqués à zéro.");

  win.close();
  server.close();
}

console.log("\n✅ Progression par l'entraînement vérifiée : gains réels sur plusieurs semaines de jeu normal, et rapport hebdomadaire qui explique désormais clairement, joueur par joueur, le cas 'aucune minute au dernier match' au lieu de rester silencieux — tout en continuant à faire progresser normalement les joueurs qui ont effectivement joué la même semaine.");

})().catch(e => { console.error(e); process.exit(1); });
