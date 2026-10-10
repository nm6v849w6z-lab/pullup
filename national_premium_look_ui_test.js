// Personnalisation Premium complète d'une sélection, de bout en bout (vrai
// serveur de test, jeu complet) — mission 2026-10-10 :
//  1. club non Premium : section verrouillée (« Passer Premium »), l'API refuse ;
//  2. club Premium : maillot (coupe, couleur libre, motif, deux tons),
//     parquet (bois / couleur libre, raquette), logo importé, aperçus
//     (composants du club réutilisés), enregistrement ;
//  3. la personnalisation du CLUB ne change pas (navigateur et serveur) ;
//  4. persistance : rechargement de la page, nouvelle connexion ;
//  5. anti double-clic, erreur explicite ; retour au catalogue ;
//  6. téléphone : la fenêtre reste une feuille ancrée en bas (règle UI mobile).
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-natlook";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const NationalTeams = require("./server/nationalTeams.js");
const html = require("./test_game_html.js").readGameHtml();
const check = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const CLUB_KEYS = ["jerseyShape", "jerseyColor", "jerseyPattern", "jerseyTwoTone", "courtStyle", "customLogoDataUrl", "awayJerseyColor"];

(async () => {
  const multi = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-natlook-")), "multi-league.json");
  const { server, baseUrl } = await startTestServer(Date.now, undefined, multi);
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const root = baseUrl.replace(/\/?(\?.*)?$/, "/");
  const res = await fetch(root + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  check(res.ok, "nomination de test : sélectionneur de France A");
  let win = dom.window, doc = win.document;
  const post = (url, body) => win.eval(`fetchApi(${JSON.stringify(url)}, { method: "POST", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify(body))} }).then(r => r.json().then(d => ({ status: r.status, d })))`);
  const clubSnap = w => JSON.stringify(CLUB_KEYS.map(k => w.eval(`JSON.stringify(teamA[${JSON.stringify(k)}] === undefined ? null : teamA[${JSON.stringify(k)}])`)));
  // Club tel que sauvegardé par le serveur (fichier de la ligue relu).
  const myIdx = win.eval("myTeamIndex");
  const serverClub = async () => {
    const t = JSON.parse(fs.readFileSync(multi, "utf8")).league.teams[myIdx];
    if (!t || !t.isHuman) throw new Error("❌ club introuvable dans la sauvegarde du serveur");
    return JSON.stringify(CLUB_KEYS.map(k => (t[k] !== undefined ? t[k] : null)));
  };
  const clubBefore = clubSnap(win), serverBefore = await serverClub();

  // 1) Club non Premium : section verrouillée, API refusée.
  await post("/api/club/set-paying", { isPaying: false });
  win.eval("teamA.isPaying = false; teamA.premiumUntil = null;");
  await win.HM_NATIONAL.openTeam("fr-A");
  const content = () => doc.getElementById("nationalContent");
  content().querySelector("[data-nt-visuals]").click();
  let ov = doc.getElementById("ntVisualsOverlay");
  check(ov && ov.querySelector("#ntLook") && /Réservé aux clubs Premium/.test(ov.querySelector("#ntLook").textContent) && !ov.querySelector("[data-ntl-save]"), "club non Premium : section Premium verrouillée, sans bouton d'enregistrement");
  const refused = await post("/api/national/look", { teamId: "fr-A", look: { jerseyColor: "#123abc" } });
  check(refused.status === 403 && /Premium/.test(refused.d.error), "club non Premium : l'API refuse (403)");
  doc.querySelector("[data-ntv-cancel]").click();

  // 2) Club Premium : édition complète.
  const pay = await post("/api/club/set-paying", { isPaying: true });
  check(pay.d.ok, "club passé Premium (serveur)");
  win.eval("teamA.isPaying = true;");
  const clubPremiumBefore = clubSnap(win);
  await win.HM_NATIONAL.openTeam("fr-A");
  content().querySelector("[data-nt-visuals]").click();
  ov = doc.getElementById("ntVisualsOverlay");
  const sec = () => ov.querySelector("#ntLook");
  check(sec().querySelectorAll("[data-ntl-pattern]").length === win.eval("JERSEY_PATTERNS.length") && sec().querySelectorAll("[data-ntl-shape]").length === 2 && sec().querySelectorAll("[data-ntl-wood]").length === win.eval("Object.keys(COURT_WOODS).length"), "club Premium : tous les motifs, coupes et bois du club");
  check(sec().querySelector(".ntl-jersey svg") && sec().querySelector(".ntl-court svg") && sec().querySelector(".ntl-logo svg, .ntl-logo img.nat-flag"), "aperçus : maillot, parquet, logo de la sélection (drapeau par défaut)");
  check(!sec().querySelector(".ntl-court").innerHTML.includes(win.eval("teamA.name")), "aperçu du parquet : jamais le logo du club");
  sec().querySelector('[data-ntl-shape="B"]').click();
  sec().querySelector('[data-ntl-pattern="rayures"]').click();
  const setColor = (sel, v) => { const i = sec().querySelector(sel); i.value = v; i.dispatchEvent(new win.Event("change", { bubbles: true })); };
  setColor('[data-ntl-input="jerseyColor"]', "#123abc");
  setColor('[data-ntl-input="second"]', "#ffcc00");
  setColor('[data-ntl-input="courtWood"]', "#334455");
  setColor('[data-ntl-input="courtPaint"]', "#aa0000");
  setColor('[data-ntl-hex="jerseyColor"]', "#12");
  check(/Couleur invalide/.test(sec().querySelector("#ntlErr").textContent), "code couleur invalide : erreur explicite");
  setColor('[data-ntl-hex="jerseyColor"]', "#123abc");
  // Logo : image déjà redimensionnée (jsdom n'a pas de canvas).
  win.HM_NATIONAL.state.look.logoDataUrl = LOGO;
  sec().querySelector('[data-ntl-pattern="rayures"]').click();
  check(sec().querySelector('.ntl-logo img') && sec().querySelector(".ntl-court image"), "logo importé : aperçu et rond central du parquet");
  // Anti double-clic : un seul envoi.
  let sent = 0;
  const realFetch = win.fetchApi;
  win.fetchApi = (url, o) => { if (/national\/look/.test(url)) sent++; return realFetch(url, o); };
  sec().querySelector("[data-ntl-save]").click();
  sec().querySelector("[data-ntl-save]") && sec().querySelector("[data-ntl-save]").click();
  await win.__lastNational; await flush(dom);
  win.fetchApi = realFetch;
  check(sent === 1, "double-clic sur Enregistrer : un seul envoi");
  const st = await NationalTeams.loadStore(multi);
  const L = st.teams["fr-A"].look;
  check(L && L.jerseyShape === "B" && L.jerseyColor === "#123abc" && L.jerseyPattern === "rayures" && L.jerseyTwoTone === "#123abc/#ffcc00" && L.courtStyle.wood === "#334455" && L.courtStyle.paint === "#aa0000" && L.logoDataUrl === LOGO, "enregistré dans le stock national : maillot, parquet, logo");
  check(content().querySelector('.nt-logo[data-nt-logo="custom"] img') && content().querySelector(".nt-hero-jersey svg"), "page de la sélection : logo importé et maillot Premium");

  // 3) Club inchangé.
  check(clubSnap(win) === clubPremiumBefore, "personnalisation du club inchangée (navigateur)");
  check(await serverClub() === serverBefore, "personnalisation du club inchangée (serveur)");
  void clubBefore;

  // 4) Persistance : rechargement / nouvelle connexion.
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  win = dom.window; doc = win.document;
  await win.HM_NATIONAL.openTeam("fr-A");
  check(doc.querySelector('#nationalContent .nt-logo[data-nt-logo="custom"] img') && win.HM_NATIONAL.state.team.extras.look.jerseyPattern === "rayures", "après rechargement : personnalisation toujours là");
  doc.querySelector("#nationalContent [data-nt-visuals]").click();
  ov = doc.getElementById("ntVisualsOverlay");
  check(ov.querySelector('[data-ntl-pattern="rayures"].on') && ov.querySelector('[data-ntl-shape="B"].on') && ov.querySelector('[data-ntl-input="courtWood"]').value === "#334455", "fenêtre rouverte : brouillon = personnalisation enregistrée");

  // 5) Erreur serveur explicite, puis retour au catalogue.
  win.fetchApi = async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: "Enregistrement impossible, réessayez." }) });
  ov.querySelector("[data-ntl-save]").click();
  await win.__lastNational; await flush(dom);
  check(/Enregistrement impossible/.test(ov.querySelector("#ntlErr").textContent) && !ov.querySelector("[data-ntl-save]").disabled, "échec d'enregistrement : message affiché, bouton réactivé");
  win.fetchApi = realFetch.bind ? win.eval("fetchApi") : win.fetchApi;
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  win = dom.window; doc = win.document;
  await win.HM_NATIONAL.openTeam("fr-A");
  doc.querySelector("#nationalContent [data-nt-visuals]").click();
  ov = doc.getElementById("ntVisualsOverlay");
  ov.querySelector("[data-ntl-reset]").click();
  await win.__lastNational; await flush(dom);
  const st2 = await NationalTeams.loadStore(multi);
  check(st2.teams["fr-A"].look === null && !doc.querySelector('#nationalContent .nt-logo[data-nt-logo="custom"]'), "« Revenir au catalogue » : personnalisation Premium retirée");

  // 6) Règle UI mobile : fenêtre = .upgrade-confirm-overlay + boîte (feuille ancrée en bas).
  check(ov.classList.contains("upgrade-confirm-overlay") && ov.querySelector(".upgrade-confirm-box.ntv-box"), "fenêtre de personnalisation : composant bottom sheet du jeu");
  dom.window.close();
  server.close();
  console.log("\n🏁 national_premium_look_ui_test.js : personnalisation Premium des sélections de bout en bout.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
