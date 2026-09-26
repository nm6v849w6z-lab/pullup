// Refonte de l'onglet Coupe (retour utilisateur 2026-09-26 : "essaie
// d'améliorer cet onglet, en sachant qu'en coupe on pourra avoir bcp plus
// d'équipes (jusqu'à 12 tours)", maquette validée) — voir
// renderCoupeSection/cupJourneyHtml/cupRoundBodyHtml dans moteurbasket3.html.
// Vérifie :
// A) coupe actuelle à 4 tours : frise du parcours (1 étape par tour, V/D/
//    exempté/à jouer), carte "Prochain match" avec bouton Ordres de Coupe,
//    onglets de tour, "Ton match" épinglé en tête, exemptés résumés en une
//    ligne (aucune ligne de match "exempt" listée), recherche et filtre
//    "À jouer", arbre (4 colonnes .cup-round) ;
// B) élimination : pastille "Éliminé", plus de bouton "Suivre" ;
// C) montée en charge : 12 tours (CUP_STAGE_NAMES allongé le temps du
//    test), 2 048 matchs au 1er tour : libellés génériques (1er tour…
//    8es…Finale), pagination par 20, arbre limité aux 4 derniers tours.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;
const q = sel => doc.querySelector(sel);
const qa = sel => [...doc.querySelectorAll(sel)];

// --- A) 4 tours, le club (index myTeamIndex) exempté en 8es, quart à jouer.
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
const steps = qa("#coupeContent .cp-step");
if (steps.length !== 4) throw new Error(`❌ 4 étapes de parcours attendues, obtenu ${steps.length}.`);
if (!steps[0].classList.contains("is-bye") || !steps[1].classList.contains("is-pending") || !steps[2].classList.contains("is-future")) {
  throw new Error("❌ Parcours attendu : exempté, à jouer, pas encore tiré… obtenu " + steps.map(s => s.className).join(" | "));
}
if (!/En course en quarts de finale/.test(q("#coupeContent .cp-pill").textContent)) throw new Error("❌ Pastille « En course en quarts de finale » attendue, obtenu : " + q("#coupeContent .cp-pill").textContent);
const nextBtn = q("#coupeContent .cal-next .cal-next-btn");
if (!nextBtn || nextBtn.dataset.tab !== "ordres" || nextBtn.dataset.competition !== "cup" || nextBtn.dataset.round !== "1") throw new Error("❌ La carte Prochain match devrait ouvrir les Ordres de Coupe du tour 1.");
const tabs = qa("#coupeContent .cp-rtab");
if (tabs.length !== 4 || tabs.map(t => t.firstChild.textContent.trim()).join(",") !== "8es,Quarts,Demies,Finale") throw new Error("❌ Onglets attendus 8es/Quarts/Demies/Finale, obtenu " + tabs.map(t => t.firstChild.textContent.trim()).join(","));
if (!tabs[1].classList.contains("on")) throw new Error("❌ L'onglet du tour du club (Quarts) devrait être ouvert par défaut.");
let rows = qa("#coupeContent .cp-m");
if (rows.length !== 4 || !rows[0].classList.contains("mine")) throw new Error("❌ Quarts : 4 matchs attendus, le match du club épinglé en premier.");
// 8es : exemptés résumés, jamais listés.
tabs[0].click();
rows = qa("#coupeContent .cp-m");
if (rows.length !== 4) throw new Error(`❌ 8es : 4 vrais matchs listés attendus (les 4 exemptés résumés), obtenu ${rows.length}.`);
if (!/4 clubs exemptés passent directement en quarts de finale/.test(q("#coupeContent .cp-byes").textContent)) throw new Error("❌ Ligne des exemptés attendue, obtenu : " + (q("#coupeContent .cp-byes") || {}).textContent);
if (!rows.every(r => r.querySelector("button.cp-score[data-boxscore-round]"))) throw new Error("❌ Chaque score joué devrait ouvrir le boxscore.");
if (q("#cupSearch")) throw new Error("❌ Le champ « Chercher un club » a été retiré (retour utilisateur 2026-09-26).");
if (q('#coupeContent [data-cup-filter="upset"]')) throw new Error("❌ Le filtre « Surprises » a été retiré (retour utilisateur 2026-09-26).");
if (qa("#coupeContent .cp-tag").some(t => /Surprise/.test(t.textContent))) throw new Error("❌ Le badge « Surprise » a été retiré (retour utilisateur 2026-09-26).");
// Filtre "À jouer" sur un tour entièrement joué.
q('#coupeContent [data-cup-filter="pending"]').click();
if (qa("#coupeContent .cp-m").length !== 0 || !q("#coupeContent .cp-empty")) throw new Error("❌ Filtre « À jouer » sur les 8es (tout joué) : liste vide attendue.");
q('#coupeContent [data-cup-filter="all"]').click();
// Arbre.
const cols = qa("#coupeContent .cup-bracket .cup-round");
if (cols.length !== 4) throw new Error(`❌ Arbre : 4 colonnes attendues, obtenu ${cols.length}.`);
if (!/Vainqueur 1\/4 n°1/.test(cols[2].textContent)) throw new Error("❌ Demies pas encore tirées : « Vainqueur 1/4 n°1 » attendu.");
console.log("✅ A) parcours, prochain match, onglets, exemptés résumés, filtres et arbre corrects.");
fs.mkdirSync("Claude outputs/cup_fix", { recursive: true });
fs.writeFileSync("Claude outputs/cup_fix/snap_A.html", q("#coupeSection").outerHTML);

// --- B) élimination en quarts puis "Suivre".
win.eval(`
  (function() {
    const r1 = league.cup.rounds[1];
    r1.matches.forEach((m, k) => { m.resolved = true; m.scoreHome = 80; m.scoreAway = 70 + k; m.winner = m.home; });
    r1.resolved = true;
    const w = r1.matches.map(m => m.winner);
    league.cup.rounds.push({ index: 2, name: "demies", dayIndex: 2, resolved: false, matches: [
      { home: w[0], away: w[1], bye: false, resolved: false, winner: null },
      { home: w[2], away: w[3], bye: false, resolved: false, winner: null } ] });
    cupSelRound = null; cupQuery = ""; cupPage = 1;
    renderCoupeSection();
  })()
`);
if (!/Éliminé en quarts de finale/.test(q("#coupeContent .cp-pill").textContent)) throw new Error("❌ Pastille « Éliminé en quarts de finale » attendue.");
if (q("#coupeContent [data-cup-follow]")) throw new Error("❌ Le bouton « Suivre » a été retiré (retour utilisateur 2026-09-26).");
console.log("✅ B) élimination correcte, sans bouton « Suivre ».");
fs.writeFileSync("Claude outputs/cup_fix/snap_B.html", q("#coupeSection").outerHTML);

// --- C) 12 tours, 2 048 matchs au 1er tour.
const t0 = Date.now();
win.eval(`
  (function() {
    CUP_STAGE_NAMES.splice(0, 0, "t1","t2","t3","t4","t5","t6","t7","t8");
    const n = league.teams.length;
    const rounds = [];
    let size = 4096;
    for (let r = 0; r < 12 && size > 1; r++) {
      if (r > 7) break; // tours 1 à 8 joués/tirés, 16es à jouer
      const matches = [];
      for (let k = 0; k < size / 2; k++) {
        const home = (k * 2) % n, away = (k * 2 + 1) % n;
        const played = r < 7;
        matches.push({ home, away, bye: false, resolved: played, winner: played ? home : null, scoreHome: played ? 70 : null, scoreAway: played ? 60 : null });
      }
      rounds.push({ index: r, name: CUP_STAGE_NAMES[r], dayIndex: r, matches, resolved: r < 7 });
      size /= 2;
    }
    league.cup = { champion: null, rounds };
    cupSelRound = 0; cupFilter = "all"; cupQuery = ""; cupPage = 1;
    renderCoupeSection();
  })()
`);
const ms = Date.now() - t0;
const tabs12 = qa("#coupeContent .cp-rtab").map(t => t.firstChild.textContent.trim());
if (tabs12.length !== 12 || tabs12[0] !== "1er tour" || tabs12[1] !== "2e tour" || tabs12[7] !== "16es" || tabs12[8] !== "8es" || tabs12[11] !== "Finale") throw new Error("❌ Libellés des 12 tours incorrects : " + tabs12.join(","));
rows = qa("#coupeContent .cp-m");
if (rows.length !== 20) throw new Error(`❌ Pagination : 20 lignes attendues au 1er tour, obtenu ${rows.length}.`);
q("#coupeContent [data-cup-more]").click();
if (qa("#coupeContent .cp-m").length !== 40) throw new Error("❌ « Afficher 20 de plus » devrait passer à 40 lignes.");
if (qa("#coupeContent .cup-bracket .cup-round").length !== 4) throw new Error("❌ Arbre limité aux 4 derniers tours (8es → Finale) attendu.");
if (qa("#coupeContent .cp-step").length !== 12) throw new Error("❌ 12 étapes de parcours attendues.");
if (ms > 3000) throw new Error(`❌ Rendu trop lent pour 12 tours : ${ms} ms.`);
console.log(`✅ C) 12 tours : libellés, pagination et arbre corrects (rendu ${ms} ms).`);
fs.writeFileSync("Claude outputs/cup_fix/snap_C.html", q("#coupeSection").outerHTML);
win.eval(`CUP_STAGE_NAMES.splice(0, 8)`);

await flush(dom);
dom.window.close();
server.close();
console.log("\n🏁 Refonte de l'onglet Coupe : tous les tests passent.");
})().catch(e => { console.error(e); process.exit(1); });
