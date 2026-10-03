// Classement de l'émission d'une ligue privée (retour utilisateur
// 2026-10-03 : « pb de classement dans le hoop show de lp ») : la vue du
// manager porte `members` avec les index LOCAUX, le classement doit se
// faire sur les clubs (teamIndices), victoires comprises.
const assert = require("assert");
const Shows = require("./shows.js");

const view = {
  id: "x", name: "Ligue spéciale",
  teamIndices: [0, 4000, 4001, 4002],
  members: [{ idx: 0 }, { idx: 4000 }, { idx: 4001 }, { idx: 4002 }],
  rounds: [
    { index: 0, matches: [
      { home: 0, away: 4000, played: true, scoreHome: 70, scoreAway: 60 },
      { home: 4001, away: 4002, played: true, scoreHome: 50, scoreAway: 65 },
    ] },
    { index: 1, matches: [
      { home: 4000, away: 0, played: true, scoreHome: 80, scoreAway: 75 },
      { home: 4002, away: 4001, played: false, scoreHome: null, scoreAway: null },
    ] },
  ],
};
const rows = Shows.lpStandingsInput(view);
assert.deepStrictEqual(rows.map(r => r.teamId).sort(), ["0", "4000", "4001", "4002"], JSON.stringify(rows));
const by = Object.fromEntries(rows.map(r => [r.teamId, r]));
assert.deepStrictEqual([by["0"].w, by["0"].l, by["4000"].w, by["4002"].w, by["4001"].l], [1, 1, 1, 1, 1]);
console.log("✅ Émission de ligue privée : classement sur les clubs, victoires comptées");
