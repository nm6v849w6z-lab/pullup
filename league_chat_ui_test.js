// Chat de la ligue — côté navigateur (voir lgcRender dans moteurbasket3.html
// et server/leagueChat.js). Ligue partagée à 2 clubs humains : A ouvre
// l'onglet Ligue, voit le chat dans la colonne latérale avec les messages
// automatiques (résultats, transfert), écrit (texte échappé), réagit ; B
// voit le message et la réaction. Seul manager de sa ligue : lecture seule.
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
function openLigue(win, doc) {
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click();
  return win.__lastLeagueChat;
}

(async () => {
  const doms = [];
  const servers = [];
  try {
    // ------------------------------------------------------------------
    // 1) Ligue à deux managers, deux journées jouées, un transfert.
    // ------------------------------------------------------------------
    const now = Date.now();
    const names = ["Alpha CHAT", "Bravo CHAT"];
    const league = Engine.generateMultiManagerLeague(names, names.length, now, Calendar.dailyAnchoredCalendarConfig());
    const [iA, iB] = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
    for (let r = 0; r < 2; r++) league.matchesForRound(r).forEach((m, k) => league.recordResult(r, m.home, m.away, 80 + k, 70 + k));
    league.round = 2;
    league.logTransferNews({ id: "ui-1", at: now, playerName: "Jean <Test>", buyerIdx: iB, buyerName: "Bravo CHAT", sellerName: league.teams[5].name, fee: 150000 });
    const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
    servers.push(server);
    await store.saveMultiLeague(league, multiSavePath);
    const tA = league.teams[iA].managerLinkToken, tB = league.teams[iB].managerLinkToken;

    const domA = await openGame(html, `${baseUrl}?m=${tA}`); doms.push(domA);
    const winA = domA.window, docA = winA.document;
    await openLigue(winA, docA);
    const chat = docA.getElementById("leagueChat");
    check(!!chat && !!chat.closest("#standingsContent .lg-side"), "le chat est dans la colonne latérale de la page Ligue");
    check(chat.querySelector("h2").textContent === "Chat de la ligue", "titre « Chat de la ligue »");
    check(!chat.querySelector(".lgc-people, .lgc-chip"), "pas de liste des managers en tête du chat");
    check(/en ligne/.test(docA.getElementById("lgcMeta").textContent), "compteur « en ligne »");
    const sys = [...chat.querySelectorAll(".lgc-sys")];
    check(sys.filter(s => s.classList.contains("lgc-sys--result")).length === 10, "10 messages « Résultat » (2 journées)");
    const res0 = chat.querySelector(".lgc-sys--result");
    check(res0.querySelector(".lgc-kind").textContent === "Résultat" && / bat /.test(res0.querySelector(".lgc-sys-text").textContent), "carte « Résultat » : « X bat Y »");
    const tr = chat.querySelector(".lgc-sys--transfer");
    check(tr && tr.querySelector(".lgc-kind").textContent === "Transfert" && tr.textContent.includes("Jean <Test>") && !tr.querySelector("test"), "carte « Transfert » (nom échappé)");
    const form = docA.getElementById("lgcForm");
    const input = docA.getElementById("lgcInput");
    check(!form.hidden && input.tagName === "INPUT" && docA.querySelector('label[for="lgcInput"]'), "champ de saisie avec son <label>");
    const send = docA.getElementById("lgcSend");
    check(send.getAttribute("aria-label") === "Envoyer" && send.disabled, "bouton « Envoyer » (aria-label), désactivé à vide");

    // Envoi.
    input.value = "Salut <img src=x onerror=alert(1)> la ligue";
    input.dispatchEvent(new winA.Event("input", { bubbles: true }));
    check(!send.disabled, "« Envoyer » actif dès qu'il y a du texte");
    form.dispatchEvent(new winA.Event("submit", { bubbles: true, cancelable: true }));
    await winA.__lastLeagueChat;
    const mine = await waitFor(() => chat.querySelector(".lgc-msg.mine"), "message affiché");
    check(mine.querySelector(".lgc-text").textContent === "Salut <img src=x onerror=alert(1)> la ligue" && !mine.querySelector("img"), "texte affiché échappé (aucune balise interprétée)");
    check(mine.querySelector(".lgc-by b").textContent === "Alpha CHAT", "auteur : nom du club");
    check(input.value === "", "champ vidé après l'envoi");

    // Anti-spam : second envoi immédiat refusé, erreur affichée.
    input.value = "encore";
    input.dispatchEvent(new winA.Event("input", { bubbles: true }));
    form.dispatchEvent(new winA.Event("submit", { bubbles: true, cancelable: true }));
    await winA.__lastLeagueChat;
    check(/3 secondes/.test(docA.getElementById("lgcErr").textContent), "second message trop rapide : message d'erreur");

    // Réaction via le sélecteur.
    mine.querySelector(".lgc-add").click();
    const pick = chat.querySelector(".lgc-msg.mine .lgc-pick");
    check(pick && pick.querySelectorAll("button").length === 6, "sélecteur de 6 réactions");
    [...pick.querySelectorAll("button")].find(b => b.dataset.emoji === "🔥").click();
    await winA.__lastLeagueChat;
    let pill = await waitFor(() => chat.querySelector(".lgc-msg.mine .lgc-r"), "réaction affichée");
    check(pill.getAttribute("aria-pressed") === "true" && pill.textContent.includes("1"), "réaction 🔥 1 (la mienne)");
    // Re-rendu de la page Ligue : le chat garde son contenu (même nœud).
    winA.eval("renderLeagueTop()");
    check(docA.getElementById("leagueChat") === chat && chat.querySelector(".lgc-msg.mine .lgc-r"), "re-rendu de la page : le chat est conservé tel quel");
    pill.click();
    await winA.__lastLeagueChat;
    check(!chat.querySelector(".lgc-msg.mine .lgc-r"), "second clic : réaction retirée");

    // B voit le message.
    const domB = await openGame(html, `${baseUrl}?m=${tB}`); doms.push(domB);
    await openLigue(domB.window, domB.window.document);
    const other = await waitFor(() => domB.window.document.querySelector("#leagueChat .lgc-msg"), "message vu par B");
    check(!other.classList.contains("mine") && other.querySelector(".lgc-by b").textContent === "Alpha CHAT", "B voit le message d'Alpha");
    await flush(domA); await flush(domB);

    // ------------------------------------------------------------------
    // 2) Seul manager de sa ligue (serveur de test par défaut) : lecture seule.
    // ------------------------------------------------------------------
    const solo = await startTestServer();
    servers.push(solo.server);
    const domS = await openGame(html, solo.baseUrl); doms.push(domS);
    await openLigue(domS.window, domS.window.document);
    const d = domS.window.document;
    check(d.getElementById("lgcForm").hidden, "seul manager : pas de champ de saisie");
    check(!d.getElementById("lgcNote").hidden && /seul manager/.test(d.getElementById("lgcNote").textContent), "seul manager : note « les autres managers apparaîtront ici »");
    check(!!d.querySelector("#lgcList .lgc-empty"), "aucune journée jouée : message d'attente");
    console.log("\n🏁 Chat de la ligue (navigateur) conforme.");
  } finally {
    doms.forEach(dm => dm.window.close());
    servers.forEach(s => s.close());
  }
})().catch(e => { console.error(e); process.exit(1); });
