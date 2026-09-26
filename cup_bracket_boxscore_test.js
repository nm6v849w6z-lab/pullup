// Retour utilisateur (2026-09-26) : "il faudrait pouvoir cliquer et ouvrir
// les box scores des matchs directement dans les briques des phases finales,
// en cliquant sur le score". Vérifie que, dans l'arbre "Phase finale" de la
// page Coupe, le score d'un match JOUÉ est un bouton qui ouvre la feuille de
// statistiques du BON match (bon tour, bonnes équipes), et que les briques
// exemptées / pas encore jouées n'ont aucun score cliquable.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const qa = sel => [...doc.querySelectorAll(sel)];

// Même coupe factice que cup_redesign_test.js : 8es joués (4 exempts, 4 matchs), quarts à jouer.
win.eval(`
  (function() {
    const me = myTeamIndex;
    const others = league.teams.map((t, i) => i).filter(i => i !== me);
    const o = k => others[k % others.length];
    const h = [
      { home: me, away: null, bye: true, winner: me, resolved: true },
      { home: o(0), away: o(1), bye: false, resolved: true, winner: o(1), scoreHome: 70, scoreAway: 74 },
      { home: o(2), away: null, bye: true, winner: o(2), resolved: true },
      { home: o(3), away: o(4), bye: false, resolved: true, winner: o(3), scoreHome: 81, scoreAway: 66 },
      { home: o(5), away: null, bye: true, winner: o(5), resolved: true },
      { home: o(6), away: o(7), bye: false, resolved: true, winner: o(6), scoreHome: 77, scoreAway: 75 },
      { home: o(8), away: null, bye: true, winner: o(8), resolved: true },
      { home: o(9), away: o(10), bye: false, resolved: true, winner: o(10), scoreHome: 60, scoreAway: 62 },
    ];
    const qf = [
      { home: o(1), away: me, bye: false, resolved: false, winner: null },
      { home: o(2), away: o(3), bye: false, resolved: false, winner: null },
      { home: o(5), away: o(6), bye: false, resolved: false, winner: null },
      { home: o(8), away: o(10), bye: false, resolved: false, winner: null },
    ];
    league.cup = { champion: null, rounds: [
      { index: 0, name: "huitiemes", dayIndex: 0, matches: h, resolved: true },
      { index: 1, name: "quarts", dayIndex: 1, matches: qf, resolved: false },
    ] };
    cupSelRound = null; cupFilter = "all"; cupQuery = ""; cupPage = 1;
    renderCoupeSection();
  })()
`);

const rounds = qa("#coupeContent .cp-bracket .cup-round");
if (rounds.length !== 4) throw new Error(`❌ 4 colonnes attendues dans l'arbre, obtenu ${rounds.length}.`);
const eighthCards = [...rounds[0].querySelectorAll(".cup-match")];
const played = eighthCards.filter(c => !c.classList.contains("cup-match-bye"));
const byes = eighthCards.filter(c => c.classList.contains("cup-match-bye"));
if (played.length !== 4 || byes.length !== 4) throw new Error(`❌ 8es : 4 matchs joués et 4 exempts attendus, obtenu ${played.length}/${byes.length}.`);
played.forEach((card, k) => {
  const btns = card.querySelectorAll("button.cup-match-score[data-boxscore-round]");
  if (btns.length !== 2) throw new Error(`❌ Brique jouée n°${k + 1} : les 2 scores devraient être cliquables, obtenu ${btns.length}.`);
  btns.forEach(b => {
    if (b.dataset.boxscoreRound !== "0" || b.dataset.boxscoreCompetition !== "cup") throw new Error("❌ Le score d'un 8e doit viser le tour 0 de la coupe.");
  });
});
if (byes.some(c => c.querySelector("button.cup-match-score"))) throw new Error("❌ Une brique exemptée ne devrait avoir aucun score cliquable.");
if (rounds[1].querySelector("button.cup-match-score")) throw new Error("❌ Les quarts pas encore joués ne devraient avoir aucun score cliquable.");
console.log("✅ Seuls les scores des matchs joués sont cliquables dans l'arbre (2 par brique), exempts et matchs à venir exclus.");

// Clic sur le score d'une brique : ouvre la feuille du BON match.
const card = played[2];
const btn = card.querySelector("button.cup-match-score");
const expected = win.eval(`(function(){ const m = league.cup.rounds[0].matches.find(x => x.home === ${Number(btn.dataset.boxscoreHome)} && x.away === ${Number(btn.dataset.boxscoreAway)}); return { home: league.teams[m.home].name, away: league.teams[m.away].name, sh: m.scoreHome, sa: m.scoreAway }; })()`);
const shown = [...card.querySelectorAll("button.cup-match-score")].map(b => Number(b.textContent));
if (shown[0] !== expected.sh || shown[1] !== expected.sa) throw new Error(`❌ Scores affichés ${shown} ≠ attendus ${expected.sh}/${expected.sa}.`);
btn.click();
const overlay = doc.getElementById("matchBoxscoreOverlay");
if (!overlay) throw new Error("❌ Cliquer sur un score de l'arbre devrait ouvrir la feuille de statistiques.");
const tabs = [...overlay.querySelectorAll(".bs-tab")].map(t => t.textContent);
if (tabs[0] !== expected.home || tabs[1] !== expected.away) throw new Error(`❌ Feuille ouverte pour ${tabs.join(" / ")}, attendu ${expected.home} / ${expected.away}.`);
if (!/Coupe · Huitièmes/.test(overlay.querySelector(".mbx-kicker").textContent)) throw new Error("❌ L'en-tête devrait indiquer « Coupe · Huitièmes ».");
if (!overlay.querySelector(".mbx-score-nums").textContent.includes(`${expected.sh}–${expected.sa}`)) throw new Error("❌ Le score de la feuille devrait être celui de la brique.");
console.log(`✅ Le clic sur le score ouvre la feuille de ${expected.home} - ${expected.away} (${expected.sh}-${expected.sa}), Coupe · Huitièmes.`);

await flush(dom);
dom.window.close();
server.close();
console.log("\n✅ Tous les tests de cup_bracket_boxscore passent.");
process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
