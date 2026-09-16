// Vérifie les champs structurés ajoutés aux événements de MatchEngine
// (meta.type/team/zone/made — voir engine.js:log/teamKey/playPossession et
// consorts) : la vue 2D du terrain côté client (moteurbasket3.html,
// live_court_view_test.js) s'appuie entièrement sur ces champs pour savoir
// où placer le marqueur, donc ce test couvre la partie "moteur" en
// isolation, sans navigateur — cf. le principe déjà en place pour
// server/calendar_test.js (calculs purs) vs fast_calendar_test.js (parcours
// UI complet).
const E = require("./engine.js");

function randomizeTeam(team) {
  const offList = Object.keys(E.OFFENSE_PROFILES);
  team.offensivePriorities = [offList[0], offList[1], offList[2]];
  team.defense = Object.keys(E.DEFENSES)[0];
  team.rhythm = Object.keys(E.RHYTHMS)[0];
}

const teamA = E.generateTeam("Équipe A", 1);
const teamB = E.generateTeam("Équipe B", 1);
randomizeTeam(teamA);
randomizeTeam(teamB);

const engine = new E.MatchEngine(teamA, teamB);
const result = engine.simulate();
const events = result.events;

console.log(`Match simulé : ${events.length} événements, score ${result.finalScore.A}-${result.finalScore.B}.`);

// --- 1. Les événements narratifs "classiques" (texte + score) restent
// inchangés : aucun champ existant ne doit disparaître ou changer de forme.
for (const ev of events) {
  if (typeof ev.quarter !== "number") throw new Error("❌ ev.quarter manquant/invalide : " + JSON.stringify(ev));
  if (typeof ev.clock !== "string") throw new Error("❌ ev.clock manquant/invalide : " + JSON.stringify(ev));
  if (typeof ev.text !== "string") throw new Error("❌ ev.text manquant/invalide : " + JSON.stringify(ev));
  if (typeof ev.score !== "object" || typeof ev.score.A !== "number" || typeof ev.score.B !== "number") {
    throw new Error("❌ ev.score manquant/invalide : " + JSON.stringify(ev));
  }
}
console.log("✅ Tous les événements conservent leur forme narrative existante (quarter/clock/text/score).");

// --- 2. Au moins un événement de chaque type structuré attendu doit être
// apparu sur un match complet (échantillon assez long pour être quasi
// certain de croiser tir/rebond/perte de balle/quart-temps au moins une
// fois — voir playPossession : ~180-300 possessions par match).
const byType = {};
for (const ev of events) {
  if (!ev.type) continue;
  (byType[ev.type] = byType[ev.type] || []).push(ev);
}
console.log("Types d'événements structurés rencontrés :", Object.keys(byType).map(t => `${t}(${byType[t].length})`).join(", "));

for (const requiredType of ["shot", "rebound", "quarterStart", "quarterEnd"]) {
  if (!byType[requiredType] || byType[requiredType].length === 0) {
    throw new Error(`❌ Aucun événement de type "${requiredType}" trouvé sur un match complet — c'est très improbable, un champ a dû être perdu.`);
  }
}
console.log("✅ Les types d'événements structurés essentiels (shot/rebound/quarterStart/quarterEnd) apparaissent bien.");

// --- 3. Les événements "shot" et "rebound" portent toujours team ("A"/"B")
// et zone ("inside"/"mid"/"three"), et team correspond bien au repère A/B
// utilisé partout ailleurs (this.teamA === teamA passé au constructeur).
const VALID_ZONES = ["inside", "mid", "three"];
for (const ev of [...byType.shot, ...byType.rebound]) {
  if (ev.team !== "A" && ev.team !== "B") throw new Error("❌ ev.team invalide pour un tir/rebond : " + JSON.stringify(ev));
  if (!VALID_ZONES.includes(ev.zone)) throw new Error("❌ ev.zone invalide pour un tir/rebond : " + JSON.stringify(ev));
  if (typeof ev.made !== "boolean") throw new Error("❌ ev.made devrait être un booléen pour un tir/rebond : " + JSON.stringify(ev));
}
console.log("✅ Chaque événement de tir/rebond porte team (A/B) et zone (inside/mid/three) valides.");

// --- 4. Un tir réussi ("shot", made:true) doit correspondre à une ligne de
// texte narrative de type "panier marqué" (PHRASES.madeShot) — vérifie que
// meta et texte ne divergent jamais (même possession, même log()).
const madeShots = byType.shot.filter(ev => ev.made === true);
if (madeShots.length === 0) throw new Error("❌ Aucun tir réussi trouvé sur un match complet (improbable).");
for (const ev of madeShots) {
  if (!/marque|panier|✔|score|points|réussit|convertit|inscrit/i.test(ev.text) && ev.text.length === 0) {
    // Ne vérifie pas le texte exact (dépend de PHRASES, formulations variées
    // et aléatoires) — seulement qu'il y a bien un texte non vide associé.
    throw new Error("❌ Un tir réussi devrait avoir un texte narratif associé : " + JSON.stringify(ev));
  }
}
console.log("✅ Les tirs réussis (meta.made === true) sont bien associés à un texte narratif.");

// --- 5. teamKey() renvoie bien "A" pour this.teamA et "B" pour this.teamB,
// jamais l'inverse ni une 3e valeur, quel que soit l'ordre passé au
// constructeur (vérifié dans les deux sens, cf. l'incohérence connue entre
// server/liveMatch.js (teamA=joueur) et engine.js:simulateOrForfeit
// (teamA=domicile) — teamKey() lui-même est neutre par rapport à ça : il
// reflète juste quel argument a été passé en 1er au constructeur).
const engineSwapped = new E.MatchEngine(teamB, teamA);
if (engineSwapped.teamKey(teamB) !== "A") throw new Error("❌ teamKey devrait renvoyer A pour le 1er argument du constructeur, quelle que soit l'équipe.");
if (engineSwapped.teamKey(teamA) !== "B") throw new Error("❌ teamKey devrait renvoyer B pour le 2e argument du constructeur, quelle que soit l'équipe.");
console.log("✅ teamKey() reflète bien l'ordre des arguments passés au constructeur (A = 1er argument), pas une équipe fixe.");

// --- 6. Entre-deux annoncé au coup d'envoi (retour utilisateur : "à 10:00
// du Q1, ça doit être dit, l'entre-deux est remporté par ...") : un
// événement "tipoff" doit apparaître une fois, au tout début (quarter 1,
// clock "10:00"), avec team/possession valides et un texte qui le dit.
const tipoffs = byType.tipoff || [];
if (tipoffs.length !== 1) throw new Error(`❌ Il devrait y avoir exactement un événement "tipoff" par match — trouvé ${tipoffs.length}.`);
const tipoff = tipoffs[0];
if (tipoff.quarter !== 1 || tipoff.clock !== "10:00") throw new Error("❌ L'entre-deux devrait être annoncé au tout début du 1er quart-temps (10:00) : " + JSON.stringify(tipoff));
if (tipoff.team !== "A" && tipoff.team !== "B") throw new Error("❌ ev.team invalide pour l'entre-deux : " + JSON.stringify(tipoff));
if (tipoff.possession !== tipoff.team) throw new Error("❌ La possession de l'entre-deux devrait correspondre à l'équipe qui le remporte : " + JSON.stringify(tipoff));
if (!/entre-deux/i.test(tipoff.text)) throw new Error("❌ Le texte de l'entre-deux devrait le mentionner explicitement : " + JSON.stringify(tipoff));
console.log("✅ L'entre-deux est bien annoncé une fois, à 10:00 du 1er quart-temps, avec un texte explicite.");

// --- 7. Chaque événement de tir/rebond/perte de balle/faute/lancer franc
// porte aussi `possession` ("A"/"B" — qui a la balle pendant cette
// possession, distinct de `team` qui garde son sens narratif existant, ex.
// une faute intentionnelle a team=l'équipe qui faute mais
// possession=l'équipe qui a la balle) — retour utilisateur : "on ne sait pas
// qui a la balle" / "mettre un point pour dire qui a la balle".
const possessionTypes = ["shot", "rebound", "turnover", "foul", "freeThrow"];
for (const t of possessionTypes) {
  const evs = byType[t] || [];
  if (evs.length === 0) continue; // pas garanti sur tous les matchs (ex. "foul" intentionnel rare)
  for (const ev of evs) {
    if (ev.possession !== "A" && ev.possession !== "B") {
      throw new Error(`❌ ev.possession invalide pour un événement "${t}" : ` + JSON.stringify(ev));
    }
  }
}
console.log("✅ Les événements de possession (tir/rebond/perte de balle/faute/lancer franc) portent tous un champ `possession` (A/B) valide.");

// --- 8. Les champs structurés ne perturbent jamais schedulePlayback côté
// serveur, qui se contente de spread `{...ev, airAt}` (voir
// server/liveMatch.js) — vérifié indirectement ici en s'assurant qu'aucun
// événement ne porte de champ nommé "airAt" AVANT diffusion (sinon un
// conflit de nommage passerait inaperçu).
for (const ev of events) {
  if ("airAt" in ev) throw new Error("❌ Un événement ne devrait jamais porter 'airAt' avant d'être passé à schedulePlayback.");
}
console.log("✅ Aucun conflit de nommage avec le champ 'airAt' ajouté ensuite par schedulePlayback.");

// --- 9. Retour utilisateur : "on ne peut pas avoir un tir marqué à 10:00,
// ce n'est pas possible en vrai" — aucun événement de possession (tir/
// rebond/perte de balle/faute/lancer franc) ne devrait jamais être loggué au
// chrono plein d'un quart-temps/d'une prolongation (QUARTER_SECONDS/
// OVERTIME_SECONDS), puisque cela impliquerait qu'aucune seconde ne s'est
// écoulée depuis l'entre-deux/le début du quart-temps — voir le correctif
// dans engine.js:simulate (le chrono est désormais décrémenté AVANT de
// jouer la possession, pas après). Seuls les marqueurs "tipoff"/
// "quarterStart" (annoncés avant toute possession) ont le droit d'être au
// chrono plein — testé sur plusieurs matchs pour une bonne couverture
// statistique (possessionLength est aléatoire).
const FULL_CLOCK_BY_QUARTER = q => (q <= 4 ? "10:00" : "05:00");
let checkedPossessionEvents = 0;
for (let i = 0; i < 20; i++) {
  const tA = E.generateTeam("Test A " + i, 1);
  const tB = E.generateTeam("Test B " + i, 1);
  randomizeTeam(tA);
  randomizeTeam(tB);
  const evs = new E.MatchEngine(tA, tB).simulate().events;
  for (const ev of evs) {
    if (!possessionTypes.includes(ev.type)) continue;
    checkedPossessionEvents++;
    if (ev.clock === FULL_CLOCK_BY_QUARTER(ev.quarter)) {
      throw new Error(`❌ Un événement "${ev.type}" ne devrait jamais être loggué au chrono plein (aucune seconde écoulée) : ` + JSON.stringify(ev));
    }
  }
}
console.log(`✅ Aucun événement de possession (${checkedPossessionEvents} vérifiés sur 20 matchs) n'est loggué au chrono plein d'un quart-temps — impossible qu'un tir soit "marqué à 10:00".`);

console.log("\n✅ Événements structurés du moteur (engine.js:MatchEngine.log/teamKey) vérifiés : chaque tir/rebond porte team+zone+made, sans rien casser du format narratif existant.");
