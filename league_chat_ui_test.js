// Chat de la ligue — côté navigateur (voir lgcOpen/lgcRender dans
// moteurbasket3.html et server/leagueChat.js). Ligue partagée à 2 clubs
// humains : pastille de non-lus sur le bouton « Chat de la ligue » (en haut
// à droite de la page Ligue, plus de panneau dans la page) ET, depuis le
// 2026-10-04, sur l'entrée « Ligue » du menu (compteur relu depuis toutes
// les pages) ; le chat s'ouvre par-dessus la page (tiroir),
// messages automatiques, envoi (texte échappé), réactions, fermeture par
// ✕ / Échap / fond, focus rendu ; les pastilles retombent à 0 à
// l'ouverture et remontent à 1 quand l'autre manager écrit. Seul manager
// de sa ligue : lecture seule.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) {
  for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error("❌ délai dépassé : " + label);
}
function goLigue(doc) { [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click(); }
function drawerOpen(doc) { const d = doc.getElementById("leagueChatDrawer"); return !!d && !d.hidden; }
function badge(doc, id) { const b = doc.getElementById(id); return b && !b.hidden && !b.classList.contains("hidden") ? b.textContent : ""; }
function esc(win, doc) { doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }

(async () => {
  const doms = [];
  const servers = [];
  try {
    // ------------------------------------------------------------------
    // 1) Ligue à deux managers, deux journées jouées, un transfert conclu,
    //    Bravo a écrit un message. Le chat n'affiche QUE ce message
    //    (2026-10-05 : plus de résultats, transferts ni classement).
    // ------------------------------------------------------------------
    const now = Date.now();
    const names = ["Alpha CHAT", "Bravo CHAT"];
    const league = Engine.generateMultiManagerLeague(names, names.length, now, Calendar.dailyAnchoredCalendarConfig());
    const [iA, iB] = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
    for (let r = 0; r < 2; r++) league.matchesForRound(r).forEach((m, k) => league.recordResult(r, m.home, m.away, 80 + k, 70 + k));
    league.round = 2;
    const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
    servers.push(server);
    await store.saveMultiLeague(league, multiSavePath);
    const tA = league.teams[iA].managerLinkToken, tB = league.teams[iB].managerLinkToken;
    const pre = await fetch(new URL("/api/league-chat/send", baseUrl), { method: "POST", headers: { "Content-Type": "application/json", "X-TipIn-Token": tB }, body: JSON.stringify({ text: "Salut de Bravo" }) });
    check(pre.status === 200, "Bravo écrit un message");

    const domA = await openGame(html, `${baseUrl}?m=${tA}`); doms.push(domA);
    const winA = domA.window, docA = winA.document;
    await winA.__lastLeagueChatCount;
    const ligueTab = [...docA.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue");
    check(await waitFor(() => badge(docA, "ligueChatBadge") === "1", "pastille du menu"), "hors page Ligue : pastille « 1 » sur l'entrée « Ligue » du menu (le message de Bravo, pas les résultats)");
    check(ligueTab.contains(docA.getElementById("ligueChatBadge")), "pastille dans le bouton « Ligue » du menu");

    goLigue(docA);
    await winA.__lastLeagueChatCount;
    check(!docA.querySelector("#standingsContent #leagueChat, #standingsContent .lgc"), "plus de panneau de chat dans la page Ligue");
    const openBtn = docA.querySelector("#standingsContent .lg-head #lgcOpenBtn");
    check(!!openBtn && /Chat de la ligue/.test(openBtn.textContent), "bouton « Chat de la ligue » dans l'en-tête de la page Ligue");
    check(await waitFor(() => badge(docA, "lgcOpenBadge") === "1", "pastille du bouton"), "bouton : pastille rouge « 1 » (seulement le message de Bravo)");
    check(!docA.getElementById("mTabMenu") || docA.getElementById("mTabMenu").classList.contains("lgc-has-unread"), "point sur « Menu » (mobile) tant qu'il y a des non-lus");
    check(!drawerOpen(docA), "chat fermé au départ");

    // Ouverture.
    openBtn.focus();
    openBtn.click();
    await winA.__lastLeagueChat;
    check(drawerOpen(docA), "clic : le chat s'ouvre par-dessus la page");
    const chat = docA.getElementById("leagueChat");
    check(chat.getAttribute("role") === "dialog" && chat.getAttribute("aria-modal") === "true", "fenêtre modale (role=dialog)");
    check(chat.contains(docA.activeElement), "focus déplacé dans le chat");
    check(badge(docA, "lgcOpenBadge") === "", "ouvert : la pastille retombe à 0");
    check(badge(docA, "ligueChatBadge") === "", "ouvert : la pastille du menu disparaît aussi");
    const items = [...chat.querySelectorAll("#lgcList > *")].filter(el => !el.classList.contains("lgc-day") && !el.classList.contains("lgc-new"));
    check(items.length === 1 && items[0].classList.contains("lgc-msg") && /Salut de Bravo/.test(items[0].textContent), "2 journées jouées : seul le message de Bravo est affiché");
    check(!chat.querySelector(".lgc-sys, .lgc-kind") && !/ bat |Résultat|Transfert|Classement/.test(chat.querySelector("#lgcList").textContent), "aucun résultat, transfert ni classement dans le chat");
    const form = docA.getElementById("lgcForm");
    const input = docA.getElementById("lgcInput");
    check(!form.hidden && input.tagName === "INPUT" && docA.querySelector('label[for="lgcInput"]'), "champ de saisie avec son <label>");
    const send = docA.getElementById("lgcSend");
    check(send.getAttribute("aria-label") === "Envoyer" && send.disabled, "bouton « Envoyer » (aria-label), désactivé à vide");
    check(docA.getElementById("lgcClose").getAttribute("aria-label") === "Fermer le chat", "bouton ✕ « Fermer le chat »");

    // Envoi.
    input.value = "Salut <img src=x onerror=alert(1)> la ligue";
    input.dispatchEvent(new winA.Event("input", { bubbles: true }));
    check(!send.disabled, "« Envoyer » actif dès qu'il y a du texte");
    form.dispatchEvent(new winA.Event("submit", { bubbles: true, cancelable: true }));
    await winA.__lastLeagueChat;
    const sentAt = Date.now();
    const mine = await waitFor(() => chat.querySelector(".lgc-msg.mine"), "message affiché");
    check(mine.querySelector(".lgc-text").textContent === "Salut <img src=x onerror=alert(1)> la ligue" && !mine.querySelector("img"), "texte affiché échappé (aucune balise interprétée)");
    check(mine.querySelector(".lgc-by .lgc-author").textContent === "Manager de Alpha CHAT" && mine.querySelector(".lgc-by small").textContent === "Alpha CHAT", "auteur : pseudo du manager (repli « Manager de <club> »), club en petit");
    check(input.value === "", "champ vidé après l'envoi");
    check(badge(docA, "lgcOpenBadge") === "", "son propre message ne compte jamais comme non lu");

    // Anti-spam : second envoi immédiat refusé, erreur affichée.
    input.value = "encore";
    input.dispatchEvent(new winA.Event("input", { bubbles: true }));
    form.dispatchEvent(new winA.Event("submit", { bubbles: true, cancelable: true }));
    await winA.__lastLeagueChat;
    check(/3 secondes/.test(docA.getElementById("lgcErr").textContent), "second message trop rapide : message d'erreur");

    // Réaction via le sélecteur.
    chat.querySelector(".lgc-msg.mine .lgc-add").click();
    const pick = chat.querySelector(".lgc-msg.mine .lgc-pick");
    check(pick && pick.querySelectorAll("button").length === 6, "sélecteur de 6 réactions");
    [...pick.querySelectorAll("button")].find(b => b.dataset.emoji === "🔥").click();
    await winA.__lastLeagueChat;
    const pill = await waitFor(() => chat.querySelector(".lgc-msg.mine .lgc-r"), "réaction affichée");
    check(pill.getAttribute("aria-pressed") === "true" && pill.textContent.includes("1"), "réaction 🔥 1 (la mienne)");
    pill.click();
    await winA.__lastLeagueChat;
    check(!chat.querySelector(".lgc-msg.mine .lgc-r"), "second clic : réaction retirée");

    // Fermeture : Échap (focus rendu au bouton), fond, ✕.
    esc(winA, docA);
    check(!drawerOpen(docA), "Échap ferme le chat");
    check(docA.activeElement === docA.getElementById("lgcOpenBtn"), "focus rendu au bouton « Chat de la ligue »");
    docA.getElementById("lgcOpenBtn").click();
    await winA.__lastLeagueChat;
    check(drawerOpen(docA), "réouvert");
    docA.querySelector("#leagueChatDrawer .lgc-backdrop").click();
    check(!drawerOpen(docA), "clic sur le fond : fermé");
    docA.getElementById("lgcOpenBtn").click();
    await winA.__lastLeagueChat;
    docA.getElementById("lgcClose").click();
    check(!drawerOpen(docA), "✕ ferme le chat");

    // B : pastille, lecture, puis 1 nouveau message d'Alpha → « 1 ».
    const domB = await openGame(html, `${baseUrl}?m=${tB}`); doms.push(domB);
    const winB = domB.window, docB = winB.document;
    goLigue(docB);
    await winB.__lastLeagueChatCount;
    check(await waitFor(() => badge(docB, "lgcOpenBadge") === "1", "pastille B"), "B : « 1 » non lu (le message d'Alpha)");
    docB.getElementById("lgcOpenBtn").click();
    await winB.__lastLeagueChat;
    const other = docB.querySelector("#leagueChat .lgc-msg:not(.mine)");
    check(other && !other.classList.contains("mine") && other.querySelector(".lgc-by small").textContent === "Alpha CHAT", "B voit le message d'Alpha");
    check(badge(docB, "lgcOpenBadge") === "", "B a ouvert le chat : 0 non-lu");
    docB.getElementById("lgcClose").click();
    await sleep(Math.max(0, 3100 - (Date.now() - sentAt)));
    docA.getElementById("lgcOpenBtn").click();
    await winA.__lastLeagueChat;
    input.value = "Tu es là Bravo ?";
    input.dispatchEvent(new winA.Event("input", { bubbles: true }));
    form.dispatchEvent(new winA.Event("submit", { bubbles: true, cancelable: true }));
    await winA.__lastLeagueChat;
    check(docA.querySelectorAll("#leagueChat .lgc-msg.mine").length === 2, "Alpha écrit un second message");
    await winB.eval("lgcRefreshCount()");
    check(badge(docB, "lgcOpenBadge") === "1", "B : pastille « 1 » sur le bouton — repère de lecture gardé côté serveur");
    await flush(domA); await flush(domB);

    // ------------------------------------------------------------------
    // 2) Seul manager de sa ligue (serveur de test par défaut) : lecture seule.
    // ------------------------------------------------------------------
    const solo = await startTestServer();
    servers.push(solo.server);
    const domS = await openGame(html, solo.baseUrl); doms.push(domS);
    const d = domS.window.document;
    goLigue(d);
    d.getElementById("lgcOpenBtn").click();
    await domS.window.__lastLeagueChat;
    check(d.getElementById("lgcForm").hidden, "seul manager : pas de champ de saisie");
    check(!d.getElementById("lgcNote").hidden && /seul manager/.test(d.getElementById("lgcNote").textContent), "seul manager : note « les autres managers apparaîtront ici »");
    check(!!d.querySelector("#lgcList .lgc-empty"), "aucun message : invitation à lancer la discussion");
    check(d.activeElement === d.getElementById("lgcClose"), "seul manager : focus sur ✕");
    console.log("\n🏁 Chat de la ligue (navigateur) conforme.");
  } finally {
    doms.forEach(dm => dm.window.close());
    servers.forEach(s => s.close());
  }
})().catch(e => { console.error(e); process.exit(1); });
