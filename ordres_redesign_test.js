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
//   8) "Réinitialiser ma carrière" n'existe plus (auparavant déplacé en
//      bas du Guide).
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const openOrdres = () => doc.getElementById("topbarOrdersBtn").click();
openOrdres();

// 1) Barre d'action. Vue « composition » (retour utilisateur 2026-09-30) :
// le bouton de validation (« Enregistrer », même #ordresValidateBtn) et
// l'état des ordres ont quitté la barre du haut pour la barre collée en bas
// de page (#ordresSaveBar, avec « Annuler ») ; la barre du haut garde le
// titre, les onglets et la pastille d'échéance du verrou.
const prep = doc.getElementById("prepSection");
const bar = doc.getElementById("ordresActionBar");
const saveBar = doc.getElementById("ordresSaveBar");
const validateBtn = doc.getElementById("ordresValidateBtn");
const grid = doc.getElementById("prepGrid");
if (!saveBar || !saveBar.contains(validateBtn) || !saveBar.contains(doc.getElementById("ordresRevertBtn"))) throw new Error("❌ « Enregistrer » et « Annuler » devraient être dans la barre du bas #ordresSaveBar.");
if (validateBtn.textContent.trim() !== "Enregistrer") throw new Error("❌ Le bouton principal devrait s'appeler « Enregistrer ».");
if (!(grid.compareDocumentPosition(saveBar) & win.Node.DOCUMENT_POSITION_FOLLOWING)) {
  throw new Error("❌ La barre d'enregistrement devrait venir APRÈS la grille des ordres (collée en bas).");
}
if (!/\.ordres-savebar\{[^}]*position:sticky; bottom:0/.test(html)) throw new Error("❌ La barre d'enregistrement devrait être collée en bas (position:sticky; bottom:0).");
if (!doc.getElementById("ordresRevertBtn").disabled) throw new Error("❌ « Annuler » devrait être grisé tant que rien n'a changé.");
const lockPill = doc.getElementById("ordresLockPill");
console.log("Pastille du verrou :", lockPill.textContent);
if (!bar.contains(lockPill) || !/^Verrouillage dans \d/.test(lockPill.textContent)) throw new Error("❌ La pastille « Verrouillage dans … » devrait être dans la barre du haut.");
const tabs = [...doc.querySelectorAll("#ordresSectionTabs [data-ordres-jump]")];
console.log("Onglets de la barre :", tabs.map(t => t.textContent.trim()).join(" | "));
["Composition", "Attaque", "Défense", "Adversaires"].forEach(label => {
  if (!tabs.some(t => t.textContent.trim() === label)) throw new Error(`❌ Onglet '${label}' manquant dans la barre d'action.`);
});
tabs.forEach(t => {
  if (!doc.getElementById(t.dataset.ordresJump)) throw new Error(`❌ L'onglet '${t.textContent.trim()}' vise #${t.dataset.ordresJump}, introuvable.`);
});
tabs[0].click(); // ne doit pas planter sans scrollIntoView (jsdom)
const statusText = () => doc.getElementById("ordresStatus").textContent.trim();
console.log("État initial :", statusText());
if (statusText() !== "Ordres pas encore validés") throw new Error(`❌ État initial attendu 'Ordres pas encore validés', obtenu '${statusText()}'.`);
console.log("✅ Barres : onglets + pastille du verrou en haut, état + Annuler/Enregistrer en bas.");

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
if (doc.getElementById("ordresRevertBtn").disabled) throw new Error("❌ « Annuler » devrait s'activer après un changement.");
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
// Carte Défense entièrement en boutons (retour utilisateur 2026-09-26) : les
// listes à 4-5 valeurs prennent toute la largeur et peuvent passer à la ligne.
[["ordresDefenseSelect", "DEF_LIST"], ["ordresScreenDefenseSelect", "SCREEN_DEFENSE_LIST"], ["ordresPostDefenseSelect", "POST_DEFENSE_LIST"]].forEach(([id, listName]) => {
  const el = doc.getElementById(id);
  if (!el || !el.classList.contains("seg-control") || !el.classList.contains("seg-wrap")) throw new Error(`❌ #${id} devrait être un groupe de boutons segmentés (seg-wrap).`);
  if (!el.closest(".ordres-field").classList.contains("ordres-field-wide")) throw new Error(`❌ #${id} devrait occuper toute la largeur de la carte.`);
  const vals = [...el.querySelectorAll(".seg-btn")].map(b => b.dataset.value);
  if (JSON.stringify(vals) !== JSON.stringify(win.eval(listName))) throw new Error(`❌ Les boutons de #${id} devraient reprendre exactement ${listName}.`);
});
const zonePress = [...doc.querySelectorAll("#ordresDefenseSelect .seg-btn")].find(b => b.dataset.value === "Zone press");
zonePress.dispatchEvent(new win.Event("click", { bubbles: true }));
if (win.eval("teamA.defense") !== "Zone press") throw new Error("❌ Cliquer 'Zone press' devrait mettre teamA.defense à 'Zone press'.");
const tierLabels = [...doc.querySelectorAll("#ordresTierToggle .seg-btn")].map(b => b.textContent);
if (JSON.stringify(tierLabels) !== JSON.stringify(["Débutant", "Confirmé"])) throw new Error(`❌ Libellés du niveau tactique attendus Débutant/Confirmé, obtenu ${JSON.stringify(tierLabels)}.`);
console.log("✅ Réglages à 2-3 valeurs en boutons segmentés (aide mise à jour), 'Confirmé' au masculin.");

// 5) Surveiller
[...doc.querySelectorAll("#ordresTierToggle .seg-btn")].find(b => b.dataset.value === "confirmée")
  .dispatchEvent(new win.Event("click", { bubbles: true }));
const row0 = doc.querySelectorAll("#ordresWatchAssignments .watch-row")[0];
const [playerSel, focusSel] = row0.querySelectorAll("select");
if (playerSel.options[0].textContent !== "Choisir un poste…") throw new Error("❌ Le 1er menu de Surveiller devrait proposer 'Choisir un poste…'.");
// Surveillance par poste (2026-09-27) : "Pivot (pressenti Léo Dupont)" —
// le poste d'abord, le titulaire adverse actuel en simple pronostic.
{
  const opts = [...playerSel.options].slice(1).map(o => o.textContent);
  const POS = win.eval("POSITIONS");
  opts.forEach((t, i) => {
    if (!(t === POS[i] || t.startsWith(`${POS[i]} (pressenti `))) throw new Error(`❌ Option Surveiller inattendue : "${t}" (attendu "${POS[i]}" ou "${POS[i]} (pressenti …)").`);
  });
  if (!opts.some(t => t.includes("(pressenti "))) throw new Error("❌ Le titulaire adverse pressenti devrait être indiqué à côté du poste.");
}
if (focusSel.options[0].textContent !== "Consigne") throw new Error("❌ Le 2e menu de Surveiller devrait proposer 'Consigne'.");
if (!focusSel.disabled) throw new Error("❌ 'Consigne' devrait être désactivé tant qu'aucun joueur n'est choisi.");
const oppPivot = win.eval("(() => { const id = teamB.lineup.starters['Pivot']; const p = teamB.players.find(x => x.id === id); return p ? p.name : null; })()");
const pivotOpt = [...playerSel.options].find(o => o.value === "Pivot");
console.log("Option Pivot de Surveiller :", pivotOpt.textContent, "(titulaire adverse :", oppPivot + ")");
if (oppPivot && pivotOpt.textContent !== `Pivot (pressenti ${oppPivot})`) throw new Error("❌ L'option Pivot devrait afficher « Pivot (pressenti <titulaire adverse>) ».");
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

// 6) Alerte remplaçant à plusieurs postes. Vue « composition »
// (2026-09-30) : la carte Rotation et son bandeau .ordres-alert ont
// disparu ; l'alerte est une pastille (.cp-warn.multi) sur la carte de
// chaque poste concerné, et la ligne du joueur y est marquée .multi.
const hasAlert = () => !!doc.querySelector("#ordresCardCinq .cp-warn.multi");
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
// Pastille « X est aussi remplaçant au poste Y » retirée (retour
// utilisateur 2026-10-03 : elle cachait le réserviste) ; la ligne du joueur
// reste surlignée sur ses deux postes.
if (doc.querySelector("#ordresCardCinq .cp-warn.multi")) throw new Error("❌ Plus de pastille « est aussi remplaçant » attendue.");
void multiName;
const multiChips = [...doc.querySelectorAll("#ordresCardCinq .cp-sub.multi")];
if (multiChips.length !== 2) throw new Error(`❌ Ce remplaçant devrait être surligné sur ses 2 postes, obtenu ${multiChips.length}.`);
console.log("✅ Remplaçant listé à plusieurs postes : pas de pastille, puces surlignées.");

// 7) Validation -> "Ordres validés"
await win.eval("validateOrdres()");
openOrdres();
console.log("État après validation puis réouverture :", statusText());
if (statusText() !== "Ordres validés") throw new Error(`❌ Après validation, l'état devrait être 'Ordres validés', obtenu '${statusText()}'.`);
console.log("✅ État 'Ordres validés' après un clic sur Valider les ordres.");

// 7 bis) « Annuler » (barre du bas, vue composition 2026-09-30) : revient
// aux ordres tels qu'à l'ouverture de la journée, tactique ET composition.
{
  const rhythmBefore = win.eval("teamA.rhythm");
  const pgBefore = win.eval("teamA.lineup.starters['Meneur']");
  const other = [...doc.querySelectorAll("#ordresRhythmSelect .seg-btn")].find(b => b.dataset.value !== rhythmBefore);
  other.dispatchEvent(new win.Event("click", { bubbles: true }));
  const pgSel = doc.querySelector('#ordresCardCinq .cp-card[data-pos="Meneur"] select.cp-starter-select');
  pgSel.value = "";
  pgSel.dispatchEvent(new win.Event("change"));
  if (win.eval("teamA.lineup.starters['Meneur']") != null) throw new Error("❌ Vider le menu du titulaire devrait libérer le poste.");
  if (!doc.querySelector('#ordresCardCinq .cp-card[data-pos="Meneur"].is-empty')) throw new Error("❌ La carte du poste vide devrait passer en « à pourvoir ».");
  doc.getElementById("ordresRevertBtn").click();
  if (win.eval("teamA.rhythm") !== rhythmBefore || win.eval("teamA.lineup.starters['Meneur']") !== pgBefore) throw new Error("❌ « Annuler » devrait rétablir le rythme et le titulaire d'origine.");
  if (statusText() === "Modifications à valider" || !doc.getElementById("ordresRevertBtn").disabled) throw new Error("❌ Après « Annuler », plus de modifications en attente.");
  console.log("✅ « Annuler » rétablit les ordres d'origine :", rhythmBefore, "/ meneur", pgBefore);
}

// 7 ter) Note PAR POSTE sur le terrain (retour utilisateur 2026-09-30 :
// "il faudrait que le jeu calcule une note par poste") : titulaire,
// remplaçant et réserviste notés AU POSTE de la carte ; alerte « Hors
// poste » quand la note ici est au moins COMPO_OFF_POSITION_GAP points sous
// celle du meilleur poste.
{
  const cardOf = pos => doc.querySelector(`#ordresCardCinq .cp-card[data-pos="${pos}"]`);
  win.eval("POSITIONS").forEach(pos => {
    const expected = win.eval(`(() => { const ids = teamA.slotPlayerIds(${JSON.stringify(pos)}); return ids.map(id => Math.round(positionRating(teamA.players.find(p => p.id === id), ${JSON.stringify(pos)}))); })()`);
    const shown = [Number(cardOf(pos).querySelector(".cp-ovr").textContent), ...[...cardOf(pos).querySelectorAll(".cp-sub-ovr")].map(e => Number(e.textContent))];
    if (JSON.stringify(shown) !== JSON.stringify(expected)) throw new Error(`❌ ${pos} : notes affichées ${JSON.stringify(shown)}, attendu (note au poste) ${JSON.stringify(expected)}.`);
  });
  console.log("✅ Cartes du terrain : notes AU POSTE pour titulaire, remplaçant et réserviste.");
  // Un meneur de métier aligné pivot : écart assez grand pour l'alerte.
  const off = win.eval(`(() => {
    const p = teamA.players.slice().sort((a, b) => (positionRating(b, bestPosition(b)) - positionRating(b, "Pivot")) - (positionRating(a, bestPosition(a)) - positionRating(a, "Pivot")))[0];
    p.attrs.pass = 95; p.attrs.dribble = 95; p.attrs.speed = 95; p.attrs.rebound = 5; p.attrs.block = 5; p.attrs.strength = 5;
    teamA.setStarter("Pivot", p.id); renderOrdresGrid();
    const best = bestPosition(p);
    return { name: p.name, here: Math.round(positionRating(p, "Pivot")), there: Math.round(positionRating(p, best)), best: POS_SHORT[best] };
  })()`);
  const warn = [...cardOf("Pivot").querySelectorAll(".cp-warn")].map(w => w.textContent).find(t => t.startsWith("Hors poste"));
  const expectedWarn = `Hors poste : ${off.here} ici, ${off.there} en ${off.best}`;
  console.log("Alerte hors poste :", warn);
  if (off.there - off.here < win.eval("COMPO_OFF_POSITION_GAP") || warn !== expectedWarn) throw new Error(`❌ Alerte hors poste attendue « ${expectedWarn} », obtenu « ${warn} ».`);
  if (Number(cardOf("Pivot").querySelector(".cp-ovr").textContent) !== off.here) throw new Error("❌ La carte Pivot devrait afficher la note du joueur AU POSTE de pivot.");
  const rosterRow = [...doc.querySelectorAll("#ordresCardConvocation .conv-row")].find(r => r.querySelector(".conv-name").firstChild.textContent === off.name);
  if (Number(rosterRow.querySelector(".conv-ovr").textContent) !== off.here || rosterRow.querySelector(".conv-pos").textContent !== off.best) throw new Error("❌ Liste de l'effectif : note au poste tenu et code du meilleur poste attendus.");
  console.log("✅ « Hors poste » piloté par l'écart avec le meilleur poste ; liste de l'effectif : note au poste tenu + meilleur poste.");
  // Seuil re-réglé (retour utilisateur 2026-09-30 (téléphone), refonte de
  // positionRating, note plus étalée) : un meneur dépanné à l'arrière, à
  // quelques points seulement de son meilleur poste, n'est PAS signalé.
  const near = win.eval(`(() => {
    const p = teamA.players.find(x => x.name !== ${JSON.stringify(off.name)} && !teamA.slotPlayerIds("Pivot").includes(x.id));
    ATTRS.forEach(a => { p.attrs[a] = 30; }); p.attrs.pass = 36; p.attrs.vision = 36;
    teamA.setStarter("Arrière", p.id); renderOrdresGrid();
    return { best: bestPosition(p), gap: positionRating(p, bestPosition(p)) - positionRating(p, "Arrière"), gapConst: COMPO_OFF_POSITION_GAP };
  })()`);
  const nearWarn = [...cardOf("Arrière").querySelectorAll(".cp-warn")].map(w => w.textContent).find(t => t.startsWith("Hors poste"));
  if (near.gapConst !== 5 || near.best !== "Meneur" || near.gap <= 0 || near.gap >= near.gapConst || nearWarn) throw new Error(`❌ Écart de voisin (${near.gap.toFixed(1)} pts, meilleur poste ${near.best}) : pas d'alerte « Hors poste » attendue (seuil ${near.gapConst}), obtenu « ${nearWarn} ».`);
  console.log(`✅ Meneur dépanné à l'arrière (${near.gap.toFixed(1)} pts d'écart < ${near.gapConst}) : pas d'alerte « Hors poste ».`);
}

// 7 quater) Infos joueurs dans l'effectif de la composition (retour
// testeur 2026-09-30 : "I don't see the information about the players
// (stats, fatigue) [...] easily compare the players") : forme dans la liste
// compacte et sur le terrain, vue « Détails » (forme, évaluation, moyennes
// de saison), colonnes triables, « Comparer » deux joueurs.
{
  const roster = () => doc.getElementById("ordresCardConvocation");
  const n = win.eval("teamA.players.length");
  const compactConds = [...roster().querySelectorAll(".conv-list .conv-row .conv-cond")];
  if (compactConds.length !== n || !compactConds.every(c => /^Forme physique : .+ \(\d+\/100\)$/.test(c.title))) throw new Error("❌ Liste compacte : une pastille de forme (avec infobulle) par joueur attendue.");
  const subs = doc.querySelectorAll("#ordresCardCinq .cp-sub");
  if (!subs.length || [...subs].some(s => !s.querySelector(".cp-sub-cond[title^='Forme physique']"))) throw new Error("❌ Remplaçants/réservistes du terrain : forme attendue sur chaque ligne.");
  // Ordre par défaut : rôle (titulaires d'abord), puis poste.
  // (un titulaire non convoqué ne jouera pas : il est listé « En tribune ».)
  const nStarters = win.eval("POSITIONS.filter(p => teamA.lineup.starters[p] != null && teamA.isConvoked(teamA.lineup.starters[p])).length");
  const roleTexts = [...roster().querySelectorAll(".conv-row .conv-role")].map(r => r.textContent);
  if (!roleTexts.slice(0, nStarters).every(t => t.startsWith("Titulaire")) || roleTexts.slice(nStarters).some(t => t.startsWith("Titulaire"))) throw new Error("❌ Ordre par défaut : les titulaires en tête, obtenu " + JSON.stringify(roleTexts));
  console.log("✅ Forme visible (liste compacte + remplaçants du terrain), titulaires en tête de liste.");

  doc.querySelector("[data-compo-view=details]").click();
  const heads = [...roster().querySelectorAll(".compo-table thead th")].map(th => th.textContent.replace(/[▲▼]/g, "").trim()).filter(Boolean);
  console.log("Colonnes Détails :", heads.join(" | "));
  ["Nom", "Poste", "GEN", "Rôle", "Forme", "Éval.", "MJ", "Min", "Pts", "Reb", "Pas"].forEach(h => { if (!heads.includes(h)) throw new Error(`❌ Colonne « ${h} » absente de la vue Détails.`); });
  const trs = () => [...roster().querySelectorAll(".compo-table tbody tr.conv-row")];
  if (trs().length !== n) throw new Error("❌ Vue Détails : une ligne par joueur attendue.");
  if (!trs().every(tr => tr.querySelector(".eff-cond .eff-meter") && tr.querySelectorAll(".eval-square").length === 5 && tr.querySelector("input[type=checkbox]"))) throw new Error("❌ Chaque ligne : case de convocation, barre de forme et 5 carrés d'évaluation attendus.");
  if (!trs()[0].querySelector(".player-link")) throw new Error("❌ Le nom doit ouvrir la fiche joueur (lien joueur).");
  // Tri par Forme : décroissant, puis croissant, puis ordre par défaut.
  const conds = () => trs().map(tr => Number(tr.querySelector(".eff-cond").title.match(/\((\d+)\/100\)/)[1]));
  const sortBtn = () => roster().querySelector('th[data-compo-sort="condition"] .ct-sort');
  sortBtn().click();
  const desc = conds();
  if (desc.some((v, i) => i && v > desc[i - 1])) throw new Error("❌ Tri Forme décroissant attendu : " + desc.join(","));
  sortBtn().click();
  const asc = conds();
  if (asc.some((v, i) => i && v < asc[i - 1])) throw new Error("❌ Tri Forme croissant attendu : " + asc.join(","));
  sortBtn().click();
  if (win.eval("compoRosterSort.key") !== null) throw new Error("❌ 3e clic : retour à l'ordre par défaut.");
  roster().querySelector('th[data-compo-sort="name"] .ct-sort').click();
  const names = trs().map(tr => tr.querySelector(".conv-name").textContent.trim());
  if (names.join("|") !== names.slice().sort((a, b) => a.localeCompare(b)).join("|")) throw new Error("❌ Tri par nom (A→Z) attendu.");
  console.log("✅ Vue Détails : colonnes Nom/Poste/GEN/Rôle/Forme/Éval./MJ/Min/Pts/Reb/Pas, tri Forme ↓ ↑ puis défaut, tri par nom.");
  // Réglage « TC » (Paramètres) : la colonne GEN devient TC, avec le total
  // des caractéristiques (retour utilisateur 2026-10-05).
  win.eval("localStorage.setItem(RATING_MODE_KEY, 'tc')");
  doc.querySelector("[data-compo-view=compact]").click();
  doc.querySelector("[data-compo-view=details]").click();
  if (win.eval("ratingDisplayMode()") !== "tc") throw new Error("❌ Mode TC non pris en compte.");
  const tcHead = roster().querySelector('th[data-compo-sort="rating"]').textContent.replace(/[▲▼]/g, "").trim();
  const tcRow = trs()[0];
  const tcVal = Number(tcRow.querySelector(".ct-rating").textContent);
  const tcExpected = win.eval(`playerTotalCaracs(teamA.players.find(p => String(p.id) === "${tcRow.dataset.playerId}") || teamA.youthPlayers.find(p => String(p.id) === "${tcRow.dataset.playerId}"), ATTRS)`);
  if (tcHead !== "TC" || tcVal !== tcExpected) throw new Error(`❌ Mode TC : en-tête « TC » et total des caractéristiques attendus (${tcHead}, ${tcVal} vs ${tcExpected}).`);
  win.eval("localStorage.setItem(RATING_MODE_KEY, 'gen')");
  doc.querySelector("[data-compo-view=compact]").click();
  doc.querySelector("[data-compo-view=details]").click();
  console.log("✅ Colonne GEN, remplacée par TC (total des caractéristiques) quand TC est choisi dans les paramètres.");
  // Convocation depuis la vue Détails : même effet que la liste compacte.
  const convBefore = win.eval("teamA.convokedIds().length");
  const onRow = trs().find(tr => tr.classList.contains("on") && /Réserviste|Remplaçant/.test(tr.textContent));
  const onCb = onRow.querySelector(".ct-conv input");
  onCb.checked = false; onCb.dispatchEvent(new win.Event("change"));
  if (win.eval("teamA.convokedIds().length") !== convBefore - 1) throw new Error("❌ Décocher la convocation dans la vue Détails devrait retirer le joueur.");
  // Comparer : 2 cases cochées → comparateur.
  const cmpBtn = () => doc.getElementById("compoCompareBtn");
  if (!cmpBtn().disabled) throw new Error("❌ « Comparer » désactivé tant que deux joueurs ne sont pas cochés.");
  [0, 1].forEach(i => { const cb = trs()[i].querySelector(".compo-compare-cb"); cb.checked = true; cb.dispatchEvent(new win.Event("change")); });
  if (cmpBtn().disabled || !/2\/2/.test(cmpBtn().textContent)) throw new Error("❌ « Comparer (2/2) » actif avec deux joueurs cochés.");
  const ids = win.eval("compoCompareIds.slice()");
  cmpBtn().click();
  if (doc.getElementById("playerCompareSection").classList.contains("hidden") || win.eval("playerCompareState.b && playerCompareState.b.playerId") !== ids[1]) throw new Error("❌ « Comparer » devrait ouvrir le comparateur sur les deux joueurs cochés.");
  console.log("✅ Vue Détails : convocation, « Comparer » deux joueurs → comparateur.");
  openOrdres();
  doc.querySelector("[data-compo-view=compact]").click();
  win.eval("compoRosterSort = { key: null, dir: -1 }");
}

// 8) Plus de « Réinitialiser ma carrière » nulle part (carrière solo
// supprimée, 2026-09-29).
if (doc.getElementById("resetCareerLink") || doc.body.textContent.includes("Réinitialiser ma carrière")) {
  throw new Error("❌ 'Réinitialiser ma carrière' ne devrait plus exister.");
}
console.log("✅ 'Réinitialiser ma carrière' n'existe plus.");

// 9) Bandeau global (club, recherche, "Donnez vos ordres") masqué sur la
// page Ordres UNIQUEMENT (retour utilisateur 2026-09-25 : infos en doublon).
const topbar = doc.querySelector(".topbar");
openOrdres();
if (!topbar.classList.contains("topbar-hidden-on-page")) throw new Error("❌ Le bandeau du haut devrait être masqué sur la page Ordres.");
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "club").click();
if (topbar.classList.contains("topbar-hidden-on-page")) throw new Error("❌ Le bandeau du haut devrait réapparaître hors de la page Ordres.");
openOrdres();
if (!topbar.classList.contains("topbar-hidden-on-page")) throw new Error("❌ Le bandeau devrait de nouveau être masqué en revenant sur Ordres.");
console.log("✅ Bandeau du haut masqué sur Ordres uniquement.");

await flush(dom);
win.close();
server.close();
console.log("\n✅ Refonte de la page Ordres : tous les contrôles passent.");
})().catch(e => { console.error(e); process.exit(1); });
