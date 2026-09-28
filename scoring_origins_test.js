// Origine des points (retour utilisateur 2026-09-24 / 2026-09-28 : "comment
// ils marquent leurs points") : chaque panier est classé par le moteur au
// moment du tir (engine.js, emptyStats/playPossession/freeThrows).
// Vérifie, pour chaque joueur : raquette + mi-distance + 3 pts + lancers =
// points ; passe décisive + action individuelle + lancers = points ;
// seconde chance et contre-attaque jamais au-delà des points ; contre-
// attaques recalibrées (~10 % des points) ; l'origine passe dans matchLog.
const E = require("./engine.js");
function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const KEYS = ["ptsPaint", "ptsMid", "pts3", "ptsSecondChance", "ptsTransition", "ptsAssisted", "ptsSolo"];
const league = E.generateLeague(E.generateStartingRoster("Alpha"));
const T = league.teams;
const tot = {}; let pts = 0, badType = 0, badCreation = 0, badSituation = 0, oreb = 0, dreb = 0;
for (let i = 0; i < 40; i++) {
  const a = T[i % T.length], b = T[(i + 3) % T.length];
  new E.MatchEngine(a, b).simulate();
  [...a.players, ...b.players].forEach(p => {
    const s = p.stats;
    if ((s.ptsPaint + s.ptsMid + s.pts3 + s.ftm) !== s.pts) badType++;
    if ((s.ptsAssisted + s.ptsSolo + s.ftm) !== s.pts) badCreation++;
    if (s.ptsSecondChance + s.ptsTransition > s.pts) badSituation++;
    KEYS.forEach(k => { tot[k] = (tot[k] || 0) + (s[k] || 0); });
    pts += s.pts; oreb += s.oreb; dreb += s.dreb;
  });
}
check(badType === 0, "par type de tir : raquette + mi-distance + 3 pts + lancers = points, pour chaque joueur");
check(badCreation === 0, "sur passe + action individuelle + lancers = points, pour chaque joueur");
check(badSituation === 0, "seconde chance + contre-attaque ne dépassent jamais les points (jamais cumulées)");
const pct = k => tot[k] / pts * 100;
console.log("   répartition :", KEYS.map(k => `${k} ${pct(k).toFixed(1)}%`).join(", "));
check(pct("ptsTransition") >= 6 && pct("ptsTransition") <= 15, `contre-attaques recalibrées : ${pct("ptsTransition").toFixed(1)} % des points (visé ~10 %)`);
check(pct("ptsSecondChance") >= 8 && pct("ptsSecondChance") <= 18, `secondes chances réduites : ${pct("ptsSecondChance").toFixed(1)} % des points (visé ~12 %, 20 % avant)`);
const orebPct = oreb / (oreb + dreb) * 100;
check(orebPct >= 22 && orebPct <= 36, `rebonds offensifs : ${orebPct.toFixed(1)} % des rebonds (visé ~29 %, 45 % avant)`);

const a = T[0], b = T[1];
new E.MatchEngine(a, b).simulate();
E.recordMatchStatsForTeam(a, 0, "championship");
const entry = a.players.map(p => p.matchLog[p.matchLog.length - 1]).find(Boolean);
check(entry && KEYS.every(k => typeof entry[k] === "number"), "l'origine des points est enregistrée dans matchLog");
const reloaded = E.playerFromSave(JSON.parse(JSON.stringify(E.serializePlayerRecord(a.players[0]))));
check(KEYS.every(k => reloaded.stats[k] === a.players[0].stats[k]), "survit à la sauvegarde (stats en cours de direct)");
console.log("\n✅ scoring_origins_test.js : tout est vert");
