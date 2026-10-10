// Vue « composition » des Ordres (retours utilisateur 2026-09-30) :
//   A) verrou : une fois l'échéance (T − 5 min) franchie PAGE OUVERTE, le
//      rafraîchissement de 30 s (refreshOrdresLockState) fige tout l'écran :
//      « Enregistrer » et « Annuler » réellement désactivés, barre du bas
//      « Ordres verrouillés », pastille « Verrouillé », plus aucun contrôle
//      d'édition de la composition (menus, ×, + Remplaçant, convocation,
//      minutes) ; repasser le sélecteur « Préparer le match » sur une journée
//      future non verrouillée réactive tout ;
//   B) « Annuler » sur une journée future SANS plan à l'ouverture : le plan
//      créé par les modifications est retiré (local + serveur), plus de
//      « (préparé) ● » ;
//   C) « Annuler » sur une journée future AVEC plan à l'ouverture : ce plan
//      est restauré à l'identique (local + serveur) ;
//   D) rien de modifié : « Annuler » désactivé, aucune requête.
const fs = require("fs");
const { startTestServer, openGame, flush, patchDateNow } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
const clock = { now: Date.now() };
const { server, baseUrl, multiSavePath } = await startTestServer(() => clock.now);
const dom = await openGame(html, baseUrl, (w) => patchDateNow(w, () => clock.now));
patchDateNow(dom.window, () => clock.now);
await flush(dom);
const doc = dom.window.document, win = dom.window;
const openOrdres = () => doc.getElementById("topbarOrdersBtn").click();
const $ = id => doc.getElementById(id);
const statusText = () => $("ordresStatus").textContent.trim();
const savedPlans = () => JSON.parse(fs.readFileSync(multiSavePath, "utf-8")).league.teams[0].plannedTactics || {};

assert(/setInterval\(\(\) => refreshOrdresLockState\(\), 30000\)/.test(html), "le rafraîchissement de 30 s réévalue le verrou (refreshOrdresLockState)");

// ------------------------------------------------------------------ A
const kickoff = win.eval("scheduledTimeForCurrentMatch()");
clock.now = kickoff - 6 * 60 * 1000;
openOrdres();
const court = () => doc.getElementById("ordresCardCinq");
const editableState = () => ({
  validate: $("ordresValidateBtn").disabled,
  revert: $("ordresRevertBtn").disabled,
  selects: court().querySelectorAll("select.cp-starter-select").length,
  removes: court().querySelectorAll(".cp-remove").length,
  adds: court().querySelectorAll("select.cp-add").length,
  convEnabled: [...court().querySelectorAll(".conv-row input")].filter(i => !i.disabled).length,
  minutes: doc.querySelectorAll("#ordresCardMinutes .pt-btn").length,
  segEnabled: [...doc.querySelectorAll("#prepGrid .seg-btn")].filter(b => !b.disabled).length,
});
let st = editableState();
assert(!win.eval("ordresPanelLocked") && !st.validate && st.selects === 5 && st.convEnabled > 0 && st.minutes === 5 && st.segEnabled > 0, "À T-6 min : tout est éditable, « Enregistrer » actif");
assert(st.revert, "Rien de modifié : « Annuler » désactivé");
assert(/^Verrouillage dans \d+ min$/.test($("ordresLockPill").textContent), "Pastille : " + $("ordresLockPill").textContent);

clock.now = kickoff - 4 * 60 * 1000;
win.eval("refreshOrdresLockState()"); // = le tick de 30 s
st = editableState();
assert(win.eval("ordresPanelLocked") === true, "À T-4 min, page ouverte : écran verrouillé par le rafraîchissement");
assert($("ordresValidateBtn").hasAttribute("disabled") && $("ordresRevertBtn").hasAttribute("disabled"), "« Enregistrer » et « Annuler » ont l'attribut disabled");
assert(statusText() === "Ordres verrouillés", "Barre du bas : « Ordres verrouillés »");
assert($("ordresLockPill").textContent === "Verrouillé", "Pastille : « Verrouillé »");
assert(st.selects === 0 && st.removes === 0 && st.adds === 0 && st.convEnabled === 0 && st.minutes === 0 && st.segEnabled === 0,
  "Plus aucun contrôle d'édition (menus, ×, + Remplaçant, convocation, minutes, réglages) : " + JSON.stringify(st));
$("ordresValidateBtn").click(); // attribut disabled : ne fait rien
await win.eval("validateOrdres()");
assert(/verrouillés/.test($("ordresValidateFeedback").textContent), "validateOrdres() refuse d'envoyer quand c'est verrouillé");

const future = win.eval("upcomingRoundsForOrders().find(r => r.competition === 'championship' && r.round !== currentMatch.round)");
assert(future, `Journée future disponible dans le sélecteur (J${future && future.round + 1})`);
win.eval(`selectOrdresRound(${future.round}, "championship")`);
st = editableState();
assert(!win.eval("ordresPanelLocked") && !st.validate && st.selects === 5 && st.convEnabled > 0 && st.minutes === 5, "Journée future non verrouillée : tout est de nouveau éditable");
assert(/^Verrouillage dans /.test($("ordresLockPill").textContent) && statusText() !== "Ordres verrouillés", "Pastille et barre du bas suivent la journée future");

// ------------------------------------------------------------------ B
clock.now = kickoff - 60 * 60 * 1000;
const key = win.eval(`planKey(${future.round}, "championship")`);
assert(!win.eval(`teamA.hasPlanForRound(${future.round}, "championship")`), "B) Journée future sans plan à l'ouverture");
const clickSeg = (groupId, value) => [...doc.querySelectorAll(`#${groupId} .seg-btn`)].find(b => b.dataset.value === value).dispatchEvent(new win.Event("click", { bubbles: true }));
const other = v => win.eval("DEF_LIST").find(x => x !== v);
clickSeg("ordresDefenseSelect", other(win.eval(`teamA.getPlanForRound(${future.round}, "championship").defense`)));
await flush(dom);
// Envoi différé (2026-10-10) : le plan existe tout de suite à l'écran, il
// ne part au serveur qu'à « Enregistrer » (ou en quittant la journée).
assert(win.eval(`teamA.hasPlanForRound(${future.round}, "championship")`) && !savedPlans()[key] && win.eval("ordresPending.plans.size") === 1, "Une modification crée le plan en local, envoi différé (rien au serveur avant « Enregistrer »)");
assert(!$("ordresRevertBtn").disabled, "« Annuler » actif après modification");
$("ordresRevertBtn").click();
await flush(dom);
assert(!win.eval(`teamA.hasPlanForRound(${future.round}, "championship")`), "« Annuler » retire le plan local");
assert(!savedPlans()[key], "« Annuler » retire le plan côté serveur");
const optText = [...doc.querySelectorAll("#ordresRoundSelector option")].find(o => o.selected).textContent;
assert(!/préparé|●/.test(optText) && statusText() === "Ordres pas encore préparés", "Plus de « (préparé) ● » : " + optText.trim() + " / " + statusText());

// ------------------------------------------------------------------ C
clickSeg("ordresDefenseSelect", "Zone press");
clickSeg("ordresRhythmSelect", "Lent");
await flush(dom);
win.eval(`selectOrdresRound(${future.round}, "championship")`); // réouverture : plan présent
const original = win.eval(`JSON.stringify(teamA.getPlanForRound(${future.round}, "championship"))`);
assert(JSON.parse(original).defense === "Zone press", "C) Journée future avec plan à l'ouverture (Zone press, Lent)");
clickSeg("ordresDefenseSelect", "Zone intérieure");
const pgSel = doc.querySelector('#ordresCardCinq .cp-card[data-pos="Meneur"] select.cp-starter-select');
pgSel.value = "";
pgSel.dispatchEvent(new win.Event("change"));
assert(win.eval(`teamA.getPlanForRound(${future.round}, "championship").defense`) === "Zone intérieure", "Le plan a bien été modifié");
$("ordresRevertBtn").click();
await flush(dom);
assert(win.eval(`JSON.stringify(teamA.getPlanForRound(${future.round}, "championship"))`) === original, "« Annuler » restaure le plan d'origine à l'identique (local)");
const srv = savedPlans()[key];
assert(srv && srv.defense === "Zone press" && srv.rhythm === "Lent" && srv.lineup.starters["Meneur"] === JSON.parse(original).lineup.starters["Meneur"], "… et côté serveur");
assert(/préparé/.test(statusText()) && $("ordresRevertBtn").disabled, "Toujours « Ordres préparés », « Annuler » de nouveau désactivé");

// ------------------------------------------------------------------ D
let calls = 0;
const realFetch = win.fetch;
win.fetch = (...a) => { calls++; return realFetch(...a); };
$("ordresRevertBtn").click();
win.eval("revertOrdres()");
assert(calls === 0, "D) Sans modification, « Annuler » n'envoie aucune requête");
win.fetch = realFetch;

await flush(dom);
win.close(); server.close();
console.log("\n🏁 Verrou des ordres et « Annuler » exact vérifiés.");
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
