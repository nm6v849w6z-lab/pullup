// Refonte de la page Ordres (retour utilisateur, 2026-09-25, maquette
// canevas "Ordres — Lyon vs Rennes" : "code tout ça stp"). Vérifie, sur la
// vraie page (jsdom + vrai serveur de test) :
//   1) la barre d'action en haut de page : "Valider les ordres" AVANT la
//      grille (plus tout en bas), état des ordres, onglets de section ;
//   2) la carte "match" (équipes, badge de journée, date/heure, lieu) ;
//   3) les priorités offensives en puces numérotées 1-2-3, les autres
//      grisées (désactivées) à 3/3 ;
//   4) les réglages à 2-3 valeurs en boutons segmentés, avec ligne d'aide
//      qui suit la valeur ;
//   5) "Surveiller" : "Choisir un joueur…" (titulaire adverse au poste) puis
//      "Consigne", désactivée tant qu'aucun joueur n'est choisi ;
//   6) l'alerte "remplaçant listé à plusieurs postes" ;
//   7) l'état "Modifications à valider" puis "Ordres validés" ;
//   8) "Réinitialiser ma carrière" n'est plus sur la page Ordres (déplacé en
//      bas du Guide).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const openOrdres = () => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ordres").click();
openOrdres();

// 1) Barre d'action
const prep = doc.getElementById("prepSection");
const bar = doc.getElementById("ordresActionBar");
const validateBtn = doc.getElementById("ordresValidateBtn");
const grid = doc.getElementById("prepGrid");
if (!bar || !bar.contains(validateBtn)) throw new Error("❌ Le bouton 'Valider les ordres' devrait être dans la barre d'action #ordresActionBar.");
if (!(validateBtn.compareDocumentPosition(grid) & win.Node.DOCUMENT_POSITION_FOLLOWING)) {
  throw new Error("❌ Le bouton 'Valider les ordres' devrait être AVANT la grille des ordres (en haut de page).");
}
const tabs = [...doc.querySelectorAll("#ordresSectionTabs [data-ordres-jump]")];
console.log("Onglets de la barre :", tabs.map(t => t.textContent.trim()).join(" | "));
["Attaque", "Défense", "Cinq & rotation", "Adversaires"].forEach(label => {
  if (!tabs.some(t => t.textContent.trim() === label)) throw new Error(`❌ Onglet '${label}' manquant dans la barre d'action.`);
});
tabs.forEach(t => {
  if (!doc.getElementById(t.dataset.ordresJump)) throw new Error(`❌ L'onglet '${t.textContent.trim()}' vise #${t.dataset.ordresJump}, introuvable.`);
});
tabs[0].click(); // ne doit pas planter sans scrollIntoView (jsdom)
const statusText = () => doc.getElementById("ordresStatus").textContent.trim();
console.log("État initial :", statusText());
if (statusText() !== "Ordres pas encore validés") throw new Error(`❌ État initial attendu 'Ordres pas encore validés', obtenu '${statusText()}'.`);
console.log("✅ Barre d'action : validation en haut, état, 4 onglets reliés à leurs cartes.");

// 2) Carte match
const card = doc.getElementById("ordresRoundDateTime").textContent;
const oppName = win.eval("teamB.name");
const expectedWhen = win.eval("formatDateTimeFr(scheduledTimeForCurrentMatch())");
console.log("Carte match :", card.replace(/\s+/g, " ").trim());
if (!card.includes(oppName) || !card.includes(win.eval("teamA.name"))) throw new Error("❌ La carte match devrait afficher les deux équipes.");
if (!card.includes(expectedWhen)) throw new Error(`❌ La carte match devrait afficher le coup d'envoi programmé (${expectedWhen}).`);
if (!/Journée 1 \/ \d+/.test(card)) throw new Error("❌ La carte match devrait afficher le badge 'Journée 1 / N'.");
console.log("✅ Carte match : équipes, badge de journée, date/heure du coup d'envoi.");

// 3) Priorités offensives
const ranks = () => [...doc.querySelectorAll("#ordresOffTacticsGrid .tactic-selected .tactic-chip")]
  .map(c => c.querySelector(".tactic-rank").textContent + ":" + c.querySelector(".tactic-name").textContent);
const expectedRanks = win.eval("teamA.offensivePriorities").map((t, i) => `${i + 1}:${t}`);
console.log("Puces numérotées :", ranks().join(" | "));
if (JSON.stringify(ranks()) !== JSON.stringify(expectedRanks)) throw new Error("❌ Les 3 priorités devraient être affichées numérotées dans l'ordre de teamA.offensivePriorities.");
const poolInputs = () => [...doc.querySelectorAll("#ordresOffTacticsGrid .tactic-pool .tactic-chip input")];
if (poolInputs().length !== 7 || !poolInputs().every(i => i.disabled)) throw new Error("❌ À 3/3, les 7 autres options devraient être visibles mais désactivées.");
// Retirer la n°1 : les autres remontent, le pool se réactive.
const firstSelected = doc.querySelector("#ordresOffTacticsGrid .tactic-selected .tactic-chip input");
firstSelected.checked = false;
firstSelected.dispatchEvent(new win.Event("change"));
if (win.eval("teamA.offensivePriorities.length") !== 2) throw new Error("❌ Retirer une puce numérotée devrait laisser 2 priorités.");
if (doc.querySelectorAll("#ordresOffTacticsGrid .tactic-slot-empty").length !== 1) throw new Error("❌ Un emplacement vide devrait apparaître en 3e position.");
if (!poolInputs().every(i => !i.disabled)) throw new Error("❌ Sous le quota, les options restantes devraient redevenir cliquables.");
const pick = poolInputs().find(i => i.closest(".tactic-chip").textContent.includes("Post-up"));
pick.checked = true;
pick.dispatchEvent(new win.Event("change"));
const after = win.eval("teamA.offensivePriorities");
if (after.length !== 3 || after[2] !== "Post-up") throw new Error(`❌ Ajouter 'Post-up' devrait le placer en n°3, obtenu ${JSON.stringify(after)}.`);
console.log("✅ Priorités : numérotées dans l'ordre choisi, pool grisé à 3/3, retrait/ajout corrects :", after.join(", "));
if (statusText() !== "Modifications à valider") throw new Error(`❌ Après un changement, l'état devrait être 'Modifications à valider', obtenu '${statusText()}'.`);
console.log("✅ État après changement :", statusText());

// 4) Boutons segmentés
const rhythm = doc.getElementById("ordresRhythmSelect");
if (!rhythm || !rhythm.classList.contains("seg-control")) throw new Error("❌ Le Rythme devrait être un groupe de boutons segmentés.");
const segValues = [...rhythm.querySelectorAll(".seg-btn")].map(b => b.dataset.value);
if (JSON.stringify(segValues) !== JSON.stringify(win.eval("RHYTHM_LIST"))) throw new Error("❌ Les boutons du Rythme devraient reprendre exactement RHYTHM_LIST.");
const rapide = [...rhythm.querySelectorAll(".seg-btn")].find(b => b.dataset.value === "Rapide");
rapide.dispatchEvent(new win.Event("click", { bubbles: true }));
if (win.eval("teamA.rhythm") !== "Rapide") throw new Error("❌ Cliquer 'Rapide' devrait mettre teamA.rhythm à 'Rapide'.");
// Plus aucune ligne d'aide sur la page Ordres (retour utilisateur 2026-09-25 :
// "enlève le texte superflu, on a tout dans le guide").
if (doc.querySelector("#prepSection .field-help")) throw new Error("❌ La page Ordres ne devrait plus afficher de ligne d'aide (.field-help).");
["ordresTierToggle", "ordresEndgameSelect", "ordresOffRebSelect", "ordresHelpDefenseSelect", "ordresCloseoutSelect"].forEach(id => {
  const el = doc.getElementById(id);
  if (!el || !el.classList.contains("seg-control")) throw new Error(`❌ #${id} devrait être un groupe de boutons segmentés.`);
});
["ordresDefenseSelect", "ordresScreenDefenseSelect", "ordresPostDefenseSelect"].forEach(id => {
  const el = doc.getElementById(id);
  if (!el || el.tagName !== "SELECT") throw new Error(`❌ #${id} (plus de 3 valeurs) devrait rester un <select>.`);
});
const tierLabels = [...doc.querySelectorAll("#ordresTierToggle .seg-btn")].map(b => b.textContent);
if (JSON.stringify(tierLabels) !== JSON.stringify(["Débutant", "Confirmé"])) throw new Error(`❌ Libellés du niveau tactique attendus Débutant/Confirmé, obtenu ${JSON.stringify(tierLabels)}.`);
console.log("✅ Réglages à 2-3 valeurs en boutons segmentés (aide mise à jour), 'Confirmé' au masculin.");

// 5) Surveiller
[...doc.querySelectorAll("#ordresTierToggle .seg-btn")].find(b => b.dataset.value === "confirmée")
  .dispatchEvent(new win.Event("click", { bubbles: true }));
const row0 = doc.querySelectorAll("#ordresWatchAssignments .watch-row")[0];
const [playerSel, focusSel] = row0.querySelectorAll("select");
if (playerSel.options[0].textContent !== "Choisir un joueur…") throw new Error("❌ Le 1er menu de Surveiller devrait proposer 'Choisir un joueur…'.");
if (focusSel.options[0].textContent !== "Consigne") throw new Error("❌ Le 2e menu de Surveiller devrait proposer 'Consigne'.");
if (!focusSel.disabled) throw new Error("❌ 'Consigne' devrait être désactivé tant qu'aucun joueur n'est choisi.");
const oppPivot = win.eval("(() => { const id = teamB.lineup.starters['Pivot']; const p = teamB.players.find(x => x.id === id); return p ? p.name : null; })()");
const pivotOpt = [...playerSel.options].find(o => o.value === "Pivot");
console.log("Option Pivot de Surveiller :", pivotOpt.textContent, "(titulaire adverse :", oppPivot + ")");
if (oppPivot && pivotOpt.textContent !== `${oppPivot} (P)`) throw new Error("❌ L'option Pivot devrait afficher le titulaire adverse à ce poste.");
playerSel.value = "Pivot";
playerSel.dispatchEvent(new win.Event("change"));
if (focusSel.disabled) throw new Error("❌ 'Consigne' devrait s'activer une fois un joueur choisi.");
focusSel.value = "denyPostUp";
focusSel.dispatchEvent(new win.Event("change"));
const watch = win.eval("teamA.watchAssignments");
if (watch.length !== 1 || watch[0].position !== "Pivot" || watch[0].focus !== "denyPostUp") throw new Error(`❌ watchAssignments inattendu : ${JSON.stringify(watch)}.`);
playerSel.value = "";
playerSel.dispatchEvent(new win.Event("change"));
if (!focusSel.disabled || focusSel.value !== "" || win.eval("teamA.watchAssignments.length") !== 0) {
  throw new Error("❌ Revenir à 'Choisir un joueur…' devrait vider et désactiver la consigne, et retirer l'affectation.");
}
console.log("✅ Surveiller : joueur puis consigne (désactivée sans joueur), toujours stocké par poste côté moteur.");

// 6) Alerte remplaçant à plusieurs postes
const hasAlert = () => !!doc.querySelector("#ordresCardRotation .ordres-alert");
win.eval(`(() => {
  const starters = new Set(Object.values(teamA.lineup.starters));
  POSITIONS.forEach(pos => teamA.players.forEach(p => { if (!starters.has(p.id)) teamA.toggleBackupPosition(p.id, pos, false); }));
  const bench = teamA.players.filter(p => !starters.has(p.id));
  POSITIONS.forEach((pos, i) => teamA.toggleBackupPosition(bench[i].id, pos, true));
  renderOrdresGrid();
})()`);
if (hasAlert()) throw new Error("❌ Aucune alerte attendue quand chaque remplaçant n'est listé qu'à un seul poste.");
const multiName = win.eval(`(() => {
  const starters = new Set(Object.values(teamA.lineup.starters));
  const p = teamA.players.filter(p => !starters.has(p.id))[0];
  teamA.toggleBackupPosition(p.id, "Pivot", true);
  renderOrdresGrid();
  return p.name;
})()`);
const alertText = doc.querySelector("#ordresCardRotation .ordres-alert");
console.log("Alerte rotation :", alertText && alertText.textContent);
if (!alertText || !alertText.textContent.includes(multiName)) throw new Error("❌ L'alerte devrait nommer le remplaçant listé à plusieurs postes.");
const multiChips = [...doc.querySelectorAll("#ordresCardRotation .lineup-backup-chip.multi")];
if (multiChips.length !== 2) throw new Error(`❌ Ce remplaçant devrait être surligné sur ses 2 postes, obtenu ${multiChips.length}.`);
console.log("✅ Alerte 'listé à plusieurs postes' affichée et puces surlignées.");

// 7) Validation -> "Ordres validés"
await win.eval("validateOrdres()");
openOrdres();
console.log("État après validation puis réouverture :", statusText());
if (statusText() !== "Ordres validés") throw new Error(`❌ Après validation, l'état devrait être 'Ordres validés', obtenu '${statusText()}'.`);
console.log("✅ État 'Ordres validés' après un clic sur Valider les ordres.");

// 8) Réinitialiser ma carrière
if (prep.querySelector("#resetCareerLink") || prep.textContent.includes("Réinitialiser ma carrière")) {
  throw new Error("❌ 'Réinitialiser ma carrière' ne devrait plus être sur la page Ordres.");
}
const link = doc.getElementById("resetCareerLink");
if (!link || !doc.getElementById("guideSection").contains(link)) throw new Error("❌ 'Réinitialiser ma carrière' devrait se trouver dans le Guide.");
console.log("✅ 'Réinitialiser ma carrière' retiré de la page Ordres, présent en bas du Guide.");

await flush(dom);
win.close();
server.close();
console.log("\n✅ Refonte de la page Ordres : tous les contrôles passent.");
})().catch(e => { console.error(e); process.exit(1); });
