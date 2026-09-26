// Messagerie privée entre managers — côté navigateur (voir
// renderMessagesSection dans moteurbasket3.html et server/messages.js).
// Ligue partagée à 3 clubs humains : A écrit à B depuis l'onglet
// Messagerie, B voit le compteur (barre latérale + tableau de bord), lit,
// répond, signale et bloque ; bouton "Envoyer un message" sur la fiche
// d'un club humain uniquement ; onglet absent en solo.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) {
  for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error("❌ délai dépassé : " + label);
}
function tabOf(doc, key) { return [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === key); }
function typeAndSend(win, doc, text) {
  const input = doc.getElementById("msgInput");
  input.value = text;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.getElementById("msgComposeForm").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
  return win.__lastMsgAction;
}

(async () => {
  const now = Date.now();
  const names = ["Alpha MSG", "Bravo MSG", "Charlie MSG"];
  const league = Engine.generateMultiManagerLeague(names, names.length, now, Calendar.dailyAnchoredCalendarConfig());
  const humans = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  const [iA, iB] = humans;
  const cpuIdx = league.teams.findIndex(t => !t.isHuman);
  const tokens = humans.map(i => league.teams[i].managerLinkToken);
  const { server, multiSavePath, baseUrl } = await startTestServer(() => Date.now());
  await store.saveMultiLeague(league, multiSavePath);
  const doms = [];
  try {
    // --- A écrit à B.
    const domA = await openGame(html, `${baseUrl}?m=${tokens[0]}`); doms.push(domA);
    const winA = domA.window, docA = winA.document;
    await winA.__lastMsgSummary;
    const tab = tabOf(docA, "messages");
    check(!!tab && !tab.classList.contains("hidden"), "onglet « Messagerie » visible en ligue partagée");
    check(docA.getElementById("messagesBadge").classList.contains("hidden"), "aucun badge sans message non lu");
    tab.click();
    await winA.__lastMsgNav;
    check(!docA.getElementById("messagesSection").classList.contains("hidden"), "la page Messagerie s'affiche");
    const optionNames = [...docA.getElementById("msgNewSelect").options].slice(1).map(o => o.textContent);
    check(optionNames.length === 2 && optionNames.includes("Bravo MSG") && !optionNames.includes("Alpha MSG"), "« Nouveau message » propose les 2 autres managers");
    check(!!docA.querySelector("#msgList .msg-empty"), "liste vide au départ");
    const sel = docA.getElementById("msgNewSelect");
    sel.value = String(iB);
    sel.dispatchEvent(new winA.Event("change", { bubbles: true }));
    await winA.__lastMsgNav;
    check(docA.querySelector(".msg-thread-name").textContent === "Bravo MSG", "conversation avec Bravo ouverte");
    check(docA.getElementById("msgSendBtn").disabled, "« Envoyer » désactivé tant que le message est vide");
    await typeAndSend(winA, docA, "Salut <b>Bravo</b>, ton pivot est à vendre ?");
    const bubble = await waitFor(() => docA.querySelector(".msg-row.mine .msg-bubble"), "message affiché côté A");
    check(bubble.textContent === "Salut <b>Bravo</b>, ton pivot est à vendre ?" && !bubble.querySelector("b"), "texte affiché tel quel (HTML échappé)");
    check(bubble.hasAttribute("data-no-i18n"), "texte des managers exclu de la traduction automatique");
    check(docA.getElementById("msgInput").value === "", "zone de saisie vidée après envoi");
    check(docA.querySelectorAll(".msg-conv").length === 1, "la conversation apparaît dans la liste");

    // --- B : compteur, bandeau du tableau de bord, lecture.
    const domB = await openGame(html, `${baseUrl}?m=${tokens[1]}`); doms.push(domB);
    const winB = domB.window, docB = winB.document;
    await winB.__lastMsgSummary;
    check(docB.getElementById("messagesBadge").textContent === "1" && !docB.getElementById("messagesBadge").classList.contains("hidden"), "B : badge « 1 » dans la barre latérale");
    winB.eval("TAB_HANDLERS.club()");
    const banner = docB.querySelector("#clubMessagesBanner .msg-dash-banner");
    check(!!banner && /1 nouveau message/.test(banner.textContent) && /Alpha MSG/.test(banner.textContent), "B : bandeau « 1 nouveau message de Alpha MSG » sur le tableau de bord");
    banner.click();
    await winB.__lastMsgNav;
    await waitFor(() => docB.querySelector(".msg-row:not(.mine) .msg-bubble"), "B voit le message");
    await waitFor(() => docB.getElementById("messagesBadge").classList.contains("hidden"), "badge effacé après lecture");
    check(docB.getElementById("clubMessagesBanner").innerHTML === "", "B : bandeau du tableau de bord retiré après lecture");
    await sleep(1100);
    await typeAndSend(winB, docB, "Non, mais fais une offre.\nOn peut parler.");
    await waitFor(() => docB.querySelector(".msg-row.mine"), "réponse de B affichée");

    // --- A reçoit la réponse au rafraîchissement.
    await winA.eval("msgLoadThread(msgUi.activeWith, { silent: true })");
    const theirs = docA.querySelector(".msg-row:not(.mine) .msg-bubble");
    check(theirs && theirs.textContent === "Non, mais fais une offre.\nOn peut parler.", "A reçoit la réponse (sauts de ligne conservés)");
    check([...docA.querySelectorAll(".msg-meta")].some(m => /Vu/.test(m.textContent)), "A voit « Vu » sous son message lu par B");

    // --- Fiche équipe : bouton seulement pour un club humain.
    winA.eval(`showTeamDetail(${iB})`);
    const cta = docA.querySelector("#teamDetailContent .msg-team-cta button");
    check(!!cta, "fiche d'un club humain : bouton « Envoyer un message »");
    winA.eval(`showTeamDetail(${cpuIdx})`);
    check(!docA.querySelector("#teamDetailContent .msg-team-cta"), "fiche d'un club CPU : pas de bouton");
    winA.eval(`showTeamDetail(${iA})`);
    check(!docA.querySelector("#teamDetailContent .msg-team-cta"), "sa propre fiche : pas de bouton");
    winA.eval(`showTeamDetail(${iB})`);
    docA.querySelector("#teamDetailContent .msg-team-cta button").click();
    await winA.__lastMsgNav;
    check(!docA.getElementById("messagesSection").classList.contains("hidden") && docA.querySelector(".msg-thread-name").textContent === "Bravo MSG", "le bouton ouvre la conversation");

    // --- B signale puis bloque A.
    docB.querySelector(".msg-row:not(.mine) [data-msg-report]").click();
    check(!!docB.getElementById("msgReportReason"), "panneau de signalement ouvert");
    docB.getElementById("msgReportReason").value = "insultes";
    docB.querySelector("[data-msg-report-send]").click();
    await winB.__lastMsgAction;
    check(/signalement a été transmis/.test(docB.getElementById("msgPanelHolder").textContent), "signalement confirmé");
    docB.querySelector("[data-msg-block='ask']").click();
    check(!!docB.querySelector("[data-msg-block='1']"), "blocage : confirmation demandée");
    docB.querySelector("[data-msg-block='1']").click();
    await winB.__lastMsgAction;
    check(/Vous avez bloqué ce manager/.test(docB.getElementById("msgPanelHolder").textContent) && docB.getElementById("msgInput").disabled, "B a bloqué A : saisie désactivée");
    await sleep(1100);
    await typeAndSend(winA, docA, "Allô ?");
    await waitFor(() => docA.querySelector("#msgPanelHolder .msg-notice.err"), "erreur affichée côté A");
    check(/ne reçoit pas vos messages/.test(docA.querySelector("#msgPanelHolder .msg-notice.err").textContent), "A ne peut plus écrire à B");
    check(docA.getElementById("msgInput").value === "Allô ?", "le brouillon de A est conservé après l'échec");

    // --- Mobile (liste OU conversation) : bouton retour.
    docA.querySelector("[data-msg-back]").click();
    check(!docA.getElementById("msgLayout").classList.contains("has-thread"), "« ← » revient à la liste des conversations");

    // --- Solo : pas d'onglet, aucun appel.
    const domSolo = await openGame(html, baseUrl); doms.push(domSolo);
    await sleep(100);
    check(tabOf(domSolo.window.document, "messages").classList.contains("hidden"), "solo : onglet Messagerie masqué");
  } finally {
    doms.forEach(d => d.window.close());
    server.close();
  }
  console.log("\nTous les tests de l'interface de messagerie sont passés.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
