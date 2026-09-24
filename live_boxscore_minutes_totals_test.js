// Vérifie les 3 ajouts au box score EN DIRECT (retour Discord d'Ariane,
// relayé par l'utilisateur, 2026-09-24 : "ligne total + tous les joueurs +
// minutes jouées" — voir DEV_NOTES.md) : voir le grand commentaire
// au-dessus de `let liveBoxScore` dans moteurbasket3.html. live_boxscore_test.js
// couvre déjà PTS/visibilité/onglets/fin de direct — ce fichier-ci se
// concentre uniquement sur ce qui est NOUVEAU.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);

const saved = readRawSave(savePath);
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

// Reconnexion tardive (90% de la diffusion, contre 50% dans
// live_boxscore_test.js) : à ce stade, un match complet a quasi toujours vu
// au moins un changement de joueur (fatigue/fautes), nécessaire pour que la
// Partie 2 (minutes jouées) soit concluante — toujours AVANT la fin (le box
// score en direct doit rester affiché, pas encore la feuille finale).
clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS * 0.9);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// Partie 1 : "tous les joueurs" — le nombre de lignes de l'équipe A
// correspond EXACTEMENT à sa feuille de match (titulaires + remplaçants
// désignés, voir matchdayRosterPlayers), pas seulement aux joueurs ayant
// déjà généré une statistique.
// ---------------------------------------------------------------------
const independent = win.eval(`
  (function() {
    const rosterA = matchdayRosterPlayers(teamA);
    const rosterB = matchdayRosterPlayers(teamB);
    return {
      rosterNamesA: rosterA.map(p => p.name).sort(),
      rosterNamesB: rosterB.map(p => p.name).sort(),
      startersA: Object.values(teamA.lineup.starters).filter(Boolean).length,
    };
  })()
`);
if (independent.startersA !== 5) throw new Error(`❌ (setup) L'équipe A devrait avoir 5 titulaires, obtenu ${independent.startersA}.`);

function rowNames(side) {
  return [...doc.querySelectorAll(`#liveBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)`)]
    .map(tr => tr.children[0].textContent.trim());
}
const namesA = rowNames("A").sort();
if (JSON.stringify(namesA) !== JSON.stringify(independent.rosterNamesA)) {
  throw new Error(`❌ Les lignes affichées pour l'équipe A (${JSON.stringify(namesA)}) devraient correspondre exactement à sa feuille de match (${JSON.stringify(independent.rosterNamesA)}), pas seulement aux joueurs ayant déjà marqué/etc.`);
}
console.log(`✅ Toute la feuille de match de l'équipe A (${namesA.length} joueurs, titulaires + remplaçants désignés) est affichée dès le direct, pas seulement les joueurs ayant déjà une statistique.`);

// Au moins un joueur avec 0 minute (remplaçant pas encore entré) ET au
// moins un avec des minutes > 0 (déjà sur le terrain) — sinon le
// pré-remplissage ne serait pas vraiment testé (ou le match serait fini).
const minColIndex = 2; // Joueur(0) Poste(1) MIN(2) ...
const rowsA = [...doc.querySelectorAll("#liveBoxscoreHolder table.boxscore tbody tr:not(.boxscore-totals)")];
const minsA = rowsA.map(tr => Number(tr.children[minColIndex].textContent));
if (!minsA.some(m => m === 0)) throw new Error(`❌ Au moins un remplaçant pas encore entré (0 minute) devrait apparaître, obtenu : ${JSON.stringify(minsA)}.`);
if (!minsA.some(m => m > 0)) throw new Error(`❌ Au moins un joueur déjà entré (minutes > 0) devrait apparaître à mi-diffusion, obtenu : ${JSON.stringify(minsA)}.`);
console.log(`✅ Le mélange de minutes (${JSON.stringify(minsA)}) confirme un vrai suivi individuel, pas un simple pré-remplissage figé à 0.`);

// ---------------------------------------------------------------------
// Partie 2 : "minutes jouées" — recoupe la colonne MIN affichée avec une
// reconstitution INDÉPENDANTE à partir du flux brut d'événements
// (currentLiveMatch.events), sans lire liveBoxScore/liveCourtState
// (déjà calculés par le code testé) : ne réutilise que le format des
// événements eux-mêmes (quarter/clock/type/team/player/replacement) et les
// constantes QUARTER_SECONDS/OVERTIME_SECONDS déjà vérifiées ailleurs
// (radar_chart_colors_test.js n'y touche pas, mais ces constantes sont
// aussi celles du moteur, voir engine.js).
// ---------------------------------------------------------------------
const reconstructed = win.eval(`
  (function() {
    const events = currentLiveMatch.events.filter(e => e.airAt <= Date.now());
    function elapsedAt(q, clockStr) {
      let before = 0;
      for (let qq = 1; qq < q; qq++) before += qq <= 4 ? QUARTER_SECONDS : OVERTIME_SECONDS;
      const qLen = q <= 4 ? QUARTER_SECONDS : OVERTIME_SECONDS;
      return before + (qLen - clockSecondsFromStr(clockStr));
    }
    const onCourtSince = { A: {}, B: {} };
    const closedSeconds = { A: {}, B: {} };
    ["A", "B"].forEach(key => {
      const team = key === "A" ? teamA : teamB;
      matchdayRosterPlayers(team).forEach(p => { closedSeconds[key][p.name] = 0; });
      Object.values(team.lineup.starters).filter(Boolean).forEach(id => {
        const p = team.players.find(x => x.id === id);
        if (p) onCourtSince[key][p.name] = 0;
      });
    });
    let lastElapsed = 0;
    events.forEach(ev => {
      if (ev.quarter != null && ev.clock != null) lastElapsed = elapsedAt(ev.quarter, ev.clock);
      if (ev.type === "substitution" || ev.type === "shortHanded") {
        const key = ev.team;
        if (ev.player != null && onCourtSince[key][ev.player] != null) {
          closedSeconds[key][ev.player] = (closedSeconds[key][ev.player] || 0) + Math.max(0, lastElapsed - onCourtSince[key][ev.player]);
          delete onCourtSince[key][ev.player];
        }
        if (ev.replacement) onCourtSince[key][ev.replacement] = lastElapsed;
      }
    });
    function minutesFor(key, name) {
      const closed = closedSeconds[key][name] || 0;
      const open = onCourtSince[key][name] != null ? Math.max(0, lastElapsed - onCourtSince[key][name]) : 0;
      return Math.round((closed + open) / 60);
    }
    const out = {};
    Object.keys(closedSeconds.A).forEach(name => { out[name] = minutesFor("A", name); });
    return { minutesByNameA: out, lastElapsed, subEvents: events.filter(e => e.type === "substitution" || e.type === "shortHanded").length };
  })()
`);
console.log(`Reconstruction indépendante : ${reconstructed.subEvents} changement(s) de joueur appliqué(s), ${Math.round(reconstructed.lastElapsed / 60)} minute(s) de jeu écoulées.`);
if (reconstructed.subEvents === 0) throw new Error("❌ (setup) Ce match devrait comporter au moins un changement de joueur à mi-diffusion pour que ce test soit concluant.");

rowsA.forEach(tr => {
  const name = tr.children[0].textContent.trim();
  const displayedMin = Number(tr.children[minColIndex].textContent);
  const expectedMin = reconstructed.minutesByNameA[name];
  if (expectedMin === undefined) throw new Error(`❌ (setup) "${name}" affiché dans le box score en direct devrait être sur la feuille de match reconstituée.`);
  if (displayedMin !== expectedMin) {
    throw new Error(`❌ Minutes affichées pour ${name} (${displayedMin}) ne correspondent pas à la reconstruction indépendante depuis le flux d'événements brut (${expectedMin}).`);
  }
});
console.log("✅ Les minutes affichées pour CHAQUE joueur de l'équipe A correspondent exactement à une reconstruction indépendante depuis le flux d'événements brut (substitutions/sorties comprises).");

// ---------------------------------------------------------------------
// Partie 3 : "ligne total" — présente, et ses colonnes numériques (MIN
// compris) sont bien la somme exacte des lignes joueur.
// ---------------------------------------------------------------------
const totalsRow = doc.querySelector("#liveBoxscoreHolder table.boxscore tbody tr.boxscore-totals");
if (!totalsRow) throw new Error("❌ Le box score en direct devrait afficher une ligne de totaux en bas du tableau.");
if (totalsRow.children[0].textContent.trim() !== "Total") throw new Error(`❌ La ligne de totaux devrait commencer par "Total", obtenu "${totalsRow.children[0].textContent.trim()}".`);

const expectedMinTotal = minsA.reduce((a, b) => a + b, 0);
const displayedMinTotal = Number(totalsRow.children[minColIndex].textContent);
if (displayedMinTotal !== expectedMinTotal) {
  throw new Error(`❌ Le total de la colonne MIN (${displayedMinTotal}) devrait égaler la somme des lignes joueur (${expectedMinTotal}).`);
}
const ptsColIndex = 3; // Joueur(0) Poste(1) MIN(2) PTS(3) ...
const scoreA = Number(doc.getElementById("scoreA").textContent);
const displayedPtsTotal = Number(totalsRow.children[ptsColIndex].textContent);
if (displayedPtsTotal !== scoreA) {
  throw new Error(`❌ Le total de la colonne PTS de la ligne de totaux (${displayedPtsTotal}) devrait égaler le score affiché (${scoreA}).`);
}
console.log(`✅ La ligne de totaux du box score en direct est présente et exacte (MIN total ${displayedMinTotal}, PTS total ${displayedPtsTotal} = score affiché).`);

// Repère de cohérence supplémentaire : à tout instant, exactement 5 joueurs
// sont censés être sur le terrain par équipe (aucune blessure/exclusion
// n'a laissé l'équipe en infériorité, voir le correctif "banc épuisé" côté
// moteur) — donc le total MIN de l'équipe A doit être un multiple de 5
// minutes près du temps de jeu écoulé × 5 (tolérance ±5 pour les
// arrondis indépendants de chaque ligne).
const expectedAround = Math.round(reconstructed.lastElapsed / 60) * 5;
if (Math.abs(displayedMinTotal - expectedAround) > 5) {
  throw new Error(`❌ Le total MIN de l'équipe A (${displayedMinTotal}) devrait être proche de 5 × le temps de jeu écoulé (~${expectedAround}), à ±5 minutes près (arrondis cumulés).`);
}
console.log(`✅ Le total MIN de l'équipe A (${displayedMinTotal}) est cohérent avec 5 joueurs sur le terrain pendant tout le temps de jeu écoulé (~${expectedAround}).`);

await flush(dom);
await dom.window.close();
server.close();

console.log("\n🏁 Tous les tests du box score en direct (ligne total, tous les joueurs, minutes jouées) sont passés.");

})().catch(err => {
  console.error(err);
  process.exit(1);
});
