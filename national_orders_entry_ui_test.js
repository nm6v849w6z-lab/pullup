// Mode Sélection : accès aux ordres d'un match (BUG 2026-10-09, « impossible
// de donner ses ordres depuis le calendrier, ni avec Donner / Modifier vos
// ordres »). Causes corrigées :
//  - le calendrier du mode (calendrier public des sélections) n'avait AUCUNE
//    action sur un match à venir ;
//  - sur téléphone, le bouton de la barre du haut est masqué (règle mobile,
//    .topbar-cta) et rien ne le remplaçait ;
//  - le bouton du haut visait le premier match de la liste, même déjà
//    commencé (bloqué sur « Ordres verrouillés »), et un clic sur un match
//    verrouillé ne faisait rien, sans message ;
//  - un « Enregistrer » pendant un envoi en cours affichait « Ordres
//    enregistrés » sans rien enregistrer et effaçait les modifications.
// Un seul chemin (HM_NATIONAL_COACH.openOrders → page Tactique → tqSave →
// /api/national/coach/tactics avec matchId), testé depuis chaque entrée.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-oe";
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  const root = baseUrl.replace(/\/?(\?.*)?$/, "/");
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const admin = body => fetch(root + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify(body) }).then(r => r.json());
  assert((await admin({ action: "appoint", teamId: "fr-A", club })).ok, "nomination de test (admin)");
  // Amical programmé par l'admin demain (moins de 3 jours : liste de
  // convocations déjà figée côté calendrier, comme en production).
  const day = new Date(Date.now() + 30 * 3600e3).toISOString().slice(0, 10);
  const fr = await admin({ action: "friendly", home: "fr-A", away: "de-A", date: day, time: "15:00", force: true });
  assert(fr.ok && fr.friendlies.length === 1, "amical France A – Allemagne A programmé");
  const friendlyId = fr.friendlies[0].id;
  dom.window.close();

  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  const errors = [];
  win.addEventListener("error", e => errors.push(e.message));
  const toasts = [];
  const realToast = win.showToast;
  win.showToast = msg => { toasts.push(String(msg)); if (typeof realToast === "function") realToast(msg); };
  win.eval("TAB_HANDLERS.club()");
  await wait(() => doc.querySelector("#ncDashSlot [data-nc-enter]"), "bouton du tableau de bord");
  doc.querySelector("#ncDashSlot [data-nc-enter]").click();
  await wait(() => win.HM_NATIONAL_COACH.state.view && win.HM_NATIONAL_COACH.state.view.team && win.HM_NATIONAL_COACH.state.tv, "entrée dans le mode");
  await flush(dom);
  const st = win.HM_NATIONAL_COACH.state;
  const post = (path, body) => win.fetchApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ teamId: "fr-A" }, body)) }).then(r => r.json());
  for (const x of st.view.pool.players.slice(0, 15)) await post("/api/national/coach/list", { list: "preselection", on: true, player: { p: x.p, n: x.n } });
  await win.HM_NATIONAL_COACH.enterMode("fr-A");
  await flush(dom);
  const up = st.view.upcoming;
  assert(up.length >= 2 && String(up[0].id) === String(friendlyId) && up[0].players.length === 15, "matchs à venir : l'amical en premier, 15 joueurs");
  const qualif = up.find(x => String(x.id) !== String(friendlyId));
  const page = () => doc.getElementById("ncOrdres");
  const nav = async name => { doc.querySelector(`#ncSidebar [data-nc-nav="${name}"]`).click(); await flush(dom); };
  const calBtn = id => doc.querySelector(`#nationalContent .nc-cal-orders[data-nc-orders="${id}"]`);

  // 1. Calendrier : chaque match à venir a son bouton, la ligne entière est cliquable.
  await nav("calendrier");
  assert(calBtn(friendlyId) && /Donnez vos ordres/.test(calBtn(friendlyId).textContent), "calendrier : bouton « Donnez vos ordres » sur l'amical");
  assert(calBtn(qualif.id), "calendrier : bouton sur le match de qualification");
  assert(calBtn(friendlyId).closest("tr").matches("tr.nc-orders-row[data-nc-orders]"), "calendrier : ligne du match cliquable");
  calBtn(qualif.id).click();
  await flush(dom);
  assert(st.nav === "tactique" && st.tqMatch === String(qualif.id) && page() && doc.getElementById("ncTqMatch").value === String(qualif.id), "clic calendrier : Tactique ouverte sur CE match (identifiant transmis)");
  assert(page().querySelector(".omc-teams") && page().textContent.includes(qualif.comp), "écran : carte du bon match (compétition)");
  await nav("calendrier");
  calBtn(friendlyId).closest("tr").querySelector("td").click();
  await flush(dom);
  assert(st.nav === "tactique" && st.tqMatch === String(friendlyId), "clic sur la ligne du calendrier : ordres de l'amical");

  // 2. Bouton de la barre du haut.
  await nav("dashboard");
  const topBtn = () => doc.getElementById("ncOrdersBtn");
  assert(/Donnez vos ordres/.test(topBtn().textContent) && !topBtn().disabled, "barre du haut : « Donnez vos ordres » actif");
  topBtn().click();
  await flush(dom);
  assert(st.nav === "tactique" && st.tqMatch === String(friendlyId) && doc.getElementById("ncTqGrid"), "barre du haut : Tactique du prochain match");

  // Modifier, enregistrer.
  const seg = v => [...page().querySelectorAll(".area-ordresCardDefense .seg-btn")].find(b => b.dataset.value === v);
  seg("Zone intérieure").click();
  assert(/Modifications à valider/.test(doc.getElementById("ncTqStatus").textContent), "modification : à valider");
  // Envoi déjà en cours : pas de fausse confirmation, modifications gardées.
  st.busy = true; toasts.length = 0;
  page().querySelector("[data-nc-tq-save]").removeAttribute("disabled");
  page().querySelector("[data-nc-tq-save]").click();
  await flush(dom); await new Promise(r => setTimeout(r, 50)); await flush(dom);
  st.busy = false;
  assert(!toasts.some(t => /enregistr/i.test(t)) && st.tq && st.tq.dirty && !(st.view.plans || {})[friendlyId], "envoi impossible : ni confirmation ni perte des modifications");
  win.HM_NATIONAL_COACH.openOrders(friendlyId); await flush(dom);
  page().querySelector("[data-nc-tq-save]").click();
  await win.__lastNationalCoach; await flush(dom);
  assert(st.view.plans[friendlyId] && st.view.plans[friendlyId].defense === "Zone intérieure", "ordres enregistrés pour l'amical (m.plans[id])");
  assert(!(st.view.plans[qualif.id]) && st.view.tactics.defense !== "Zone intérieure", "autre match et tactique par défaut inchangés");
  assert(toasts.some(t => /Ordres enregistrés/.test(t)) && /Ordres validés/.test(doc.getElementById("ncTqStatus").textContent), "confirmation après sauvegarde réussie seulement");

  // Refus du serveur : pas de confirmation.
  toasts.length = 0;
  const realFetch = win.fetchApi;
  win.fetchApi = (path, opts) => /coach\/tactics/.test(path) ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ ok: false, error: "Refus de test." }) }) : realFetch(path, opts);
  seg("Homme à homme").click();
  page().querySelector("[data-nc-tq-save]").click();
  await win.__lastNationalCoach; await flush(dom);
  win.fetchApi = realFetch;
  assert(!toasts.some(t => /enregistr/i.test(t)) && st.error && st.tq && st.tq.dirty, "sauvegarde refusée : erreur affichée, aucune confirmation, modifications gardées");
  st.tq = null; st.error = "";

  // 3. « Modifier vos ordres » : partout, et rouvre les ordres enregistrés.
  await nav("dashboard");
  assert(/Modifier vos ordres/.test(topBtn().textContent), "barre du haut : « Modifier vos ordres »");
  const card = doc.querySelector(".nc-orders-card [data-nc-orders]");
  assert(card && /Modifier vos ordres/.test(card.textContent) && !card.classList.contains("topbar-cta"), "tableau de bord : carte des ordres (visible aussi sur téléphone)");
  await nav("calendrier");
  assert(/Modifier vos ordres/.test(calBtn(friendlyId).textContent) && /Donnez vos ordres/.test(calBtn(qualif.id).textContent), "calendrier : « Modifier » sur l'amical, « Donnez » sur la qualification");
  calBtn(friendlyId).click();
  await flush(dom);
  assert(seg("Zone intérieure").classList.contains("active"), "« Modifier vos ordres » : ordres enregistrés rechargés (pas de remise à zéro)");

  // 4. Quitter, actualiser (nouvelle vue du serveur), revenir.
  await nav("joueurs");
  await win.HM_NATIONAL_COACH.enterMode("fr-A"); await flush(dom);
  await nav("calendrier");
  calBtn(friendlyId).click(); await flush(dom);
  assert(seg("Zone intérieure").classList.contains("active") && /Ordres validés/.test(doc.getElementById("ncTqStatus").textContent), "après actualisation : ordres toujours enregistrés");
  // 5. Bon match : ordres rangés sous l'identifiant de l'amical (le match
  // joué les lit par NationalMatches.buildSide(…, matchId), testé dans
  // server/national_coach_test.js).
  assert(Object.keys(st.view.plans).join() === String(friendlyId) && st.view.upcoming.find(x => String(x.id) === String(friendlyId)).hasPlan, "ordres associés à l'amical seulement (hasPlan)");

  // 6. Cas limites.
  toasts.length = 0;
  const before = st.nav;
  assert(win.HM_NATIONAL_COACH.openOrders("match-joue-inconnu") === false && st.nav === before && toasts.some(t => /n'est plus à venir/.test(t)), "match qui n'est plus à venir : message, rien d'ouvert");
  // Match verrouillé (T − 5 min) : bouton actif, écran en lecture seule.
  const saved = up.map(x => x.lockAt);
  st.view.upcoming.forEach(x => { if (String(x.id) === String(qualif.id)) x.lockAt = Date.now() - 1000; });
  await nav("calendrier");
  assert(/Ordres verrouillés/.test(calBtn(qualif.id).textContent) && !calBtn(qualif.id).disabled, "calendrier : match verrouillé signalé");
  calBtn(qualif.id).click(); await flush(dom);
  assert(st.tqMatch === String(qualif.id) && page().querySelector(".ordres-lock-note") && page().querySelector("[data-nc-tq-save]").disabled, "match verrouillé : écran en lecture seule, Enregistrer désactivé");
  st.view.upcoming.forEach((x, i) => { x.lockAt = saved[i]; });
  // Match déjà commencé encore « à venir » (passage du monde en retard) :
  // le bouton du haut vise le match suivant au lieu de rester bloqué.
  const at0 = st.view.upcoming[0].at;
  st.view.upcoming[0].at = Date.now() - 60e3; st.view.upcoming[0].lockAt = Date.now() - 360e3;
  await nav("dashboard");
  assert(!topBtn().disabled && /ordres/.test(topBtn().textContent) && !/verrouillés/.test(topBtn().textContent), "match déjà commencé : la barre du haut passe au match suivant");
  topBtn().click(); await flush(dom);
  assert(st.tqMatch === String(st.view.upcoming[1].id), "… et l'ouvre");
  st.view.upcoming[0].at = at0; st.view.upcoming[0].lockAt = at0 - 300e3;
  // Aucun match à venir : tactique par défaut, avec un message.
  const keep = st.view.upcoming;
  st.view.upcoming = []; st.tq = null; toasts.length = 0;
  assert(win.HM_NATIONAL_COACH.openOrders(null) === true && st.nav === "tactique" && st.tqMatch === "default" && toasts.some(t => /tactique par défaut/.test(t)), "aucun match : tactique par défaut ouverte, message");
  await nav("dashboard");
  assert(!topBtn() && !doc.querySelector(".nc-orders-card"), "aucun match : ni bouton ni carte d'ordres");
  st.view.upcoming = keep;

  // 7. Reste du mode intact ; pages publiques sans bouton d'ordres.
  for (const n of ["joueurs", "convocations", "vestiaire", "calendrier", "qualifications", "amicaux", "dashboard"]) {
    const b = doc.querySelector(`#ncSidebar [data-nc-nav="${n}"]`);
    if (!b) continue;
    b.click(); await flush(dom);
    assert(st.nav === n && doc.getElementById("nationalContent").textContent.length > 20, `rubrique « ${n} » toujours accessible`);
  }
  const pub = win.HM_NATIONAL.sectionHtml(st.tv, "calendrier");
  win.HM_NATIONAL.state.coachOpen = null;
  const pubHtml = win.HM_NATIONAL.sectionHtml(st.tv, "calendrier");
  win.HM_NATIONAL.state.coachOpen = "fr-A";
  assert(/data-nc-orders/.test(pub) && !/data-nc-orders/.test(pubHtml), "page publique de la sélection : pas de bouton d'ordres");
  assert(!errors.length, "aucune erreur JavaScript" + (errors.length ? " : " + errors.join(" | ") : ""));
  dom.window.close(); server.close();
  console.log("\n🏁 national_orders_entry_ui_test.js : ordres de la sélection accessibles depuis le calendrier, la barre du haut et le tableau de bord.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
