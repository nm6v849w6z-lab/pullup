// Vérifie la feuille de match éditable (titulaires/remplaçants) : un
// titulaire par poste (5 minimum, sinon impossible de verrouiller le
// match), un même remplaçant peut couvrir plusieurs postes, et tout
// survit à une sauvegarde/rechargement. Vue « composition » (2026-09-30) :
// une carte par poste sur le terrain (.cp-card[data-pos]) porte le menu du
// titulaire, le remplaçant et le réserviste (.cp-sub) et « + Remplaçant »
// (.cp-add) — elle remplace les anciens marqueurs (.court-marker) et le
// tableau Rotation (.lineup-table), supprimés.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

const POS_CODE = { "Meneur": "M", "Arrière": "A", "Ailier shooteur": "AS", "Ailier fort": "AF", "Pivot": "P" };

function courtMarkers() { return [...doc.querySelectorAll("#ordresCardCinq .cp-card")]; }
function markerByPos(pos) { return courtMarkers().find(m => m.querySelector(".cp-badge").textContent === POS_CODE[pos]); }
function tableRows() { return courtMarkers(); }
function rowByPos(pos) { return markerByPos(pos); }
// Nom du joueur d'une ligne remplaçant/réserviste (sans le poste naturel
// affiché à côté quand il joue hors poste).
function chipName(c) { return c.querySelector(".cp-sub-name").firstChild.textContent.trim(); }

// --- Par défaut (équipe auto-générée), la feuille de match doit déjà être
// valide (5 titulaires, un par poste) et le bouton de verrouillage actif.
const markersInit = courtMarkers();
console.log("Marqueurs de poste sur le terrain :", markersInit.length, "(attendu 5)");
if (markersInit.length !== 5) throw new Error("❌ Il devrait y avoir un marqueur par poste (5) sur le terrain.");
const incompleteAtStart = doc.querySelectorAll("#ordresCardCinq .cp-card.is-empty").length;
console.log("Postes incomplets au départ :", incompleteAtStart, "(attendu 0)");
// Depuis le passage au calendrier réel (tâche #21, préparation à l'avance),
// il n'y a plus de bouton "Verrouiller" à activer/désactiver : le seul
// signal de "feuille de match jouable" est l'absence de message dans
// #lockWarning (voir updateLockAvailability côté UI).
function lineupBlocked() { return doc.getElementById("lockWarning").textContent.trim() !== ""; }
console.log(`${!lineupBlocked() ? "✅" : "❌"} Feuille de match jouable par défaut (feuille auto-assignée valide).`);
if (lineupBlocked()) throw new Error("❌ La feuille de match devrait être jouable par défaut : " + doc.getElementById("lockWarning").textContent);

// --- Vide le titulaire d'un poste (sélecteur sur le terrain) : la feuille
// devient invalide, le verrouillage doit se bloquer avec un message clair.
const meneurSelect = markerByPos("Meneur").querySelector("select.cp-starter-select");
const previousStarterId = meneurSelect.value;
meneurSelect.value = "";
meneurSelect.dispatchEvent(new win.Event("change"));

console.log("\nAprès avoir vidé le titulaire Meneur :");
console.log("Feuille de match bloquée :", lineupBlocked(), "(attendu true)");
console.log("Message :", doc.getElementById("lockWarning").textContent);
if (!lineupBlocked()) throw new Error("❌ La feuille de match devrait être bloquée (poste Meneur sans titulaire).");
if (!doc.getElementById("lockWarning").textContent.includes("Meneur")) throw new Error("❌ Le message devrait mentionner le poste Meneur manquant.");
const markerIncomplete = markerByPos("Meneur").classList.contains("is-empty");
console.log(`${markerIncomplete ? "✅" : "❌"} Le marqueur Meneur est visuellement signalé comme incomplet.`);
if (!markerIncomplete) throw new Error("❌ La carte du poste vide devrait porter la classe 'is-empty'.");

// --- Réassigne un titulaire (le DOM a été reconstruit, on requery) : le
// verrouillage redevient possible.
const meneurSelect2 = markerByPos("Meneur").querySelector("select.cp-starter-select");
meneurSelect2.value = previousStarterId;
meneurSelect2.dispatchEvent(new win.Event("change"));
console.log("\nAprès réassignation du titulaire Meneur :");
console.log(`${!lineupBlocked() ? "✅" : "❌"} Feuille de match de nouveau jouable.`);
if (lineupBlocked()) throw new Error("❌ La feuille de match devrait être de nouveau jouable : " + doc.getElementById("lockWarning").textContent);

// --- Remplaçant sur plusieurs postes : ajoute un même joueur comme
// remplaçant Arrière ET Ailier shooteur (deux postes différents), via le
// menu déroulant "+ Ajouter un remplaçant…" du tableau sous le terrain.
function addSelectFor(pos) { return rowByPos(pos).querySelector("select.cp-add"); }
function assignedChipsFor(pos) { return [...rowByPos(pos).querySelectorAll(".cp-sub")]; }

// 3 joueurs max par poste (titulaire + 2 remplaçants, retour utilisateur
// 2026-09-27) : l'effectif de départ remplit déjà les 2 places, donc plus
// de « + Ajouter » ; on libère une place sur A et AS en retirant un chip.
for (const p of ["Arrière", "Ailier shooteur"]) {
  if (assignedChipsFor(p).length >= 2 && addSelectFor(p)) throw new Error(`❌ Poste ${p} plein : « + Ajouter » ne devrait plus apparaître.`);
  while (assignedChipsFor(p).length >= 2) assignedChipsFor(p).slice(-1)[0].querySelector(".cp-remove").click();
}
console.log("✅ Poste plein (2 remplaçants) : plus de « + Ajouter » ; place libérée en retirant un remplaçant.");
const arriereAddSel = addSelectFor("Arrière");
if (!arriereAddSel || arriereAddSel.options.length < 2) throw new Error("❌ Aucun remplaçant disponible pour Arrière.");
// Un candidat proposé AUSSI pour Ailier shooteur (les menus sont triés par
// note au poste depuis la note par poste, 2026-09-30 : le premier candidat
// Arrière peut déjà être remplaçant/réserviste AS, donc absent de ce menu).
const asCandidates = new Set([...addSelectFor("Ailier shooteur").options].map(o => o.value).filter(Boolean));
const firstOption = [...arriereAddSel.options].slice(1).find(o => asCandidates.has(o.value));
if (!firstOption) throw new Error("❌ (setup) aucun joueur proposé à la fois pour Arrière et Ailier shooteur.");
const chosenLabel = firstOption.textContent.replace(/\s*\(\d+\)$/, "").trim(); // enlève " (overall)" -> reste "Nom (Poste"
const chosenName = firstOption.textContent.split(" (")[0].trim();
arriereAddSel.value = firstOption.value;
arriereAddSel.dispatchEvent(new win.Event("change"));
console.log("\nJoueur choisi comme remplaçant Arrière :", chosenName);

const asAddSel = addSelectFor("Ailier shooteur");
const asOption = asAddSel && [...asAddSel.options].find(o => o.textContent.startsWith(chosenName + " ("));
if (!asOption) throw new Error("❌ Le même joueur devrait aussi apparaître comme remplaçant possible pour Ailier shooteur.");
asAddSel.value = asOption.value;
asAddSel.dispatchEvent(new win.Event("change"));

const arriereChipAfter = assignedChipsFor("Arrière").find(c => chipName(c) === chosenName);
const asChipAfter = assignedChipsFor("Ailier shooteur").find(c => chipName(c) === chosenName);
const bothChecked = !!arriereChipAfter && !!asChipAfter;
console.log(`${bothChecked ? "✅" : "❌"} Le même joueur est bien remplaçant sur DEUX postes simultanément (Arrière + Ailier shooteur).`);
if (!bothChecked) throw new Error("❌ Le joueur devrait apparaître comme remplaçant assigné sur les deux postes.");

// --- Un titulaire n'apparaît dans la liste des remplaçants d'AUCUN poste,
// et la ligne "Réservistes" liste bien les joueurs ni titulaires ni remplaçants.
const pivotStarterName = rowByPos("Pivot").querySelector(".cp-name").textContent.trim();
const appearsAsBackupSomewhere = tableRows().some(r =>
  [...r.querySelectorAll(".cp-sub")].some(c => chipName(c) === pivotStarterName)
);
console.log(`\n${!appearsAsBackupSomewhere ? "✅" : "❌"} Le titulaire Pivot (${pivotStarterName}) n'apparaît dans aucune liste de remplaçants.`);
if (appearsAsBackupSomewhere) throw new Error("❌ Un titulaire ne devrait jamais apparaître comme option de remplaçant.");

// Retour utilisateur (2026-09) : le message générique "Tous les joueurs sont
// soit titulaires, soit remplaçants sur au moins un poste" a été retiré —
// la ligne "Réservistes" n'existe plus du tout dans le DOM quand il n'y a
// aucun réserviste (voir buildLineupPanel), seulement quand reserves.length > 0.
const reservesLineEl = doc.querySelector(".lineup-reserves");
console.log("Ligne réservistes présente :", !!reservesLineEl, reservesLineEl ? `(" ${reservesLineEl.textContent}")` : "(aucun réserviste, ligne absente)");

// --- Persistance : sauvegarde puis rechargement dans une nouvelle session
// (même serveur, qui relit son fichier sur disque). ---
await flush(dom);
const saved = readRawSave(savePath);
console.log("\nLineup sauvegardé (titulaires) :", saved.team.lineup.starters);
win.close();

const dom2 = await openGame(html, baseUrl);
const doc2 = dom2.window.document;
const win2 = dom2.window;

const reloadedRow = doc2.querySelector('#ordresCardCinq .cp-card[data-pos="Arrière"]');
const reloadedChip = [...reloadedRow.querySelectorAll(".cp-sub")].find(c => chipName(c) === chosenName);
const persistedOk = !!reloadedChip;
console.log(`${persistedOk ? "✅" : "❌"} Le remplaçant multi-postes survit au rechargement.`);
if (!persistedOk) throw new Error("❌ L'assignation multi-postes ne survit pas au rechargement.");

// --- Un match se joue normalement avec la feuille de match éditée : après
// une absence dépassant la fenêtre de diffusion, le récapitulatif "Pendant
// votre absence" doit afficher un résultat cohérent, sans planter, avec la
// feuille de match personnalisée (voir server/liveMatch.js — computeLiveMatch
// simule avec le VRAI moteur, en utilisant league.teams[0] tel quel).
// Avant de manipuler calendarStartAt directement sur le fichier, attend
// toute sauvegarde "fire-and-forget" encore en vol depuis cette session
// (voir refreshTransferMarket/saveMyTeam) — sinon elle pourrait écraser
// notre modification si elle atteint le serveur APRÈS coup.
await flush(dom2);
win2.close();
fastForwardCalendar(savePath, 1);
const dom3 = await openGame(html, baseUrl);
const doc3 = dom3.window.document;
const catchupVisible = !doc3.getElementById("catchupSection").classList.contains("hidden");
console.log(`${catchupVisible ? "✅" : "❌"} Le match se joue normalement avec la feuille de match personnalisée (récapitulatif affiché).`);
if (!catchupVisible) throw new Error("❌ Le récapitulatif d'absence devrait s'afficher après le match.");
const catchupText = doc3.getElementById("catchupContent").textContent;
if (!/Journée 1/.test(catchupText)) throw new Error("❌ Le récapitulatif devrait mentionner la journée 1.");

await flush(dom3);
dom3.window.close();
server.close();
console.log("\n✅ Feuille de match vérifiée : titulaires/remplaçants éditables, minimum 5 joueurs imposé, remplaçant multi-postes, persistance.");

})().catch(e => { console.error(e); process.exit(1); });
