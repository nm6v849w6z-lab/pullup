// Centre médical du mode Sélection (2026-10-09) : état physique des
// convoqués, présélectionnés et du vivier, à partir des données existantes
// (condition, injuryUntil / injuryType) ; disponibilité pour le prochain
// match ; onglets ; droits (personne aidante oui, recruteur non) ;
// actualisation automatique (rechargement de la vue chaque minute).
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-med";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };
(async () => {
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const res = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  ok(res.ok, "nomination de test");
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  await win.HM_NATIONAL_COACH.enterMode("fr-A");
  await wait(() => win.HM_NATIONAL_COACH.state.view && doc.getElementById("ncSidebar"), "mode Sélection");
  const st = win.HM_NATIONAL_COACH.state;
  ok(/Centre médical/.test(doc.getElementById("ncSidebar").textContent), "menu : « Centre médical » dans la rubrique Sélection");
  // Convocation de 6 joueurs du vivier (vraie route).
  const pool = st.view.pool.players;
  const cur = st.view.gatherings.find(g => String(g.gid) === String(st.view.currentGid));
  if (cur && !cur.frozen) {
    const r = await win.fetch("/api/national/coach/convocation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: "fr-A", gatheringId: cur.gid, players: pool.slice(0, 6).map(x => ({ p: x.p, n: x.n })) }) });
    ok(r.ok, "convocation de 6 joueurs");
    await win.HM_NATIONAL_COACH.enterMode("fr-A");
    await wait(() => win.HM_NATIONAL_COACH.state.view, "vue rechargée");
  }
  doc.querySelector('#ncSidebar [data-nc-nav="medical"]').click();
  await wait(() => doc.querySelector("#nationalContent .nc-med"), "centre médical affiché (module chargé à la demande)");
  const v = win.HM_NATIONAL_COACH.state.view;
  const conv = v.gatherings.find(g => String(g.gid) === String(v.currentGid)).players.length;
  const rows = () => [...doc.querySelectorAll("#nationalContent [data-nc-med-row]")];
  ok(rows().length === conv && /Convoqués aptes/.test(doc.getElementById("nationalContent").textContent), `onglet Convoqués : ${conv} joueurs, bandeau des aptes`);
  // Données du serveur : fatigue réelle affichée (pas de valeur inventée).
  const p0 = v.pool.players.find(x => rows()[0].dataset.ncMedRow === x.p + "|" + x.n);
  ok(p0 && (p0.condition == null || rows()[0].textContent.includes(Math.round(p0.condition) + " %")), "fatigue = condition envoyée par le serveur");
  // Blessure (donnée du jeu : injuryUntil / injuryType) au-delà du prochain match.
  const next = (v.upcoming || [])[0];
  const target = v.pool.players.find(x => rows()[0].dataset.ncMedRow === x.p + "|" + x.n);
  target.injuryUntil = (next ? next.at : Date.now()) + 3 * 864e5; target.injuryType = "Entorse de la cheville";
  doc.querySelector('[data-nc-med-tab="injured"]').click();
  await wait(() => doc.querySelector('[data-nc-med-tab="injured"].active'), "onglet Blessés");
  const hurtRow = doc.querySelector(`[data-nc-med-row="${target.p}|${target.n}"]`);
  ok(hurtRow && /Entorse de la cheville/.test(hurtRow.textContent) && /retour/.test(hurtRow.textContent), "blessé : type de blessure, jours restants, date de retour");
  ok(hurtRow.querySelector('[data-nc-med-av="out"]') && /Forfait pour le match|Indisponible/.test(hurtRow.textContent), "retour après le prochain match : forfait signalé");
  target.injuryUntil = (next ? next.at : Date.now() + 864e5) - 3600e3;
  doc.querySelector('[data-nc-med-tab="injured"]').click();
  await wait(() => doc.querySelector(`[data-nc-med-row="${target.p}|${target.n}"] [data-nc-med-av]`), "rendu");
  if (next) ok(doc.querySelector(`[data-nc-med-row="${target.p}|${target.n}"] [data-nc-med-av="back"]`), "retour avant le match : « De retour pour le match »");
  doc.querySelector('[data-nc-med-tab="pool"]').click();
  await wait(() => doc.querySelector('[data-nc-med-tab="pool"].active'), "onglet vivier");
  ok(rows().length === v.pool.players.length, `tout le vivier : ${rows().length} joueurs`);
  ok(rows()[0].classList.contains("is-injured"), "blessés en tête de liste, facilement identifiables");
  // Fiche joueur depuis la liste.
  ok(rows()[0].querySelector("[data-nc-profile]"), "lien vers la fiche du joueur");
  // Droits : personne aidante (consultation) oui, recruteur non.
  const { PERMS } = require("./server/nationalCoach.js");
  const asRole = role => { st.view.perms = PERMS[role]; st.view.role = role; st.view.roles = [role]; st.nav = "dashboard"; doc.querySelector("#ncSidebar [data-nc-nav]").click(); return doc.getElementById("ncSidebar").textContent; };
  ok(/Centre médical/.test(asRole("helper")), "personne aidante : centre médical en consultation");
  ok(!/Centre médical/.test(asRole("recruiter")), "recruteur (DTN) : pas de centre médical");
  asRole("coach");
  dom.window.close(); server.close();
  console.log("\n🏁 national_medical_test.js : centre médical de la sélection.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
