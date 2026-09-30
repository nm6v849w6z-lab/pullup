// Premium unique (retour utilisateur, 2026-09-27) : "il faut un onglet en
// dessous de guide [...] on y laissera le bouton passer en version payante
// (gratuitement) tout doit se passer par là maintenant pour ensuite avoir
// accès aux fonctionnalités payantes" ; "ne dis plus supporter mais
// premium" ; "pour l'analyse de sa propre équipe c'est aussi un avantage
// premium". Voir moteurbasket3.html (renderPremiumSection, teamIsPremium),
// engine.js (Team.hasActivePremium/tacticPresetsMax, fusion de
// scoutingPremium au chargement), server/scouting.js.
const fs = require("fs");
const E = require("./engine.js");
const Scouting = require("./server/scouting.js");

function check(cond, msg) { if (!cond) throw new Error(`❌ ${msg}`); console.log(`✅ ${msg}`); }

// 1) Moteur : un seul statut.
{
  const team = E.generateStartingRoster("Premium FC");
  E.generateLeague(team, 1, Date.UTC(2026, 8, 21));
  check(!team.hasActivePremium() && team.tacticPresetsMax() === 3, "club gratuit : pas Premium, 3 tactiques");
  check(!team.setJerseyPattern("bandes").ok && !team.setCustomLogo("data:image/png;base64,AAAA").ok, "club gratuit : motif et logo refusés");
  team.grantTemporaryPremium(30 * 24 * 3600 * 1000);
  check(team.hasActivePremium() && team.tacticPresetsMax() === 6 && team.setJerseyPattern("bandes").ok, "Premium temporaire (pronostics) : motif et 6 tactiques débloqués");
  const raw = JSON.parse(JSON.stringify(E.serializeTeam(team)));
  raw.premiumUntil = null; raw.isPaying = false; raw.scoutingPremium = true;
  const merged = E.teamFromSave(raw);
  check(merged.isPaying === true && merged.scoutingPremium === false, "ancien « Passer Pro » (scoutingPremium) fusionné dans le Premium au chargement");
  merged.setPaying(false);
  const again = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(merged))));
  check(!again.isPaying && !again.hasActivePremium(), "Premium arrêté : il ne revient pas au rechargement");
}

// 2) Serveur Scouting : le Premium unique donne l'accès complet.
{
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, Date.UTC(2026, 8, 27, 9), { dailyAnchored: true });
  const me = lg.teams.findIndex(t => t.isHuman);
  const opp = lg.teams.findIndex((t, i) => i !== me);
  check(Scouting.getScoutingAccess(lg, me, opp).level === "locked", "Scouting Pro verrouillé en gratuit");
  lg.teams[me].setPaying(true);
  check(Scouting.getScoutingAccess(lg, me, opp).level === "full" && !Scouting.createAdTicket(lg, me, opp).ok, "Premium : Scouting Pro complet, plus de pub");
}

// 3) Page : onglet Premium sous Guide, bouton unique, avantages.
(async () => {
  const { startTestServer, openGame, flush } = require("./test_helpers.js");
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server } = await startTestServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document;
    const win = dom.window;
    const bottom = [...doc.querySelectorAll(".sidebar-section-bottom .sidebar-link")].map(b => b.dataset.tab || b.id);
    // Personnalisation (2026-09-30) s'intercale entre Guide et Premium.
    check(bottom.indexOf("personnalisation") === bottom.indexOf("guide") + 1 && bottom.indexOf("premium") === bottom.indexOf("personnalisation") + 1, "onglets Personnalisation puis Premium juste sous Guide");
    check(!doc.getElementById("clubTogglePayingBtn") && !/Passer Pro \(test\)|Passer en payant/.test(html.replace(/\/\/.*$/gm, "")), "plus aucun autre bouton pour passer Premium");
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "premium").click();
    check(!doc.getElementById("premiumSection").classList.contains("hidden"), "la page Premium s'affiche");
    const content = doc.getElementById("premiumContent");
    check(/Gratuit/.test(content.querySelector(".prm-status").textContent) && content.querySelectorAll(".prm-perk").length === 16, "statut Gratuit et 16 avantages listés (dont parquet, apparence des jeunes, numéros de maillot)");
    // Analyse de sa propre équipe : verrouillée en gratuit.
    win.showTeamDetail(win.eval("myTeamIndex"));
    win.eval('document.querySelector("[data-team-detail-subview=\'analyse\']").dispatchEvent(new Event("click", {bubbles:true}));');
    await flush(dom);
    const detail = doc.getElementById("teamDetailContent");
    check(!!detail.querySelector(".prm-lock [data-tab='premium']") && !detail.querySelector(".tactical-report"), "analyse de sa propre équipe réservée au Premium (lien vers l'onglet)");
    // Historique de l'entraînement : verrouillé en gratuit.
    win.eval(`teamA.trainingHistory = [
      { week: 1, at: null, players: { [teamA.players[0].id]: { name: teamA.players[0].name, position: teamA.players[0].position, gains: [{ attr: "pass", before: 30, after: 31 }] } } },
      { week: 2, at: null, players: { [teamA.players[1].id]: { name: teamA.players[1].name, position: teamA.players[1].position, gains: [{ attr: "rebound", before: 40, after: 41 }] } } },
    ]; teamA.week = 3; teamA.lastTrainingReport = { players: teamA.trainingHistory[1].players };`);
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "entrainement").click();
    check(!!doc.querySelector("#lastTrainingReportHolder .tp-hist-lock [data-tab='premium']") && !doc.querySelector("[data-training-week]"), "historique de l'entraînement réservé au Premium");
    check(!doc.querySelector(".lg-tname .prm-badge, #teamDetailName .prm-badge"), "pas de badge Premium pour un club gratuit");
    // Passer Premium depuis l'onglet.
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "premium").click();
    doc.getElementById("premiumToggleBtn").click();
    check(win.eval("teamA.isPaying && teamA.hasActivePremium()") && /Premium/.test(doc.querySelector(".prm-status__value").textContent) && /Arrêter/.test(doc.getElementById("premiumToggleBtn").textContent), "« Passer Premium » active le Premium");
    win.showTeamDetail(win.eval("myTeamIndex"));
    win.eval('document.querySelector("[data-team-detail-subview=\'analyse\']").dispatchEvent(new Event("click", {bubbles:true}));');
    await flush(dom);
    check(!!doc.querySelector("#teamDetailContent .tactical-report") && !/version payante est prévue/.test(doc.getElementById("teamDetailContent").textContent), "Premium : analyse de sa propre équipe affichée");
    // Historique : choix de la semaine.
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "entrainement").click();
    const weekBtns = doc.querySelectorAll("#lastTrainingReportHolder [data-training-week]");
    check(weekBtns.length === 2 && /Bilan de la semaine dernière/.test(doc.getElementById("tpReportTitle").textContent), "Premium : historique des semaines, bilan de la dernière par défaut");
    doc.querySelector('#lastTrainingReportHolder [data-training-week="1"]').click();
    check(/Bilan de la semaine$/.test(doc.getElementById("tpReportTitle").textContent) && doc.getElementById("lastTrainingReportHolder").textContent.includes(win.eval("teamA.players[0].name")), "Premium : bilan d'une semaine précédente");
    // Badge Premium : fiche équipe.
    win.showTeamDetail(win.eval("myTeamIndex"));
    check(!!doc.querySelector("#teamDetailName .prm-badge"), "badge Premium sur la fiche du club");
    check(win.eval("standingsTableHtml(league.standings()).includes('prm-badge')"), "badge Premium dans le classement");
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "tactiques").click();
    check(doc.querySelectorAll("#tactiquesContent .tq-card").length === 6 && !doc.querySelector("#tactiquesContent .tq-card.is-premium"), "Premium : 6 emplacements de tactiques ouverts");
    dom.window.close();
  } finally {
    server.close();
  }
  console.log("\n🏁 premium_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
