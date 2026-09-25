// Vérifie computeScoutingAdvancedStats (retour utilisateur, 2026-09-24, gros
// chantier "stats collectives avancées" : eFG%/TS%/ORtg/DRtg/Net Rating/
// Pace/TOV%/points raquette/ratio passes-pertes, répartition offensive,
// domicile/extérieur, 1re/2e mi-temps, tendance récente vs saison) contre un
// calcul INDÉPENDANT (même esprit que tactical_scouting_report_test.js :
// jamais comparer la production à elle-même). Scénario construit à la main :
// 2 matchs de CHAMPIONNAT (un à domicile, un à l'extérieur, chiffres et
// quarterScores choisis pour un calcul simple) + 1 match de COUPE aux
// chiffres délibérément énormes, pour vérifier que la portée à deux vitesses
// documentée dans computeScoutingAdvancedStats (voir son grand commentaire)
// est bien respectée : la Coupe compte dans les stats "propre production"
// (eFG%/TS%/etc.) mais JAMAIS dans ce qui a besoin du score adverse
// (ORtg/DRtg/Pace/domicile-extérieur/mi-temps/tendance récente).
const fs = require("fs");
const { startTestServer, openGame, flush, writeRawSave, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
const doc = dom.window.document;
const win = dom.window;

// ---------------------------------------------------------------------
// Repère l'adversaire (même patron que tactical_scouting_report_test.js).
// ---------------------------------------------------------------------
[...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "ligue").click();
const rows = [...doc.querySelectorAll("#standingsContent table.lg-table tbody tr[data-lg-team]")];
const myRow = rows.find(r => r.classList.contains("me"));
const opponentRow = rows.find(r => r !== myRow);
const opponentIdx = Number(opponentRow.querySelector("[data-team-idx]").dataset.teamIdx);

await flush(dom);
dom.window.close();

// ---------------------------------------------------------------------
// Injection du scénario contrôlé.
// ---------------------------------------------------------------------
const saved = readRawSave(savePath);
const oppTeam = saved.league.teams[opponentIdx];
const anyPlayer = oppTeam.players[0];

const logEntry = (over) => ({
  round: 0, competition: "championship", week: 1, min: 30,
  pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, paintAtt: 0, paintMade: 0,
  plusMinus: 0, quarterScores: null,
  ...over,
});

// ---- Match 1 (round 0, championnat, ADVERSAIRE À DOMICILE) ---------------
// fga2=20 fgm2=10, fga3=10 fgm3=5, fta=10 ftm=8 -> pts = 20+15+8 = 43.
const g1 = logEntry({
  round: 0, competition: "championship",
  fga2: 20, fgm2: 10, fga3: 10, fgm3: 5, fta: 10, ftm: 8,
  oreb: 5, dreb: 15, ast: 10, tov: 5, paintAtt: 10, paintMade: 6,
  pts: 43, quarterScores: { home: [12, 10, 11, 10], away: [8, 9, 10, 9] },
});
// ---- Match 2 (round 1, championnat, ADVERSAIRE À L'EXTÉRIEUR) -------------
// fga2=18 fgm2=9, fga3=12 fgm3=6, fta=8 ftm=6 -> pts = 18+18+6 = 42.
const g2 = logEntry({
  round: 1, competition: "championship",
  fga2: 18, fgm2: 9, fga3: 12, fgm3: 6, fta: 8, ftm: 6,
  oreb: 4, dreb: 13, ast: 8, tov: 7, paintAtt: 8, paintMade: 5,
  pts: 42, quarterScores: { home: [10, 9, 8, 9], away: [11, 10, 11, 10] },
});
// ---- Match 3 (round 0, COUPE, chiffres énormes pour détecter une fuite de
// portée) -- AUCUNE entrée dans league.results (comme une vraie Coupe).
const g3 = logEntry({
  round: 0, competition: "cup",
  fga2: 100, fgm2: 100, fga3: 0, fgm3: 0, fta: 0, ftm: 0,
  oreb: 0, dreb: 0, ast: 0, tov: 0, paintAtt: 0, paintMade: 0,
  pts: 200,
});
anyPlayer.matchLog = [g1, g2, g3];

saved.league.results = saved.league.results.filter(r => r.round !== 0 && r.round !== 1);
saved.league.results.push({ round: 0, home: opponentIdx, away: opponentIdx === 0 ? 1 : 0, scoreHome: 43, scoreAway: 36 });
saved.league.results.push({ round: 1, home: opponentIdx === 0 ? 1 : 0, away: opponentIdx, scoreHome: 36, scoreAway: 42 });

writeRawSave(savePath, saved);

const dom2 = await openGame(html, baseUrl);
const win2 = dom2.window;
const oppTeamLive = win2.eval(`league.teams[${opponentIdx}]`);
const adv = win2.computeScoutingAdvancedStats(oppTeamLive, opponentIdx);
console.log("computeScoutingAdvancedStats :", JSON.stringify(adv, null, 2));

// ---------------------------------------------------------------------
// Calcul indépendant (toute compétition confondue : g1+g2+g3).
// ---------------------------------------------------------------------
const fga2 = 20 + 18 + 100, fgm2 = 10 + 9 + 100;
const fga3 = 10 + 12 + 0, fgm3 = 5 + 6 + 0;
const fta = 10 + 8 + 0, ftm = 8 + 6 + 0;
const pts = 43 + 42 + 200;
const fga = fga2 + fga3;
const efgPct = Math.round(((fgm2 + 1.5 * fgm3) / fga) * 1000) / 10;
const tsPct = Math.round((pts / (2 * (fga + 0.44 * fta))) * 1000) / 10;
const ftPct = Math.round((ftm / fta) * 1000) / 10;

if (adv.gamesPlayed !== 3) throw new Error(`❌ gamesPlayed attendu 3 (toute compétition confondue), obtenu ${adv.gamesPlayed}.`);
if (adv.efgPct !== efgPct) throw new Error(`❌ efgPct attendu ${efgPct} (calcul indépendant, g1+g2+g3), obtenu ${adv.efgPct}.`);
if (adv.tsPct !== tsPct) throw new Error(`❌ tsPct attendu ${tsPct}, obtenu ${adv.tsPct}.`);
if (adv.ftPct !== ftPct) throw new Error(`❌ ftPct attendu ${ftPct}, obtenu ${adv.ftPct}.`);
console.log(`✅ eFG%/TS%/%LF toute-compétition-confondue corrects (eFG=${efgPct}%, TS=${tsPct}%, LF=${ftPct}%) — le match de Coupe (100/100 à 2pts) est bien INCLUS ici.`);

// ---------------------------------------------------------------------
// Calcul indépendant CHAMPIONNAT UNIQUEMENT (g1+g2 seulement — la Coupe ne
// doit JAMAIS apparaître dans ORtg/DRtg/Pace/domicile-extérieur/mi-temps/
// tendance récente).
// ---------------------------------------------------------------------
const poss1 = (20 + 10) - 5 + 5 + 0.44 * 10; // fga - oreb + tov + 0.44*fta
const poss2 = (18 + 12) - 4 + 7 + 0.44 * 8;
const possSum = poss1 + poss2;
const champPts = 43 + 42;
const champPtsAgainst = 36 + 42; // adversaire encaisse 36 (match 1, dom.) + 42 (match 2, ext. — oui, l'adversaire est l'équipe qui ENCAISSE 42 dans le match 2 puisqu'il est reçu 36-42, voir scoreAway=42 côté ADVERSAIRE receveur... on relit ci-dessous)
// Relecture : match 1 -> adversaire À DOMICILE, scoreHome=43 (son score),
// scoreAway=36 (score encaissé). Match 2 -> adversaire À L'EXTÉRIEUR,
// scoreAway=42 (son score), scoreHome=36 (score encaissé PAR l'adversaire,
// côté domicile de CE match, donc ptsAgainst pour l'adversaire = scoreHome=36).
const champPtsAgainstCorrect = 36 + 36;
const expectedPace = Math.round((possSum / 2) * 10) / 10;
const expectedOrtg = Math.round((champPts / possSum) * 1000) / 10;
const expectedDrtg = Math.round((champPtsAgainstCorrect / possSum) * 1000) / 10;
const expectedNet = Math.round((expectedOrtg - expectedDrtg) * 10) / 10;

if (adv.gamesPlayedChampionship !== 2) throw new Error(`❌ gamesPlayedChampionship attendu 2, obtenu ${adv.gamesPlayedChampionship}.`);
if (adv.pace !== expectedPace) throw new Error(`❌ pace attendu ${expectedPace}, obtenu ${adv.pace}.`);
if (adv.ortg !== expectedOrtg) throw new Error(`❌ ortg attendu ${expectedOrtg}, obtenu ${adv.ortg}.`);
if (adv.drtg !== expectedDrtg) throw new Error(`❌ drtg attendu ${expectedDrtg}, obtenu ${adv.drtg}.`);
if (adv.netRating !== expectedNet) throw new Error(`❌ netRating attendu ${expectedNet}, obtenu ${adv.netRating}.`);
console.log(`✅ Pace/ORtg/DRtg/Net Rating corrects (${adv.pace}/${adv.ortg}/${adv.drtg}/${adv.netRating}) — calculés UNIQUEMENT sur les 2 matchs de championnat, le match de Coupe (200 pts) n'a AUCUN effet dessus.`);

// ---- Domicile/Extérieur : match 1 = domicile (43 marqués/36 encaissés),
// match 2 = extérieur (42 marqués/36 encaissés). ----------------------------
if (!adv.homeAway || !adv.homeAway.home || !adv.homeAway.away) throw new Error("❌ homeAway.home/away manquants.");
if (adv.homeAway.home.games !== 1 || adv.homeAway.home.ptsForPerGame !== 43 || adv.homeAway.home.ptsAgainstPerGame !== 36) {
  throw new Error(`❌ Split domicile incorrect : ${JSON.stringify(adv.homeAway.home)}`);
}
if (adv.homeAway.away.games !== 1 || adv.homeAway.away.ptsForPerGame !== 42 || adv.homeAway.away.ptsAgainstPerGame !== 36) {
  throw new Error(`❌ Split extérieur incorrect : ${JSON.stringify(adv.homeAway.away)}`);
}
console.log("✅ Split domicile/extérieur correct (43/36 à domicile, 42/36 à l'extérieur).");

// ---- 1re/2e mi-temps : match 1 -> adversaire à domicile donc ses quarts =
// quarterScores.home = [12,10,11,10] -> 1re m-t 22, 2e m-t 21 ; match 2 ->
// adversaire à l'extérieur donc ses quarts = quarterScores.away =
// [11,10,11,10] -> 1re m-t 21, 2e m-t 21. Moyenne sur 2 matchs.
const expectedFirstHalf = (22 + 21) / 2;
const expectedSecondHalf = (21 + 21) / 2;
if (!adv.halves || adv.halves.firstHalf.for !== expectedFirstHalf || adv.halves.secondHalf.for !== expectedSecondHalf) {
  throw new Error(`❌ Split mi-temps incorrect : ${JSON.stringify(adv.halves)}`);
}
console.log(`✅ Split 1re/2e mi-temps correct (${adv.halves.firstHalf.for}/${adv.halves.secondHalf.for} points marqués en moyenne).`);

// ---- Tendance récente vs saison : les 2 seuls matchs de championnat sont
// aussi les "3 derniers" (il n'y en a que 2) -> recent doit être IDENTIQUE à
// season ici.
if (!adv.recentVsSeason) throw new Error("❌ recentVsSeason manquant.");
if (adv.recentVsSeason.recentGames !== 2 || adv.recentVsSeason.seasonGames !== 2) {
  throw new Error(`❌ recentVsSeason.recentGames/seasonGames attendus 2/2, obtenu ${adv.recentVsSeason.recentGames}/${adv.recentVsSeason.seasonGames}.`);
}
if (adv.recentVsSeason.recentPtsFor !== adv.recentVsSeason.seasonPtsFor) {
  throw new Error(`❌ Avec seulement 2 matchs de championnat au total, "récent" et "saison" devraient être identiques : ${adv.recentVsSeason.recentPtsFor} vs ${adv.recentVsSeason.seasonPtsFor}.`);
}
console.log("✅ Tendance récente vs saison cohérente (identique à la saison quand il n'y a que 2 matchs de championnat au total).");

dom2.window.close();
server.close();
console.log("\n✅ scouting_advanced_stats_test.js : toutes les vérifications sont passées.");
})().catch(e => { console.error("ERREUR:", e); process.exit(1); });
