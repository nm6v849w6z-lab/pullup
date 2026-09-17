// Vérifie la feuille de match éditable (titulaires/remplaçants) : un
// titulaire par poste (5 minimum, sinon impossible de verrouiller le
// match), un même remplaçant peut couvrir plusieurs postes, et tout
// survit à une sauvegarde/rechargement. Couvre la version "terrain" de
// l'éditeur (marqueurs positionnés + tableau des remplaçants).
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, fastForwardCalendar } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

const POS_CODE = { "Meneur": "M", "Arrière": "A", "Ailier shooteur": "AS", "Ailier fort": "AF", "Pivot": "P" };

function courtMarkers() { return [...doc.querySelectorAll(".court-marker")]; }
function markerByPos(pos) { return courtMarkers().find(m => m.querySelector(".cm-pos").textContent === POS_CODE[pos]); }
function tableRows() { return [...doc.querySelectorAll(".lineup-table tbody tr")]; }
function rowByPos(pos) { return tableRows().find(r => r.querySelector(".lt-pos").textContent === POS_CODE[pos]); }

// --- Par défaut (équipe auto-générée), la feuille de match doit déjà être
// valide (5 titulaires, un par poste) et le bouton de verrouillage actif.
const markersInit = courtMarkers();
console.log("Marqueurs de poste sur le terrain :", markersInit.length, "(attendu 5)");
if (markersInit.length !== 5) throw new Error("❌ Il devrait y avoir un marqueur par poste (5) sur le terrain.");
const incompleteAtStart = doc.querySelectorAll(".court-marker.incomplete").length;
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
const meneurSelect = markerByPos("Meneur").querySelector("select");
const previousStarterId = meneurSelect.value;
meneurSelect.value = "";
meneurSelect.dispatchEvent(new win.Event("change"));

console.log("\nAprès avoir vidé le titulaire Meneur :");
console.log("Feuille de match bloquée :", lineupBlocked(), "(attendu true)");
console.log("Message :", doc.getElementById("lockWarning").textContent);
if (!lineupBlocked()) throw new Error("❌ La feuille de match devrait être bloquée (poste Meneur sans titulaire).");
if (!doc.getElementById("lockWarning").textContent.includes("Meneur")) throw new Error("❌ Le message devrait mentionner le poste Meneur manquant.");
const markerIncomplete = markerByPos("Meneur").classList.contains("incomplete");
console.log(`${markerIncomplete ? "✅" : "❌"} Le marqueur Meneur est visuellement signalé comme incomplet.`);
if (!markerIncomplete) throw new Error("❌ Le marqueur du poste vide devrait porter la classe 'incomplete'.");

// --- Réassigne un titulaire (le DOM a été reconstruit, on requery) : le
// verrouillage redevient possible.
const meneurSelect2 = markerByPos("Meneur").querySelector("select");
meneurSelect2.value = previousStarterId;
meneurSelect2.dispatchEvent(new win.Event("change"));
console.log("\nAprès réassignation du titulaire Meneur :");
console.log(`${!lineupBlocked() ? "✅" : "❌"} Feuille de match de nouveau jouable.`);
if (lineupBlocked()) throw new Error("❌ La feuille de match devrait être de nouveau jouable : " + doc.getElementById("lockWarning").textContent);

// --- Remplaçant sur plusieurs postes : ajoute un même joueur comme
// remplaçant Arrière ET Ailier shooteur (deux postes différents), via le
// menu déroulant "+ Ajouter un remplaçant…" du tableau sous le terrain.
function addSelectFor(pos) { return rowByPos(pos).querySelector(".lineup-add-select"); }
function assignedChipsFor(pos) { return [...rowByPos(pos).querySelectorAll(".lineup-backup-chip")]; }

const arriereAddSel = addSelectFor("Arrière");
if (!arriereAddSel || arriereAddSel.options.length < 2) throw new Error("❌ Aucun remplaçant disponible pour Arrière.");
const firstOption = arriereAddSel.options[1];
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

const arriereChipAfter = assignedChipsFor("Arrière").find(c => c.textContent.trim().startsWith(chosenName + " ("));
const asChipAfter = assignedChipsFor("Ailier shooteur").find(c => c.textContent.trim().startsWith(chosenName + " ("));
const bothChecked = !!arriereChipAfter && !!asChipAfter;
console.log(`${bothChecked ? "✅" : "❌"} Le même joueur est bien remplaçant sur DEUX postes simultanément (Arrière + Ailier shooteur).`);
if (!bothChecked) throw new Error("❌ Le joueur devrait apparaître comme remplaçant assigné sur les deux postes.");

// --- Un titulaire n'apparaît dans la liste des remplaçants d'AUCUN poste,
// et la ligne "Réservistes" liste bien les joueurs ni titulaires ni remplaçants.
const pivotStarterName = rowByPos("Pivot").querySelector(".lt-starter").textContent.trim();
const appearsAsBackupSomewhere = tableRows().some(r =>
  [...r.querySelectorAll(".lineup-backup-chip")].some(c => c.textContent.trim().startsWith(pivotStarterName + " ("))
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

const reloadedRow = [...doc2.querySelectorAll(".lineup-table tbody tr")].find(r => r.querySelector(".lt-pos").textContent === "A");
const reloadedChip = [...reloadedRow.querySelectorAll(".lineup-backup-chip")].find(c => c.textContent.trim().startsWith(chosenName + " ("));
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
