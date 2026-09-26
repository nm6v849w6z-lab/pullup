// Fil d'actu du tableau de bord (retours utilisateur, 2026-09-26) :
// « Humeur à 71.41278800908984/100 [...] ne mets pas plus qu'une décimale »
// et, pour « Journée 6 : 5 résultats / A 34-45 B · C 66-48 D… » :
// « fais mieux que ça, un match une ligne ».
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/moteurbasket3.html", "utf8");
function grab(name) {
  const i = html.indexOf("function " + name + "(");
  if (i < 0) throw new Error("❌ " + name + " introuvable.");
  let depth = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") depth++;
    else if (html[k] === "}" && --depth === 0) return html.slice(i, k + 1);
  }
}
const league = {
  teams: [{ name: "Lyon" }, { name: "Santo Aleixo" }, { name: "Gotham Knights" }, { name: "Devil May Care" }, { name: "BC Diamant" }, { name: "Rennes" }],
  results: [
    { round: 5, home: 1, away: 2, scoreHome: 34, scoreAway: 45 },
    { round: 5, home: 3, away: 4, scoreHome: 66, scoreAway: 48 },
    { round: 5, home: 0, away: 5, scoreHome: 80, scoreAway: 77 },
    { round: 4, home: 0, away: 1, scoreHome: 70, scoreAway: 60 },
  ],
};
const myTeamIndex = 0;
eval(grab("dashFeedTidyNumbers") + "\n" + grab("dashFeedRoundResults") + "\nglobalThis.T = dashFeedTidyNumbers; globalThis.R = dashFeedRoundResults;");

const cases = [
  ["Humeur à 71.41278800908984/100. La salle devrait être pleine.", "Humeur à 71,4/100. La salle devrait être pleine."],
  ["Alchimie à 64.96/100.", "Alchimie à 65/100."],
  ["Humeur à 71/100.", "Humeur à 71/100."],
  ["Santo Aleixo 34-45 Gotham Knights", "Santo Aleixo 34-45 Gotham Knights"],
];
cases.forEach(([a, b]) => { if (T(a) !== b) throw new Error(`❌ « ${a} » → « ${T(a)} », attendu « ${b} ».`); });
console.log("✅ Fil d'actu : une décimale au plus (à la française), entiers et scores intacts.");

const rows = R({ key: "league_round_3", category: "ligue", title: "Journée 6 : 3 résultats", text: "Santo Aleixo 34-45 Gotham Knights · Devil May Care 66-48 BC Dia…" });
if (!rows || rows.length !== 3) throw new Error(`❌ 3 matchs attendus pour la journée 6 (entrée déjà enregistrée, texte tronqué), obtenu ${rows && rows.length}.`);
if (rows[0].home !== "Santo Aleixo" || rows[0].homePts !== 34 || rows[0].awayPts !== 45 || rows[0].away !== "Gotham Knights") throw new Error("❌ Premier match mal relu.");
if (!rows[2].homeMine || rows[2].awayMine) throw new Error("❌ Mon club devrait être repéré.");
if (R({ key: "season_start", category: "ligue", title: "Le championnat est lancé" }) !== null) throw new Error("❌ Seules les entrées de résultats de journée sont concernées.");
if (R({ key: "league_round_9", category: "ligue", title: "Journée 12 : 5 résultats" }) !== null) throw new Error("❌ Journée inconnue : repli sur le texte.");
console.log("✅ Résultats de journée : tous les matchs relus (un par ligne), y compris pour une entrée déjà enregistrée.");
