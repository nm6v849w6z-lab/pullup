// Vérifie le menu déroulant personnalisé de l'aspect tactique travaillé
// (retour utilisateur, 2026-09 : "tu n'as pas intégré les jauges de niveau
// de connaissance tactique directement dans le menu déroulant") — voir
// renderTrainedTacticsPicker dans moteurbasket3.html. Remplace l'ancien
// <select id="trainedTacticSelect"> (options en texte brut) par un bouton
// déclencheur (#trainedTacticTrigger) + un menu <div> (#trainedTacticMenu)
// dont CHAQUE ligne embarque une mini-jauge (barre + valeur/100) tirée de
// teamA.tacticalKnowledge[cat][key], directement dans la liste déroulante
// elle-même — pas seulement affichée ailleurs sur la page (ce qui existait
// déjà via renderTacticalKnowledgeTrainingGauges, insuffisant pour la
// demande explicite).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

const clickTab = (key) => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key).click();
clickTab("entrainement");

// --- Par défaut (collectiveTraining !== "tactique") : le picker reste
// masqué, aucun ancien <select> ni nouveau menu ne doit être dans le DOM.
const picker = doc.getElementById("trainedTacticsPicker");
if (!picker) throw new Error("❌ (setup) #trainedTacticsPicker introuvable.");
if (!picker.classList.contains("hidden")) {
  throw new Error("❌ Le picker devrait rester masqué tant que l'entraînement collectif n'est pas \"tactique\".");
}
console.log("✅ Le picker reste bien masqué hors focus \"tactique\".");

// --- Active le focus "tactique" pour révéler le picker.
const collectiveSel = doc.getElementById("collectiveTrainingSelect");
if (!collectiveSel) throw new Error("❌ (setup) #collectiveTrainingSelect introuvable.");
collectiveSel.value = "tactique";
collectiveSel.dispatchEvent(new win.Event("change", { bubbles: true }));

if (picker.classList.contains("hidden")) {
  throw new Error("❌ Le picker devrait apparaître une fois l'entraînement collectif réglé sur \"tactique\".");
}
console.log("✅ Le picker apparaît bien une fois le focus \"tactique\" choisi.");

// --- L'ancien <select> natif ne doit plus exister du tout : remplacé par
// le nouveau composant déclencheur + menu.
if (doc.getElementById("trainedTacticSelect")) {
  throw new Error("❌ L'ancien <select id=\"trainedTacticSelect\"> ne devrait plus exister (remplacé par le menu personnalisé).");
}
const trigger = doc.getElementById("trainedTacticTrigger");
const menu = doc.getElementById("trainedTacticMenu");
if (!trigger) throw new Error("❌ #trainedTacticTrigger (bouton déclencheur) introuvable.");
if (!menu) throw new Error("❌ #trainedTacticMenu (menu déroulant) introuvable.");
console.log("✅ Le <select> natif est bien remplacé par le déclencheur + menu personnalisés.");

// --- L'ancienne section "Connaissance tactique de l'équipe" (18 jauges
// affichées sous le sélecteur) a été retirée (retour utilisateur : "pas mal
// le menu déroulant, enleve ce qu'il y a en dessous") — devenue redondante
// maintenant que ces mêmes jauges sont dans le menu lui-même.
if (doc.getElementById("tacticalKnowledgeGaugesRow")) {
  throw new Error("❌ L'ancienne section \"Connaissance tactique de l'équipe\" (#tacticalKnowledgeGaugesRow) devrait avoir été retirée, devenue redondante.");
}
console.log("✅ L'ancienne section \"Connaissance tactique de l'équipe\" (sous le sélecteur) est bien retirée, redondante avec le menu.");

// --- Le menu est fermé par défaut, et s'ouvre au clic sur le déclencheur.
if (!menu.classList.contains("hidden")) throw new Error("❌ Le menu devrait être fermé par défaut.");
trigger.click();
if (menu.classList.contains("hidden")) throw new Error("❌ Cliquer sur le déclencheur devrait ouvrir le menu.");
console.log("✅ Le menu s'ouvre bien au clic sur le déclencheur.");

// --- Invariant central de la demande : CHAQUE ligne d'option (hors "Rien
// de précis") embarque directement une mini-jauge (barre .tto-gauge-fill +
// valeur .tto-value), à l'intérieur même du menu déroulant.
const optionRows = [...menu.querySelectorAll(".trained-tactic-option")];
// 1 ("Rien de précis") + 10 priorités offensives + 5 défenses + 3 rythmes = 19.
if (optionRows.length !== 19) {
  throw new Error(`❌ 19 lignes attendues dans le menu (1 "Rien de précis" + 10 + 5 + 3), obtenu ${optionRows.length}.`);
}
const noneRow = optionRows[0];
if (noneRow.textContent.trim() !== "Rien de précis") {
  throw new Error(`❌ La première ligne du menu devrait être "Rien de précis", obtenu "${noneRow.textContent.trim()}".`);
}
if (noneRow.querySelector(".tto-gauge-fill")) {
  throw new Error("❌ La ligne \"Rien de précis\" ne devrait pas avoir de jauge (aucune tactique associée).");
}
const tacticRows = optionRows.slice(1);
tacticRows.forEach(row => {
  const fill = row.querySelector(".tto-gauge-fill");
  const valueEl = row.querySelector(".tto-value");
  if (!fill) throw new Error(`❌ La ligne "${row.textContent.trim()}" devrait embarquer une jauge (.tto-gauge-fill) directement dans le menu.`);
  if (!valueEl || !/^\d+$/.test(valueEl.textContent.trim())) {
    throw new Error(`❌ La ligne "${row.dataset.value}" devrait afficher une valeur numérique (.tto-value).`);
  }
  const widthMatch = /width:\s*(\d+)%/.exec(fill.getAttribute("style") || "");
  if (!widthMatch) throw new Error(`❌ La jauge de "${row.dataset.value}" devrait avoir une largeur en % dans son style.`);
  if (widthMatch[1] !== valueEl.textContent.trim()) {
    throw new Error(`❌ La largeur de la jauge (${widthMatch[1]}%) devrait correspondre à la valeur affichée (${valueEl.textContent.trim()}) pour "${row.dataset.value}".`);
  }
});
console.log(`✅ Les ${tacticRows.length} lignes de tactique du menu embarquent bien chacune une jauge (barre + valeur), cohérente avec teamA.tacticalKnowledge, directement dans le menu déroulant.`);

// --- Les 3 groupes (Priorité offensive/Défense/Rythme) sont bien étiquetés.
const groupLabels = [...menu.querySelectorAll(".trained-tactic-group-label")].map(el => el.textContent.trim());
if (JSON.stringify(groupLabels) !== JSON.stringify(["Priorité offensive", "Défense", "Rythme"])) {
  throw new Error(`❌ Groupes attendus ["Priorité offensive","Défense","Rythme"], obtenu ${JSON.stringify(groupLabels)}.`);
}
console.log("✅ Les 3 groupes (Priorité offensive/Défense/Rythme) sont bien présents et dans l'ordre attendu.");

// --- Sélectionner une option ferme le menu, met à jour le déclencheur (avec
// sa propre jauge), écrit teamA.trainedTactics et persiste côté serveur.
const firstOffenseOption = tacticRows.find(row => row.dataset.category === "offense");
const chosenValue = firstOffenseOption.dataset.value;
firstOffenseOption.click();

if (!menu.classList.contains("hidden")) throw new Error("❌ Choisir une option devrait refermer le menu.");
const triggerName = trigger.querySelector(".tto-name");
if (!triggerName || triggerName.textContent.trim() !== chosenValue) {
  throw new Error(`❌ Le déclencheur devrait afficher "${chosenValue}" après sélection, obtenu "${triggerName && triggerName.textContent.trim()}".`);
}
if (!trigger.querySelector(".tto-gauge-fill")) {
  throw new Error("❌ Le déclencheur devrait lui aussi afficher la jauge de l'option choisie.");
}
console.log(`✅ Choisir "${chosenValue}" referme le menu et met à jour le déclencheur (nom + jauge).`);

const trainedTactics = win.eval("teamA.trainedTactics");
if (!trainedTactics || trainedTactics.category !== "offense" || trainedTactics.value !== chosenValue) {
  throw new Error(`❌ teamA.trainedTactics devrait valoir {category:"offense", value:"${chosenValue}"}, obtenu ${JSON.stringify(trainedTactics)}.`);
}
console.log("✅ teamA.trainedTactics est bien mis à jour (même modèle de données qu'avant, {category, value}).");

await flush(dom);
const saved = readRawSave(savePath).team.trainedTactics;
if (!saved || saved.category !== "offense" || saved.value !== chosenValue) {
  throw new Error(`❌ trainedTactics devrait être persisté côté serveur, obtenu ${JSON.stringify(saved)}.`);
}
console.log("✅ Le choix est bien persisté côté serveur (round-trip identique à l'ancien <select>).");

// --- La ligne choisie est bien marquée "selected" à la réouverture du menu.
trigger.click();
const reopenedMenu = doc.getElementById("trainedTacticMenu");
const selectedRow = reopenedMenu.querySelector(".trained-tactic-option.selected");
if (!selectedRow || selectedRow.dataset.value !== chosenValue) {
  throw new Error(`❌ La ligne "${chosenValue}" devrait être marquée .selected à la réouverture, obtenu "${selectedRow && selectedRow.dataset.value}".`);
}
console.log("✅ La ligne actuellement choisie est bien mise en évidence (.selected) à la réouverture du menu.");

// --- Un clic en dehors referme le menu (un seul écouteur global, posé une
// fois — voir le commentaire dans moteurbasket3.html sur ce point).
doc.body.dispatchEvent(new win.Event("click", { bubbles: true }));
if (!doc.getElementById("trainedTacticMenu").classList.contains("hidden")) {
  throw new Error("❌ Un clic en dehors du menu devrait le refermer.");
}
console.log("✅ Un clic en dehors du menu le referme bien.");

// --- Revenir à "Rien de précis" efface bien teamA.trainedTactics.
doc.getElementById("trainedTacticTrigger").click();
const noneOption = doc.querySelector('.trained-tactic-option[data-category=""]');
noneOption.click();
const clearedTactics = win.eval("teamA.trainedTactics");
if (clearedTactics !== null) {
  throw new Error(`❌ Choisir "Rien de précis" devrait remettre teamA.trainedTactics à null, obtenu ${JSON.stringify(clearedTactics)}.`);
}
console.log("✅ Revenir à \"Rien de précis\" efface bien teamA.trainedTactics (null).");

await flush(dom);
await dom.window.close();
server.close();
console.log("\n✅ Menu déroulant personnalisé de l'aspect tactique travaillé vérifié : jauges de connaissance tactique embarquées directement dans chaque ligne du menu (barre + valeur cohérente), sélection/désélection fonctionnelles, mêmes données et persistance qu'avant.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
