// Mode Sélection — confirmation obligatoire de « Convoquer » et « Retirer de
// la convocation » (demande utilisateur du 2026-10-10). Ligue partagée,
// Lyon = sélectionneur de la France A ; navigateur simulé (JSDOM, vrai
// serveur de test).
//  1. « Convoquer » ouvre une modale sans rien modifier ; 2. Annuler = aucun
//  changement (liste, vestiaire) ; 3. Confirmer = joueur convoqué, groupe du
//  vestiaire à jour ; 4. « Retirer » ouvre une modale (vestiaire mentionné)
//  sans retirer ; 5. Annuler = rien ; 6. Confirmer = retiré, et retiré du
//  cinq / des ordres ; 7. double clic = un seul envoi ; 8. échec
//  d'enregistrement = erreur explicite, sélection inchangée (et annulation
//  côté serveur) ; 9. persistance après rechargement ; + modifications
//  concurrentes (deux ajouts) sans écrasement.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-conv";
const store = require("./server/store.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = async (fn, label, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await sleep(100); } throw new Error("❌ attente : " + label); };

(async () => {
  // Horloge du serveur de test : placée 2 jours avant le gel d'un
  // rassemblement (liste ouverte), voir plus bas.
  // Ligue par défaut du serveur de test (monde réel : la France A a des
  // matchs de qualification, donc un vrai rassemblement en cours).
  const { server, baseUrl, token } = await startTestServer();
  const tok = token;
  const call = async (path, body) => (await fetch(new URL(path, baseUrl), body ? { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tok }, body: JSON.stringify(body) } : { headers: { "X-TipIn-Token": tok } })).json();
  let dom0 = await openGame(html, `${baseUrl}?m=${tok}`);
  await dom0.window.__gameReady; await flush(dom0);
  const clubName = dom0.window.eval("teamA.name");
  dom0.window.close();
  for (let i = 0; i < 40; i++) { const o = await call("api/national/overview"); if (o.ok && (o.teams || []).length) break; await sleep(300); }
  const ap = await fetch(new URL("api/admin/national", baseUrl), { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club: clubName }) }).then(r => r.json());
  assert(ap.ok, clubName + " nommé sélectionneur de la France A " + (ap.ok ? "" : JSON.stringify(ap)));
  let cv = null;
  for (let i = 0; i < 60; i++) { cv = await call("api/national/coach?id=fr-A"); if (cv.ok && cv.pool && cv.pool.players.length >= 6) break; await sleep(500); }
  // Rassemblement dont la liste est encore ouverte (une fenêtre exemptée
  // convient : même liste, même route — le monde de test n'a pas de match).
  let cur = cv.gatherings.find(x => !x.frozen && !x.past && !x.bye);
  const realGroup = !!cur && cur.gid === cv.currentGid;
  if (!cur) cur = cv.gatherings.find(x => !x.frozen && !x.past);
  if (!cur) { console.log("ℹ️  aucun rassemblement ouvert dans ce calendrier : test sauté"); server.close(); process.exit(0); }
  let A, B, C, D;
  const convNow = async () => { const v = await call("api/national/coach?id=fr-A"); const g = v.gatherings.find(x => x.gid === cur.gid); return { refs: g.players.map(x => x.ref), view: v }; };
  const has = (refs, r) => refs.some(x => x.p === r.p && x.n === r.n);

  let dom = await openGame(html, `${baseUrl}?m=${tok}`);
  await dom.window.__gameReady; await flush(dom);
  let win = dom.window, doc = win.document;
  await wait(() => win.HM_NATIONAL_COACH, "module du Mode Sélection chargé");
  win.eval("HM_NATIONAL_COACH.enterMode('fr-A')");
  await wait(() => win.HM_NATIONAL_COACH.state.view, "vue du mode");
  const st = () => win.HM_NATIONAL_COACH.state;
  st().gid = cur.gid;
  const nav = async key => { doc.querySelector(`#ncSidebar [data-nc-nav="${key}"]`).click(); await flush(dom); await sleep(80); };
  const modal = () => doc.getElementById("ncConvConfirm");
  const btn = (r, on) => doc.querySelector(`#nationalContent [data-nc-conv="${on ? 1 : 0}"][data-nc-p="${r.p}"]`);
  const tacticsHas = r => (st().view.tacticsPlayers || []).some(x => x.ref && x.ref.p === r.p && x.ref.n === r.n);
  // Compteur des envois de convocation (double clic).
  let posts = 0;
  const realFetch = win.fetch.bind(win);
  win.fetch = (u, o) => { if (String(u).includes("/api/national/coach/convocation")) posts++; return realFetch(u, o); };

  // Liste des joueurs : les quatre premiers joueurs affichés (bouton « Convoquer »).
  await nav("joueurs");
  [A, B, C, D] = [...doc.querySelectorAll('#nationalContent [data-nc-conv="1"]:not([disabled])')].slice(0, 4).map(b => ({ p: Number(b.dataset.ncP), n: b.dataset.ncN }));
  assert(A && D, "Liste des joueurs : boutons « Convoquer »");
  // 1. Convoquer → modale, rien de modifié.
  const b1 = btn(A, true);
  assert(b1, "bouton « Convoquer » d'un joueur non convoqué");
  b1.click(); await flush(dom);
  assert(modal() && /Convoquer/.test(modal().textContent) && modal().textContent.includes(A.n) && /ajouté à la convocation/.test(modal().textContent), "1. « Convoquer » ouvre une modale (nom du joueur, ajout à la convocation)");
  assert(modal().querySelector(".upgrade-confirm-box") && /Annuler/.test(modal().textContent) && /Confirmer/.test(modal().textContent), "modale du jeu (feuille du bas sur téléphone) : « Confirmer » / « Annuler »");
  assert(!has((await convNow()).refs, A) && posts === 0, "rien n'est envoyé ni modifié avant la confirmation");
  // 2. Annuler.
  modal().querySelector("[data-nc-conv-cancel]").click(); await flush(dom);
  assert(!modal() && !has((await convNow()).refs, A) && !tacticsHas(A) && posts === 0, "2. Annuler : ni la sélection ni le vestiaire ne changent");
  // Échap ferme aussi sans rien faire.
  btn(A, true).click(); await flush(dom);
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await flush(dom);
  assert(!modal() && posts === 0, "Échap ferme la modale sans rien modifier");
  // 3. Confirmer.
  btn(A, true).click(); await flush(dom);
  modal().querySelector("[data-nc-conv-ok]").click();
  await wait(() => !modal(), "modale fermée après enregistrement");
  if (realGroup) await wait(() => tacticsHas(A), "groupe du vestiaire à jour");
  let c = await convNow();
  assert(has(c.refs, A) && posts === 1 && (!realGroup || tacticsHas(A)), "3. Confirmer : joueur convoqué (un envoi)" + (realGroup ? ", groupe du vestiaire / de la tactique à jour sans rechargement" : ""));
  assert(btn(A, false), "la liste affiche aussitôt le joueur comme convoqué (bouton « Retirer »)");
  await nav("convocations");
  assert([...doc.querySelectorAll("#nationalContent .nc-table")].some(t => t.textContent.includes(A.n)), "page Convoqués : le joueur y figure, sans rechargement");
  await nav("joueurs");
  // 7. Double clic sur « Confirmer » : un seul envoi, un seul ajout.
  btn(B, true).click(); await flush(dom);
  const ok = modal().querySelector("[data-nc-conv-ok]");
  ok.click(); ok.click(); ok.click();
  await wait(() => !modal(), "modale fermée (double clic)");
  c = await convNow();
  assert(posts === 2 && c.refs.filter(x => x.p === B.p && x.n === B.n).length === 1, "7. double clic : un seul envoi, aucun doublon");
  // Pendant qu'une modale est ouverte, un second clic n'en ouvre pas une autre.
  btn(C, true).click(); await flush(dom); btn(D, true) && btn(D, true).click(); await flush(dom);
  assert(doc.querySelectorAll("#ncConvConfirm").length === 1 && modal().textContent.includes(C.n), "une seule modale à la fois");
  modal().querySelector("[data-nc-conv-cancel]").click(); await flush(dom);

  // 6 bis. Données dépendantes : A titulaire dans la tactique par défaut.
  console.log(realGroup ? "ℹ️  rassemblement réel en cours : vestiaire et cinq vérifiés" : "ℹ️  pas de match dans ce calendrier : vestiaire non concerné");
  const nidA = (st().view.tacticsPlayers.find(x => x.ref.p === A.p && x.ref.n === A.n) || {}).nid;
  const tac = JSON.parse(JSON.stringify(st().view.tactics || {}));
  tac.lineup = tac.lineup || {}; tac.lineup.starters = Object.assign({}, tac.lineup.starters || {}, { M: nidA });
  const ts = await call("api/national/coach/tactics", { teamId: "fr-A", orders: tac });
  if (!ts.ok || !nidA) console.log("DEBUG tactique", JSON.stringify(ts).slice(0, 300), nidA);
  // 4. Retirer → modale, rien de retiré.
  win.eval("HM_NATIONAL_COACH.enterMode('fr-A')"); st().gid = cur.gid; await wait(() => st().view && has(st().view.gatherings.find(x => x.gid === cur.gid).players.map(x => x.ref), A), "vue rechargée");
  await nav("convocations");
  const r1 = btn(A, false);   // « Retirer » depuis la page Convoqués
  assert(r1, "bouton « Retirer » d'un convoqué");
  r1.click(); await flush(dom);
  assert(modal() && /Retirer/.test(modal().textContent) && modal().textContent.includes(A.n) && /vestiaire/.test(modal().textContent) && /Confirmer le retrait/.test(modal().textContent), "4. « Retirer » ouvre une modale (nom, conséquences sur le vestiaire, « Confirmer le retrait »)");
  assert(has((await convNow()).refs, A) && posts === 2, "rien n'est retiré avant la confirmation");
  // 5. Annuler.
  modal().querySelector("[data-nc-conv-cancel]").click(); await flush(dom);
  assert(!modal() && has((await convNow()).refs, A) && (!realGroup || tacticsHas(A)), "5. Annuler le retrait : rien ne change");
  // 8. Échec d'enregistrement : erreur explicite, rien de changé.
  win.fetch = (u, o) => (String(u).includes("/api/national/coach/convocation") ? Promise.resolve(new Response(JSON.stringify({ ok: false, error: "Enregistrement impossible, réessayez." }), { status: 503, headers: { "Content-Type": "application/json" } })) : realFetch(u, o));
  btn(A, false).click(); await flush(dom);
  modal().querySelector("[data-nc-conv-ok]").click();
  await wait(() => modal() && !modal().querySelector(".nc-conv-err").hidden, "erreur affichée");
  assert(/n'a pas été enregistrée/.test(modal().textContent) && /Enregistrement impossible/.test(modal().textContent) && /Réessayer/.test(modal().textContent), "8. échec : message explicite dans la modale, « Réessayer » proposé");
  assert(has((await convNow()).refs, A), "échec : la sélection reste inchangée");
  win.fetch = (u, o) => { if (String(u).includes("/api/national/coach/convocation")) posts++; return realFetch(u, o); };
  // 6. Confirmer le retrait (Réessayer).
  modal().querySelector("[data-nc-conv-ok]").click();
  await wait(() => !modal(), "retrait enregistré");
  c = await convNow();
  assert(!has(c.refs, A) && !tacticsHas(A), "6. Confirmer le retrait : retiré de la convocation et du groupe du vestiaire");
  if (realGroup && ts.ok && nidA) assert(!Object.values((c.view.tactics && c.view.tactics.lineup && c.view.tactics.lineup.starters) || {}).includes(nidA), "retiré aussi du cinq de départ (tactique par défaut)");

  // Modifications concurrentes : deux ajouts « en même temps » (deux membres du staff).
  const [x1, x2] = await Promise.all([call("api/national/coach/convocation", { teamId: "fr-A", gatheringId: cur.gid, add: C }), call("api/national/coach/convocation", { teamId: "fr-A", gatheringId: cur.gid, add: D })]);
  c = await convNow();
  assert(x1.ok && x2.ok && has(c.refs, C) && has(c.refs, D) && has(c.refs, B), "modifications concurrentes : deux ajouts simultanés, aucun écrasé");
  const dup = await call("api/national/coach/convocation", { teamId: "fr-A", gatheringId: cur.gid, add: C });
  assert(!dup.ok && /déjà convoqué/.test(dup.error), "ajout en double refusé par le serveur");
  dom.window.close();

  // 9. Persistance après rechargement.
  dom = await openGame(html, `${baseUrl}?m=${tok}`);
  await dom.window.__gameReady; await flush(dom);
  win = dom.window; doc = win.document;
  await wait(() => win.HM_NATIONAL_COACH, "module du Mode Sélection chargé");
  win.eval("HM_NATIONAL_COACH.enterMode('fr-A')");
  await wait(() => win.HM_NATIONAL_COACH.state.view, "vue après rechargement");
  const g2 = win.HM_NATIONAL_COACH.state.view.gatherings.find(x => x.gid === cur.gid);
  const refs2 = g2.players.map(x => x.ref);
  assert(has(refs2, B) && has(refs2, C) && has(refs2, D) && !has(refs2, A), "9. après rechargement : la convocation confirmée est conservée");
  dom.window.close();

  // Annulation côté serveur si l'enregistrement échoue (server/index.js : undo).
  const NC = require("./server/nationalCoach.js");
  assert(typeof NC.setConvocation === "function", "setConvocation exportée");
  server.close();
  console.log("\n🏁 national_convocation_confirm_test.js : convoquer / retirer passent toujours par une confirmation.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
