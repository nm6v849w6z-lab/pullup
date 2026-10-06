// Profil du manager + pseudo (2026-09-30) — côté navigateur. Voir
// renderManagerProfile/showManagerProfile/managerLinkHtml dans
// moteurbasket3.html et server/manager_pseudo_test.js (côté serveur).
// Vérifie : l'avatar en haut à droite ouvre son propre profil (pseudo,
// club, pays, bilan, succès, saisons, interviews) ; le nom du manager sur
// la fiche d'un autre club ouvre SON profil (lecture seule), « ← Retour »
// ramène à la fiche ; l'Histoire du club n'a plus les succès (ni de colonne
// vide) ; le pseudo apparaît dans le chat de la ligue (clic → profil), la
// messagerie et les interviews relues, mais PAS dans le classement ; un
// club IA n'a pas de manager ; Paramètres › Mon compte permet de choisir
// son pseudo.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const http = require("http");
const os = require("os");
const path = require("path");
const { createHandler } = require("./server/index.js");
const Accounts = require("./server/accounts.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 200) {
  for (let i = 0; i < tries; i++) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; await sleep(50); }
  throw new Error("❌ délai dépassé : " + label);
}

(async () => {
  const now = Date.now();
  const league = Engine.generateMultiManagerLeague(["Gotham PF", "Rennes PF"], 2, now, Calendar.dailyAnchoredCalendarConfig());
  const [iA, iB] = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  for (let r = 0; r < 2; r++) league.matchesForRound(r).forEach((m, k) => league.recordResult(r, m.home, m.away, 84 + k, 76));
  league.round = 2;
  const A = league.teams[iA], B = league.teams[iB];
  A.managerPseudo = "aszat"; A.managerPseudoChangedAt = 0;
  B.managerPseudo = "Coach_Riri"; B.managerPseudoChangedAt = 0;
  A.seasonHistory = [{ seasonNo: 1, divisionLevel: 3, divisionName: "Division III", rank: 1, teams: 10, wins: 14, losses: 4, playoffResult: "Champion", champion: true, cupResult: "Demi-finale" }];
  A.trophies = [{ at: now - 1e9, type: "championship", label: "Champion (Division III)" }];
  A.achStats = { migrated: true, titles: 1 };
  A.achTiers = { CHAMPION: 1 };
  A.moraleHistory = [{ week: 2, label: "Interview", delta: 1, milestone: "debut-saison", quote: "Théophile Cosset doit mieux jouer." }];
  B.moraleHistory = [{ week: 2, label: "Interview", delta: 1, milestone: "debut-saison", quote: "On n'a peur de personne." }];
  const cpu = league.teams.findIndex(t => !t.isHuman);

  const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
  await store.saveMultiLeague(league, multiSavePath);
  const tA = A.managerLinkToken, tB = B.managerLinkToken;
  const post = (tok, p, body) => fetch(baseUrl + p, { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tok }, body: JSON.stringify(body) }).then(r => r.json());
  await post(tB, "api/league-chat/send", { text: "Bonne saison à tous" });
  await post(tB, "api/messages/send", { to: String(iA), text: "Salut !" });

  let dom;
  try {
    dom = await openGame(html, `${baseUrl}?m=${tA}`);
    const win = dom.window, doc = win.document;
    if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
    const visible = () => win.eval("currentVisiblePageId()");

    // --- Tableau de bord : bannière « nouveau message » au nom du pseudo.
    win.eval("TAB_HANDLERS.club()");
    await win.eval("msgRefreshSummary()");
    const dash = await waitFor(() => doc.querySelector("#clubMessagesBanner .msg-dash-banner"), "bannière messages");
    check(/1 nouveau message de\s*Coach_Riri/.test(dash.textContent) && dash.querySelector(".msg-dash-club").textContent === "Rennes PF", "tableau de bord : « 1 nouveau message de Coach_Riri » (club en petit)");
    // Invitation discrète à choisir un pseudo (manager sans pseudo).
    check(!doc.querySelector("#clubPseudoPrompt .pseudo-prompt"), "pseudo déjà choisi : pas d'invitation");
    win.eval("teamA.managerPseudo = null; renderPseudoPrompt()");
    const prompt = doc.querySelector("#clubPseudoPrompt .pseudo-prompt");
    check(prompt && /Choisis ton pseudo/.test(prompt.textContent) && /Manager de Gotham PF/.test(prompt.textContent), "sans pseudo : invitation « Choisis ton pseudo » sur le tableau de bord");
    prompt.querySelector("[data-pseudo-later]").click();
    check(!doc.querySelector("#clubPseudoPrompt .pseudo-prompt"), "« Plus tard » : invitation masquée (jeu jamais bloqué)");
    win.eval("teamA.managerPseudo = 'aszat'; pseudoPromptDismissed = false; renderPseudoPrompt()");
    // Repli structuré : « Manager de <club> » composé côté navigateur.
    check(win.eval("managerLabelHtml(null, 'Rennes PF')") === "<span>Manager de Rennes PF</span>" && /data-no-i18n/.test(win.eval("managerLabelHtml('Coach_Riri', 'Rennes PF')")), "libellé de repli traduisible, pseudo jamais traduit");

    // --- Avatar en haut à droite → son propre profil.
    const avatar = doc.getElementById("topbarManagerBtn");
    check(avatar && !avatar.classList.contains("hidden") && !!avatar.querySelector(".topbar-club-logo svg, .topbar-club-logo img") && /Mon profil de manager/.test(avatar.getAttribute("aria-label")), "logo du club en haut à droite (ouvre le profil du manager)");
    check(!doc.querySelector(".sidebar [data-tab='profil'], .sidebar #managerProfileSection"), "pas d'entrée « Profil » dans la barre latérale");
    win.eval("TAB_HANDLERS.club()");
    avatar.click();
    check(visible() === "managerProfileSection", "clic sur l'avatar : page Profil du manager");
    const page = doc.getElementById("managerProfileContent");
    check(page.querySelector(".mp-name").textContent === "aszat", "profil : pseudo");
    check(/Gotham PF/.test(page.textContent) && /France/.test(page.textContent), "profil : club et pays");
    check(/Mon profil de manager/.test(page.textContent) && page.querySelector("[data-mp-edit-pseudo]"), "son propre profil : lien pour modifier le pseudo");
    const kpis = page.querySelector(".mp-kpis").textContent;
    const cur = league.standings().find(r => r.idx === iA);
    check(kpis.includes(`${14 + cur.wins} V – ${4 + cur.losses} D`) && /Titres\s*1/.test(kpis) && /Montées\s*1/.test(kpis), "bilan : victoires/défaites en carrière, titres, montées");
    check(page.querySelectorAll("#mpAchievements .ach-card").length === 25 && page.querySelectorAll("#mpAchievements .ach-card.is-on").length === 1, "succès du manager (25 succès, 1 débloqué)");
    check(page.querySelectorAll(".mp-table tbody tr").length === 2, "saison par saison : en cours + archivée");
    check(/aszat\s*a déclaré/.test(page.querySelector(".mp-quotes").textContent) && /Théophile Cosset/.test(page.textContent), "interviews relues attribuées au pseudo");
    check(!/@|antony/i.test(page.textContent), "aucun email");
    doc.getElementById("closeManagerProfileBtn").click();
    check(visible() === "clubSection", "« ← Retour » : page d'origine");

    // --- Fiche d'un autre club : « Manager : Coach_Riri » → son profil.
    win.eval(`showTeamDetail(${iB})`);
    const head = doc.getElementById("teamDetailName");
    const link = head.querySelector("[data-manager-profile]");
    check(link && link.textContent === "Coach_Riri" && /Manager :/.test(head.textContent), "fiche d'équipe : « Manager : Coach_Riri » dans l'en-tête");
    check(/Coach_Riri\s*a déclaré/.test(doc.querySelector(".apercu-foot").textContent), "fiche d'équipe : dernière interview attribuée au pseudo");
    check(!!doc.getElementById("managerProfileCard"), "fiche d'équipe : carte compacte du manager");
    link.click();
    check(visible() === "managerProfileSection" && page.querySelector(".mp-name").textContent === "Coach_Riri", "clic sur le nom : profil de l'autre manager");
    check(/Profil du manager/.test(page.textContent) && !page.querySelector("[data-mp-edit-pseudo]"), "profil d'un autre : lecture seule");
    doc.getElementById("closeManagerProfileBtn").click();
    check(visible() === "teamDetailSection", "« ← Retour » : retour à la fiche d'équipe");
    win.eval(`showTeamDetail(${cpu})`);
    check(!doc.getElementById("teamDetailName").querySelector("[data-manager-profile]") && !doc.getElementById("managerProfileCard"), "club IA : aucun nom de manager");

    // --- Histoire du club : plus de succès, plus de colonne à part.
    win.eval("histoireView = 'palmares'; TAB_HANDLERS.histoire()");
    const hc = doc.getElementById("histoireContent");
    check(!doc.getElementById("hcAchievements") && !/Succès du manager/.test(hc.textContent), "Histoire du club : succès du manager retirés");
    check(!hc.querySelector(".hc-col") && hc.querySelector(".hc-grid > .hc-wide#hcPalmares") && hc.querySelectorAll(".hc-grid > section").length === 3, "Histoire du club : Palmarès pleine largeur, Records et Hall of Fame côte à côte");

    // --- Classement : jamais de pseudo.
    win.eval("TAB_HANDLERS.ligue()");
    await waitFor(() => doc.querySelector("#standingsContent table, #standingsContent .lg-table"), "classement");
    check(!/aszat|Coach_Riri/.test(doc.getElementById("standingsContent").textContent), "classement : aucun pseudo de manager");

    // --- Chat de la ligue : auteur = pseudo, clic → profil.
    await win.__lastLeagueChatCount;
    doc.getElementById("lgcOpenBtn").click();
    await win.__lastLeagueChat;
    const author = await waitFor(() => doc.querySelector("#leagueChat .lgc-msg .lgc-author"), "message du chat");
    check(author.textContent === "Coach_Riri", "chat : auteur affiché par son pseudo");
    author.click();
    check(visible() === "managerProfileSection" && page.querySelector(".mp-name").textContent === "Coach_Riri" && doc.getElementById("leagueChatDrawer").hidden, "chat : clic sur l'auteur → profil (chat refermé)");

    // --- Messagerie : expéditeur = pseudo.
    await win.eval(`goToMessages("${iB}")`);
    const conv = await waitFor(() => doc.querySelector(".msg-conv .msg-conv-name"), "conversation");
    check(conv.textContent.includes("Coach_Riri"), "messagerie : conversation au nom du pseudo");
    const who = await waitFor(() => doc.querySelector("#msgThreadHead [data-manager-profile]"), "en-tête du fil");
    check(who.textContent === "Coach_Riri" && /Rennes PF/.test(doc.getElementById("msgThreadHead").textContent), "messagerie : pseudo de l'expéditeur (+ club)");

    // --- Paramètres › Mon compte : choisir son pseudo.
    win.eval(`showSettingsModal("account")`);
    const input = await waitFor(() => doc.getElementById("hmPseudoInput"), "champ pseudo");
    check(input.value === "aszat", "Paramètres : champ « Pseudo de manager » prérempli");
    input.value = "x";
    doc.getElementById("hmPseudoForm").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    check(/entre 3 et 20/.test(doc.getElementById("hmPseudoFeedback").textContent), "pseudo trop court refusé côté navigateur");
    input.value = "Coach_riri";
    doc.getElementById("hmPseudoForm").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => /déjà pris/.test(doc.getElementById("hmPseudoFeedback").textContent), "pseudo pris");
    check(true, "pseudo déjà pris : message du serveur");
    input.value = "Batman_42";
    doc.getElementById("hmPseudoForm").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => /Pseudo enregistré/.test((doc.getElementById("hmPseudoFeedback") || {}).textContent || ""), "enregistré");
    check(win.eval("teamA.managerPseudo") === "Batman_42" && /Batman_42/.test(doc.getElementById("topbarManagerBtn").getAttribute("aria-label")), "pseudo enregistré : bouton du haut mis à jour");
    const saved = await store.loadMultiLeague(multiSavePath);
    check(saved.league.teams[iA].managerPseudo === "Batman_42", "pseudo sauvegardé côté serveur");

    // --- Langue du COMPTE : appliquée au chargement sur un autre appareil ;
    // un compte sans langue adopte celle du navigateur.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profil-lang-"));
    const accountsPath = path.join(dir, "accounts.json");
    const accData = { version: Accounts.ACCOUNTS_VERSION, accounts: [] };
    Accounts.createAccount(accData, { managerToken: tA, lang: "en" }, now);
    Accounts.createAccount(accData, { managerToken: tB }, now);
    await Accounts.saveAccounts(accData, accountsPath);
    const srv2 = http.createServer(createHandler(path.join(dir, "solo.json"), Date.now, multiSavePath, accountsPath));
    await new Promise(r => srv2.listen(0, "127.0.0.1", r));
    const base2 = `http://127.0.0.1:${srv2.address().port}/`;
    try {
      let asked = null;
      const d2 = await openGame(html, `${base2}?m=${tA}`);
      d2.window.hmI18n = d2.window.hmI18n || { getLang: () => "fr" }; // script de langue parfois pas chargé sous charge
      d2.window.hmI18n.setLang = l => { asked = l; };
      await d2.window.eval("hmSyncAccountLang()");
      check(asked === "en", "langue du compte (en) appliquée au chargement, quel que soit le navigateur");
      d2.window.close();
      const d3 = await openGame(html, `${base2}?m=${tB}`);
      await d3.window.__lastLangSync;
      const back = await Accounts.loadAccounts(accountsPath);
      check(Accounts.findByManagerToken(back, tB).lang === "fr", "compte sans langue : adopte celle du navigateur (fr)");
      // Paramètres › Langue : enregistrée dans le compte avant le rechargement.
      d3.window.hmI18n = d3.window.hmI18n || { getLang: () => "fr" };
      d3.window.hmI18n.setLang = () => {};
      d3.window.eval(`showSettingsModal("display")`);
      d3.window.document.querySelector('[data-lang-choice="it"]').click();
      await d3.window.__lastLangSave;
      check(Accounts.findByManagerToken(await Accounts.loadAccounts(accountsPath), tB).lang === "it", "Paramètres › Langue : enregistrée dans le compte");
      d3.window.close();
    } finally { srv2.close(); }
    console.log("\n🏁 Profil du manager et pseudo : conformes.");
  } finally { if (dom) dom.window.close(); server.close(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
