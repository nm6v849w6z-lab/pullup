// Écran Ordres : envoi DIFFÉRÉ (retour utilisateur 2026-10-10, téléphone :
// « si j'appuie sur un des boutons, il ne s'active pas de suite […]
// l'information pourrait être envoyée seulement quand on clique sur
// Enregistrer »). Vérifie :
//  - chaque réglage s'applique tout de suite à l'écran, AUCUN envoi au
//    serveur pendant les réglages ;
//  - « Enregistrer » envoie tout, confirme, et la sauvegarde serveur porte
//    les nouveaux réglages ;
//  - réglage oublié : envoyé automatiquement en quittant l'écran Ordres ;
//  - échec de l'envoi : pas de « Ordres enregistrés », réglages gardés et
//    renvoyés plus tard.
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };

(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const win = dom.window, doc = win.document;
  const posts = [];
  const realFetch = win.fetch;
  win.fetch = (input, init) => {
    if (init && String(init.method || "GET").toUpperCase() === "POST") posts.push(String(input).replace(/^.*\/api/, "/api"));
    return realFetch(input, init);
  };
  win.eval("openTopbarOrders()");
  await flush(dom);
  assert(!doc.getElementById("prepSection").classList.contains("hidden"), "écran Ordres ouvert (match immédiat)");

  const seg = (groupId, pick) => [...doc.querySelectorAll(`#${groupId} .seg-btn`)].find(pick);
  const def0 = win.eval("teamA.defense");
  const defBtn = seg("ordresDefenseSelect", b => b.dataset.value !== def0);
  const rhythm0 = win.eval("teamA.rhythm");
  const rhBtn = seg("ordresRhythmSelect", b => b.dataset.value !== rhythm0);
  posts.length = 0;
  defBtn.click();
  assert(defBtn.classList.contains("active") && win.eval("teamA.defense") === defBtn.dataset.value, "réglage actif immédiatement à l'écran");
  rhBtn.click();
  const box = [...doc.querySelectorAll("#prepSection .conv-list input[type=checkbox]")].find(b => !b.disabled);
  const wasChecked = box.checked;
  box.click();
  await flush(dom);
  assert(posts.length === 0, "aucun envoi au serveur pendant les réglages (" + JSON.stringify(posts) + ")");
  assert(/Modifications à valider/.test(doc.getElementById("ordresStatus").textContent), "état : modifications à valider");
  assert(readRawSave(savePath).team.defense === def0, "serveur inchangé avant « Enregistrer »");

  // « Enregistrer » : tout part, confirmation, sauvegarde à jour.
  doc.getElementById("ordresValidateBtn").click();
  await new Promise(r => setTimeout(r, 0));
  await win.eval("ordresValidationInFlight || Promise.resolve()");
  await flush(dom);
  assert(posts.includes("/api/tactics") && posts.includes("/api/lineup"), "« Enregistrer » envoie tactiques et feuille de match");
  const saved = readRawSave(savePath).team;
  assert(saved.defense === defBtn.dataset.value && saved.rhythm === rhBtn.dataset.value, "sauvegarde serveur : défense et rythme enregistrés");
  assert(JSON.stringify(saved.lineup.convoked) === win.eval("JSON.stringify(teamA.lineup.convoked)") && box.checked !== wasChecked, "feuille de match enregistrée telle qu'à l'écran");
  assert(!win.eval("ordresHasPending()"), "file vide après l'enregistrement");

  // Réglage oublié : parti en quittant l'écran Ordres.
  win.eval("openTopbarOrders()");
  await flush(dom);
  const def1 = win.eval("teamA.defense");
  posts.length = 0;
  seg("ordresDefenseSelect", b => b.dataset.value !== def1).click();
  const def2 = win.eval("teamA.defense");
  assert(posts.length === 0 && win.eval("ordresHasPending()"), "réglage en attente, rien envoyé");
  win.eval("TAB_HANDLERS.club()");
  await flush(dom);
  assert(posts.includes("/api/tactics") && readRawSave(savePath).team.defense === def2, "en quittant l'écran Ordres, le réglage part automatiquement au serveur");

  // Échec de l'envoi : pas de fausse confirmation, réglages gardés.
  win.eval("openTopbarOrders()");
  await flush(dom);
  const def3 = win.eval("teamA.defense");
  seg("ordresDefenseSelect", b => b.dataset.value !== def3).click();
  const def4 = win.eval("teamA.defense");
  win.fetch = (input, init) => (/\/api\/(tactics|lineup)/.test(String(input)) ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ ok: false, error: "Refus de test." }) }) : realFetch(input, init));
  await win.eval("validateOrdres()");
  assert(/Échec/.test(doc.getElementById("ordresValidateFeedback").textContent) && !/Ordres enregistrés/.test(doc.getElementById("ordresValidateFeedback").textContent), "échec : message d'erreur, pas de « Ordres enregistrés »");
  assert(win.eval("ordresHasPending()") && win.eval("teamA.defense") === def4, "échec : réglage gardé à l'écran et toujours en attente");
  win.fetch = realFetch;
  // Nouvelle tentative : « Enregistrer » une seconde fois, réseau revenu.
  await win.eval("validateOrdres()");
  await flush(dom);
  assert(readRawSave(savePath).team.defense === def4 && !win.eval("ordresHasPending()"), "nouvelle tentative : enregistré, file vide");

  // Réseau lent : progression visible, double appui ignoré, réglages
  // toujours instantanés pendant l'envoi.
  win.eval("openTopbarOrders()");
  await flush(dom);
  const def5 = win.eval("teamA.defense");
  seg("ordresDefenseSelect", b => b.dataset.value !== def5).click();
  const def6 = win.eval("teamA.defense");
  posts.length = 0;
  let release;
  const gate = new Promise(r => { release = r; });
  win.fetch = (input, init) => {
    if (init && String(init.method || "GET").toUpperCase() === "POST") posts.push(String(input).replace(/^.*\/api/, "/api"));
    return /\/api\/(tactics|lineup)/.test(String(input)) ? gate.then(() => realFetch(input, init)) : realFetch(input, init);
  };
  const btn = doc.getElementById("ordresValidateBtn");
  btn.click();
  win.eval("validateOrdres()"); // second appui (même si le bouton est désactivé)
  await new Promise(r => setTimeout(r, 30));
  assert(/Enregistrement en cours/.test(doc.getElementById("ordresValidateFeedback").textContent) && btn.disabled, "réseau lent : « Enregistrement en cours… », bouton désactivé");
  assert(posts.filter(x => x === "/api/tactics").length === 1, "double appui : une seule sauvegarde envoyée");
  const rh = win.eval("teamA.rhythm");
  const rhBtn2 = seg("ordresRhythmSelect", b => b.dataset.value !== rh);
  rhBtn2.click();
  assert(rhBtn2.classList.contains("active") && win.eval("ordresHasPending()"), "pendant l'envoi, un nouveau réglage reste instantané (gardé en attente)");
  release();
  await win.eval("ordresValidationInFlight || Promise.resolve()");
  win.fetch = realFetch;
  await flush(dom);
  const after = readRawSave(savePath).team;
  assert(after.defense === def6 && after.rhythm === rhBtn2.dataset.value, "sauvegarde terminée, et le réglage fait pendant l'envoi est parti ensuite (sortie vers le calendrier)");

  // Rechargement complet de la page : les réglages enregistrés sont là.
  const dom2 = await openGame(html, baseUrl);
  await flush(dom2);
  assert(dom2.window.eval("teamA.defense") === def6 && dom2.window.eval("teamA.rhythm") === rhBtn2.dataset.value, "après rechargement de la page : derniers réglages présents");
  dom2.window.close();

  win.close(); server.close();
  console.log("\n🏁 ordres_deferred_save_test.js : réglages instantanés, envoi à « Enregistrer » ou en quittant l'écran.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
